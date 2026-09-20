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

function render(items) {
  const results = { innerHTML: '', querySelectorAll: () => [] };
  const context = {
    window: { DampickDelivery }, results, items,
    document: { querySelectorAll: () => [] },
    nicknameInput: { value: '테스트' }, checkoutBusy: false,
    escapeHtml: value => String(value),
    formatWon: value => `${value}원`, formatDate: value => value,
    getReceiptLabel: () => '', getPaymentLabel: () => '',
    syncSelectAll: () => {}
  };
  vm.createContext(context);
  vm.runInContext([
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
