const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { DampickDelivery } = require('../assets/js/delivery-schedule.js');

const source = fs.readFileSync(path.join(__dirname, '../assets/js/index.js'), 'utf8');
function section(start, end) {
  return source.slice(source.indexOf(`function ${start}(`), source.indexOf(`function ${end}(`));
}

function render(items, today = '2026-09-01T12:00:00') {
  const NativeDate = Date;
  class FixedDate extends NativeDate {
    constructor(value) { super(value === undefined ? today : value); }
    static now() { return new NativeDate(today).getTime(); }
  }
  const results = { innerHTML: '', querySelectorAll: () => [] };
  const context = {
    window: { DampickDelivery }, results, items, Date: FixedDate,
    document: { querySelectorAll: () => [] },
    nicknameInput: { value: '테스트' }, checkoutBusy: false,
    escapeHtml: value => String(value),
    formatWon: value => `${value}원`, formatDate: value => value,
    getReceiptLabel: () => '', getPaymentLabel: () => '',
    syncSelectAll: () => {}
  };
  vm.createContext(context);
  vm.runInContext([
    section('normalizedStatus', 'buildProductGroups'),
    section('buildProductGroups', 'getPickupWeekday'),
    section('getPickupWeekday', 'formatCustomerDeliveryLabel'),
    section('renderProductGroups', 'handleProductSelection'),
    'productGroups = buildProductGroups([{ items }]); renderProductGroups();'
  ].join('\n'), context);
  return results.innerHTML;
}

function item(id, date) {
  return { item_id: id, product_id: id, product_name: `상품${id}`,
    pickup_date: date, quantity: 1, unit_price: 1000, line_total: 1000 };
}

