const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

test('HTML local references and manifest icons exist', () => {
  for (const file of fs.readdirSync(root).filter(f => f.endsWith('.html'))) {
    const html = read(file);
    assert.equal(/<style>|<script>/.test(html), false, file);
    for (const match of html.matchAll(/(?:src|href)="(\.\/[^"?#]+)(?:[?#][^"]*)?"/g)) {
      assert.ok(fs.existsSync(path.join(root, match[1])), `${file}: ${match[1]}`);
    }
    for (const match of html.matchAll(/https:\/\/shgym81-hue\.github\.io\/dampick-order\/([^"?]+\.png)/g)) {
      assert.ok(fs.existsSync(path.join(root, match[1])), match[1]);
    }
  }
  for (const icon of JSON.parse(read('manifest.json')).icons) {
    assert.ok(fs.existsSync(path.join(root, icon.src)), icon.src);
  }
});

test('all browser JavaScript parses', () => {
  for (const file of fs.readdirSync(path.join(root, 'assets/js'))) {
    assert.equal(/\?{3,}/.test(read('assets/js/' + file)), false, `${file}: broken text encoding`);
    new vm.Script(read('assets/js/' + file), { filename: file });
  }
  new vm.Script(read('service-worker.js'));
});

test('customer checkout completion keeps details and uses emphasized success styles', () => {
  const customer = read('assets/js/index.js');
  const styles = read('assets/css/index.css');
  const html = read('index.html');
  for (const text of ['문고리 배송 신청이 완료되었습니다.', '신청번호:', '선택 상품 합계:', '배송비:', '이번 결제금액:', '하나은행 412-910821-25107', '예금주 담픽']) {
    assert.match(customer, new RegExp(text));
  }
  assert.ok(html.indexOf('id="checkoutComplete"') < html.indexOf('id="checkoutCard"'));
  assert.equal([...html.matchAll(/id="checkoutComplete"/g)].length, 1);
  assert.match(customer, /class="complete-title"/);
  assert.match(customer, /class="complete-details"/);
  assert.match(customer, /class="complete-amount"/);
  assert.match(customer, /let lastCheckoutResult = null/);
  assert.match(customer, /else renderCheckoutComplete\(\)/);
  assert.match(styles, /\.complete-box\s*\{[^}]*border:\s*2px solid #22c55e[^}]*background:\s*#ecfdf3/s);
  assert.match(styles, /\.complete-title\s*\{[^}]*color:\s*#15803d[^}]*font-size:\s*clamp\(18px,/s);
});

test('customer checkout success box rerenders from memory after order refresh', () => {
  const source = read('assets/js/index.js');
  const functions = source.slice(source.indexOf('function clearCheckoutComplete()'), source.indexOf('async function lookupOrder('));
  const box = { innerHTML: '', classList: { shown: false, add() { this.shown = true; }, remove() { this.shown = false; } } };
  const context = {
    document: { getElementById: () => box },
    formatWon: value => `${Number(value).toLocaleString('ko-KR')}원`,
    escapeHtml: value => String(value)
  };
  vm.createContext(context);
  vm.runInContext(`let lastCheckoutResult = { request_code: 'DP-123', product_amount: 32200, delivery_fee: 500, final_amount: 32700 }; ${functions} renderCheckoutComplete();`, context);
  assert.equal(box.classList.shown, true);
  assert.match(box.innerHTML, /문고리 배송 신청이 완료되었습니다/);
  assert.match(box.innerHTML, /DP-123/);
  assert.match(box.innerHTML, /32,200원/);
  assert.match(box.innerHTML, /500원/);
  assert.match(box.innerHTML, /32,700원/);
  assert.match(box.innerHTML, /하나은행 412-910821-25107, 예금주 담픽/);
});

test('inventory migration is transactional and non-destructive', () => {
  const sql = read('database/003_inventory_management.sql');
  const admin = read('assets/js/admin.js');
  assert.match(sql, /add column if not exists stock_quantity integer not null default 0/i);
  assert.match(sql, /add column if not exists stock_deducted boolean not null default false/i);
  assert.match(sql, /create_order_with_stock/);
  assert.match(sql, /cancel_order_items_with_stock/);
  assert.match(sql, /delete_order_with_stock/);
  assert.match(sql, /update_order_item_quantity_with_stock/);
  assert.match(sql, /for update/i);
  assert.doesNotMatch(sql, /drop\s+table/i);
  for (const rpc of ['create_order_with_stock', 'cancel_order_items_with_stock', 'delete_order_with_stock', 'update_order_item_quantity_with_stock']) {
    assert.match(admin, new RegExp(`rpc\\("${rpc}"`));
  }
  assert.doesNotMatch(admin, /from\("orders"\)\s*\.insert/);
});

test('payment configuration rejects empty, placeholder and secret keys', () => {
  const context = { window: {} };
  vm.runInNewContext(read('assets/js/payment-config.js'), context);
  const valid = context.window.isDampickTossKeyConfigured;
  assert.equal(valid(context.window.DAMPICK_PAYMENT_CONFIG.tossClientKey), false);
  for (const key of ['', 'test_ck_', 'test_ck_본인에게_발급된_클라이언트키', 'test_ck_YOURKEY', 'test_sk_abc123', 'live_sk_abc123', 'test_ck_abc xyz']) {
    assert.equal(valid(key), false, key);
  }
  assert.equal(valid('test_ck_abc123XYZ'), true);
  assert.equal(valid('live_ck_abc123XYZ'), true);
});

test('invalid callback amounts never invoke payment approval', async () => {
  for (const amount of ['', '0', '-1', '99', '100.5', 'NaN', 'Infinity', '9007199254740992']) {
    let calls = 0;
    const elements = new Map();
    const context = {
      window: { location: { search: '?paymentKey=test&orderId=test&amount=' + amount }, dampickSupabase: { functions: { invoke: async () => { calls++; return { data: { success: true } }; } } } },
      document: { getElementById: id => { if (!elements.has(id)) elements.set(id, {}); return elements.get(id); } },
      localStorage: { getItem: () => '' }, URLSearchParams, console
    };
    vm.runInNewContext(read('assets/js/payment-success.js'), context);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls, 0, amount);
    assert.match(elements.get('status').textContent, /올바르지/);
  }
});

test('delivery display charges 500 won at exactly 40,000 won', () => {
  const source = read('assets/js/index.js');
  const displayFunction = source.slice(source.indexOf('function updateCheckoutDisplay()'), source.indexOf('async function submitCheckout()'));
  for (const [amount, count, expected] of [[0, 0, 0], [39999, 1, 500], [40000, 1, 500], [40001, 1, 0]]) {
    const elements = new Map();
    const context = {
      document: { getElementById: id => { if (!elements.has(id)) elements.set(id, {}); return elements.get(id); } },
      getSelectedGroups: () => Array(count).fill({}), getProductAmount: () => amount,
      getPaymentMethod: () => 'bank_transfer', getFirstSelectedDeliveryGroup: () => '2026-09-02:DAWN',
      getDeliveryGroupLabel: () => '2026-09-02 수요일 새벽 배송', checkoutBusy: false,
      isGroupSelectable: () => true,
      FREE_DELIVERY_THRESHOLD: 40000, HOME_DELIVERY_FEE: 500,
      formatWon: value => `${value}원`, submitCheckoutButton: {}, stickyCheckoutButton: {},
      stickyCheckout: {classList:{toggle(){}}}, productGroups: [{}], setProgress() {}
    };
    vm.runInNewContext(displayFunction + '\nupdateCheckoutDisplay();', context);
    assert.equal(elements.get('deliveryFeeText').textContent, count && !expected ? '무료' : `${expected}원`);
    assert.equal(elements.get('finalAmountText').textContent, `${amount + expected}원`);
    assert.equal(context.submitCheckoutButton.disabled, count === 0);
  }
});

test('valid callback invokes approval and waits for server success', async () => {
  let submitted;
  const elements = new Map();
  const context = {
    window: { location: { search: '?paymentKey=test&orderId=DP-test&amount=100' }, dampickSupabase: { functions: { invoke: async (name, args) => { submitted = { name, body: args.body }; return { data: { success: true, amount: 100 } }; } } } },
    document: { getElementById: id => { if (!elements.has(id)) elements.set(id, {}); return elements.get(id); } },
    localStorage: { getItem: () => '' }, URLSearchParams, console
  };
  vm.runInNewContext(read('assets/js/payment-success.js'), context);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(submitted.name, 'confirm-toss-payment');
  assert.equal(submitted.body.amount, 100);
  assert.equal(submitted.body.orderId, 'DP-test');
  assert.equal(elements.get('status').className, 'status success');
});
