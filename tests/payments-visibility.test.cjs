const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {DampickPaymentsVisibility: visibility} = require('../assets/js/payments-visibility.js');

test('order-only customer is excluded from payment and delivery management', () => {
  assert.equal(visibility.hasActiveRequest({orders:[{id:'o1'}], requests:[]}), false);
});

test('submitted checkout request makes customer visible', () => {
  assert.equal(visibility.hasActiveRequest({orders:[{id:'o1'}], requests:[{
    id:'r1', request_status:'신청', payment_status:'입금 확인 대기', receipt_method:'home'
  }]}), true);
});

test('cancelled and failed requests stay hidden', () => {
  for (const request of [
    {id:'r1', receipt_method:'home', request_status:'취소'},
    {id:'r2', receipt_method:'home', request_status:'신청 취소'},
    {id:'r3', receipt_method:'home', request_status:'신청', payment_status:'결제 실패'},
    {id:'r4', receipt_method:'home', request_status:'신청', payment_status:'카드 결제 실패'},
    {receipt_method:'home', request_status:'신청', payment_status:'입금 확인 대기'}
  ]) assert.equal(visibility.isActiveRequest(request), false);
});

test('completed payment and delivery request remains visible', () => {
  assert.equal(visibility.isActiveRequest({request_code:'DP-1', receipt_method:'home', request_status:'신청', payment_status:'결제 완료'}), true);
});

test('delivered home requests leave payment management', () => {
  for (const fulfillment_status of ['배송 완료', '배송완료', 'completed', 'delivery_completed', 'delivered']) {
    assert.equal(visibility.isActiveRequest({id:'r1', receipt_method:'home', fulfillment_status}), false);
  }
  for (const fulfillment_status of ['배송 대기', '입금 확인 대기', '배송 준비 중']) {
    assert.equal(visibility.isActiveRequest({id:'r1', receipt_method:'home', fulfillment_status}), true);
  }
});

test('pickup and other receipt methods never make a customer visible', () => {
  for (const receipt_method of ['pickup', 'store', undefined]) {
    assert.equal(visibility.hasActiveRequest({requests:[{id:'r1', receipt_method, request_status:'신청'}]}), false);
  }
});

test('mixed customer projects only linked home items and their amount', () => {
  const customer = {orders:[{order_items:[{id:'apple', product_name:'사과'}, {id:'pear', product_name:'배'}]}], requests:[
    {id:'home', receipt_method:'home', checkout_request_items:[{order_item_id:'apple', product_name:'사과', quantity:1, line_total:5000}]},
    {id:'pickup', receipt_method:'pickup', checkout_request_items:[{order_item_id:'pear', product_name:'배', quantity:1, line_total:7000}]}
  ]};
  assert.equal(visibility.hasActiveRequest(customer), true);
  assert.deepEqual(visibility.homeItems(customer).map(({item}) => item.product_name), ['사과']);
  assert.equal(visibility.homeProductAmount(customer), 5000);
});

test('payment cards use linked request items while admin still loads all visible orders', () => {
  const payments = fs.readFileSync(path.join(__dirname, '../assets/js/payments.js'), 'utf8');
  const admin = fs.readFileSync(path.join(__dirname, '../assets/js/admin.js'), 'utf8');
  const customerCard = payments.slice(payments.indexOf('function renderCustomer('), payments.indexOf('function renderOrder('));
  const requestCard = payments.slice(payments.indexOf('function renderRequest('), payments.indexOf('async function handleAction('));
  assert.doesNotMatch(customerCard, /customer\.orders|renderOrder\(/);
  assert.match(requestCard, /request\.checkout_request_items/);
  assert.match(admin, /\.from\("orders"\)/);
  assert.match(admin, /return order\.is_visible !== false/);
});

test('rendered mixed customer card contains only the home-requested apple and its total', () => {
  const source = fs.readFileSync(path.join(__dirname, '../assets/js/payments.js'), 'utf8');
  const parts = [
    source.slice(source.indexOf('function getCustomerState('), source.indexOf('function getFilteredCustomers(')),
    source.slice(source.indexOf('function renderCustomer('), source.indexOf('function renderOrder(')),
    source.slice(source.indexOf('function renderItem('), source.indexOf('function renderRequest(')),
    source.slice(source.indexOf('function renderRequest('), source.indexOf('async function handleAction('))
  ];
  const customer = {nickname:'테스트', orders:[{order_items:[{product_name:'사과'}, {product_name:'배'}]}], requests:[
    {id:'home', receipt_method:'home', payment_status:'결제 완료', fulfillment_status:'배송 준비 중', product_amount:5000, final_amount:5500, delivery_fee:500,
      checkout_request_items:[{product_name:'사과', quantity:1, unit_name:'개', unit_price:5000, line_total:5000}]},
    {id:'pickup', receipt_method:'pickup', checkout_request_items:[{product_name:'배', quantity:1, line_total:7000}]}
  ]};
  const context = {
    window:{DampickPaymentsVisibility:visibility}, customer,
    getActiveRequests:c=>visibility.activeHomeRequests(c), isPaymentCompleted:s=>s==='결제 완료',
    isFulfillmentCompleted:s=>s==='배송 완료', formatWon:n=>`${Number(n).toLocaleString('ko-KR')}원`,
    escapeHtml:s=>String(s ?? ''), getReceiptLabel:()=> '문고리 배송', getPaymentLabel:()=> '계좌이체',
    getFulfillmentStatusLabel:s=>String(s || '').includes('배송 준비') ? '배송 대기' : String(s || ''),
    formatDate:()=>'', formatDateTime:()=>''
  };
  const html = vm.runInNewContext(parts.join('\n') + '\nrenderCustomer(customer)', context);
  assert.match(html, /사과/);
  assert.match(html, /5,000원/);
  assert.match(html, /배송 대기/);
  assert.doesNotMatch(html, /배송 준비|delivery-ready/);
  assert.match(html, /delivery-complete/);
  assert.match(html, /변경 신청 취소/);
  assert.doesNotMatch(html, /class="item-name">\s*배\s*<|7,000원|기본: 매장 픽업/);
});

test('home delivery cards skip ready step and enable completion immediately after payment', () => {
  const payments = fs.readFileSync(path.join(__dirname, '../assets/js/payments.js'), 'utf8');
  const requestCard = payments.slice(payments.indexOf('function renderRequest('), payments.indexOf('async function handleAction('));
  const page = fs.readFileSync(path.join(__dirname, '../payments.html'), 'utf8');
  assert.doesNotMatch(requestCard, /delivery-ready|배송 준비/);
  assert.match(requestCard, /delivery-complete/);
  assert.match(requestCard, /\$\{isPaid && !isCompleted[\s\S]*?\? ""[\s\S]*?: "disabled"\}/);
  assert.doesNotMatch(page, /배송 준비 신청/);
  assert.match(page, /결제 완료 신청/);
});