test('same pickup date shares one card and blue label shows pickup date', () => {
  const html = render([item('a', '2026-09-17'), item('b', '2026-09-17')]);
  assert.equal([...html.matchAll(/class="delivery-bucket"/g)].length, 1);
  assert.match(html, /delivery-date-pill">📅 픽업 2026-09-17 \(목\)/);
  assert.match(html, /상품a/);
  assert.match(html, /상품b/);
  assert.doesNotMatch(html, /delivery-date-pill">[^<]*배송/);
});

test('customer name appears once above cards and pickup group replaces repeated names', () => {
  const html = render([item('mon', '2026-09-14'), item('thu', '2026-09-17')]);
  assert.equal([...html.matchAll(/<strong>테스트<\/strong>님의 주문 상품/g)].length, 1);
  assert.doesNotMatch(html, /delivery-customer/);
  assert.doesNotMatch(html, /👤/);
  assert.equal([...html.matchAll(/월·화 픽업 상품/g)].length, 1);
  assert.equal([...html.matchAll(/수·목·금 픽업 상품/g)].length, 1);
});

test('different pickup dates make separate cards even within one delivery group', () => {
  const html = render([item('mon', '2026-09-14'), item('tue', '2026-09-15')]);
  assert.equal([...html.matchAll(/class="delivery-bucket"/g)].length, 2);
  assert.match(html, /data-bucket="2026-09-14"/);
  assert.match(html, /data-bucket="2026-09-15"/);
  assert.equal(DampickDelivery.validate([{ pickupDate: '2026-09-14' }, { pickupDate: '2026-09-15' }]), true);
});

test('delivery selection rules remain independent of pickup-date cards', () => {
  const groups = dates => dates.map(pickupDate => ({ pickupDate }));
  assert.equal(DampickDelivery.validate(groups(['2026-09-16', '2026-09-17', '2026-09-18'])), true);
  assert.equal(DampickDelivery.validate(groups(['2026-09-15', '2026-09-16'])), false);
  assert.equal(DampickDelivery.schedule('2026-09-15').label.includes('수요일'), true);
  assert.equal(DampickDelivery.schedule('2026-09-17').label.includes('금요일'), true);
});

test('each pickup card tracks its own select-all and checkout button', () => {
  const dates = ['2026-09-14', '2026-09-15', '2026-09-16'];
  const checks = dates.map((date, index) => ({ checked: index < 2, dataset: { groupIndex: String(index) } }));
  const controls = dates.map(pickupDate => ({ dataset: { pickupDate } }));
  const buttons = dates.map(pickupDate => ({ dataset: { pickupDate } }));
  const context = {
    productGroups: dates.map(pickupDate => ({ pickupDate })), checkoutBusy: false,
    document: { querySelectorAll: selector => ({
      '.product-check:not(:disabled)': checks,
      '.bucket-select-all': controls,
      '.bucket-checkout': buttons
    })[selector] }
  };
  vm.createContext(context);
  vm.runInContext([
    section('getPickupDateKey', 'formatCustomerDeliveryLabel'),
    section('syncSelectAll', 'getSelectedGroups'),
    'syncSelectAll();'
  ].join('\n'), context);
  assert.deepEqual(controls.map(control => control.checked), [true, true, false]);
  assert.deepEqual(buttons.map(button => button.disabled), [false, false, true]);
  assert.ok(buttons.every(button => button.textContent === '문고리 배송 결제하기'));
});

test('past and invalid pickup dates are unavailable using the browser local date', () => {
  const context = { Date };
  vm.createContext(context);
  vm.runInContext(section('getPickupDateKey', 'formatCustomerDeliveryLabel'), context);
  const today = new Date('2026-09-26T18:30:00');
  assert.equal(context.isPickupDateAvailable('2026-09-24', today), false);
  assert.equal(context.isPickupDateAvailable('2026-09-26', today), true);
  assert.equal(context.isPickupDateAvailable('2026-09-27', today), true);
  assert.equal(context.isPickupDateAvailable('', today), false);
  assert.equal(context.isPickupDateAvailable('not-a-date', today), false);
  assert.equal(context.isPickupDateAvailable('2026-02-30', today), false);
});

test('past unrequested card is disabled, marked unavailable and has no checkout controls', () => {
  const html = render([item('past', '2026-09-24')], '2026-09-26T12:00:00');
  assert.match(html, /delivery-state-pill is-unavailable">배송 불가/);
  assert.match(html, /class="product-check"[\s\S]*?disabled/);
  assert.doesNotMatch(html, /bucket-select-all/);
  assert.doesNotMatch(html, /bucket-checkout/);
});

test('expired checked data is excluded defensively from selected groups and amount', () => {
  const context = {
    Date,
    productGroups: [
      { pickupDate: '2026-09-24', lineTotal: 9000 },
      { pickupDate: '2026-09-28', lineTotal: 11000 }
    ],
    document: { querySelectorAll: () => [
      { dataset: { groupIndex: '0' } },
      { dataset: { groupIndex: '1' } }
    ] }
  };
  vm.createContext(context);
  vm.runInContext([
    section('getPickupDateKey', 'formatCustomerDeliveryLabel'),
    section('getSelectedGroups', 'getSelectedItemIds'),
    section('getProductAmount', 'getReceiptMethod'),
    'Date = class extends Date { constructor(value) { super(value === undefined ? "2026-09-26T12:00:00" : value); } };'
  ].join('\n'), context);
  assert.equal(context.getSelectedGroups().length, 1);
  assert.equal(context.getProductAmount(), 11000);
});

test('customer history keeps only current and previous month by pickup date', () => {
  const context = { Date };
  vm.createContext(context);
  vm.runInContext([
    section('normalizedStatus', 'buildProductGroups'),
    section('buildProductGroups', 'getPickupWeekday'),
    section('getPickupDateKey', 'formatCustomerDeliveryLabel')
  ].join('\n'), context);
  const order = dates => [{ order_date: '2020-01-01', items: dates.map((pickup_date, id) => ({ id, pickup_date })) }];
  assert.deepEqual(
    context.filterRecentOrders(order(['2026-09-24', '2026-08-15', '2026-07-31']), new Date('2026-09-26T12:00:00'))[0].items.map(item => item.pickup_date),
    ['2026-09-24', '2026-08-15']
  );
  assert.deepEqual(
    context.filterRecentOrders(order(['2026-10-01', '2026-09-20', '2026-08-31']), new Date('2026-10-03T12:00:00'))[0].items.map(item => item.pickup_date),
    ['2026-10-01', '2026-09-20']
  );
});

test('history date falls back to order date and hides missing or invalid dates', () => {
  const context = { Date };
  vm.createContext(context);
  vm.runInContext([
    section('normalizedStatus', 'buildProductGroups'),
    section('getPickupDateKey', 'formatCustomerDeliveryLabel')
  ].join('\n'), context);
  const today = new Date('2026-09-26T12:00:00');
  assert.equal(context.isRecentOrderItem({ order_date: '2026-08-02' }, { pickup_date: '' }, today), true);
  assert.equal(context.isRecentOrderItem({ created_at: '2026-09-01T09:00:00Z' }, { pickup_date: 'bad' }, today), true);
  assert.equal(context.isRecentOrderItem({}, { pickup_date: 'bad' }, today), false);
  assert.equal(context.filterRecentOrders([{ items: [{ pickup_date: '2026-07-31' }] }], today).length, 0);
});

test('completed delivery and pickup statuses render on customer product cards', () => {
  const delivered = item('delivery', '2026-09-24');
  delivered.checkout = { fulfillment_status: '배송 완료', payment_status: '결제 완료' };
  const deliveryHtml = render([delivered], '2026-09-26T12:00:00');
  assert.match(deliveryHtml, /status-badge is-assigned">배송 완료/);

  const pickupContext = { Date };
  vm.createContext(pickupContext);
  vm.runInContext([
    section('normalizedStatus', 'buildProductGroups'),
    section('buildProductGroups', 'getPickupWeekday')
  ].join('\n'), pickupContext);
  const groups = pickupContext.buildProductGroups([{ order_status: '픽업 완료', items: [item('pickup', '2026-09-24')] }]);
  assert.equal(groups[0].completionStatus, '픽업 완료');
  const completedAtGroups = pickupContext.buildProductGroups([{
    completed_at: '2026-09-24T10:00:00Z',
    items: [{ ...item('pickup2', '2026-09-24'), checkout: { receipt_method: 'pickup' } }]
  }]);
  assert.equal(completedAtGroups[0].completionStatus, '픽업 완료');
});

test('unfinished recent items remain selectable while old items are removed', () => {
  const context = { Date };
  vm.createContext(context);
  vm.runInContext([
    section('normalizedStatus', 'buildProductGroups'),
    section('buildProductGroups', 'getPickupWeekday'),
    section('getPickupDateKey', 'formatCustomerDeliveryLabel')
  ].join('\n'), context);
  const orders = [{ items: [item('recent', '2026-09-28'), item('old', '2026-07-31')] }];
  const recent = context.filterRecentOrders(orders, new Date('2026-09-26T12:00:00'));
  const groups = context.buildProductGroups(recent);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].productName, '상품recent');
  assert.equal(groups[0].completionStatus, '');
});
