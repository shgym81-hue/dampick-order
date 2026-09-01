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
