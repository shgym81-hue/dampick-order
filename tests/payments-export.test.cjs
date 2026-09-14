const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DampickPaymentsExport: exporter } = require('../assets/js/payments-export.js');
const { DampickPaymentsVisibility: visibility } = require('../assets/js/payments-visibility.js');
const { DampickDelivery: delivery } = require('../assets/js/delivery-schedule.js');

function request(overrides = {}) {
  return {
    id: 'r1', request_code: 'DP-R1', order_numbers: ['DP-O1'], nickname_snapshot: '사과맘',
    receipt_method: 'home', payment_status: '입금 확인 대기', fulfillment_status: '배송 준비 중',
    delivery_phone: '010-1234-5678', delivery_address: '서울시 마포구 1', entrance_info: '1234#',
    delivery_request: '문 앞에 놓아주세요', product_amount: 15000, delivery_fee: 500, final_amount: 15500,
    created_at: '2026-09-14T01:00:00Z',
    checkout_request_items: [
      { order_number: 'DP-O1', product_name: '사과', quantity: 2, unit_name: '개', unit_price: 5000, line_total: 10000, pickup_date: '2026-09-14' },
      { order_number: 'DP-O1', product_name: '우유', quantity: 1, unit_name: '팩', unit_price: 5000, line_total: 5000, pickup_date: '2026-09-15' }
    ],
    ...overrides
  };
}

test('export includes unpaid and paid pending home requests only', () => {
  const requests = [
    request(),
    request({ id: 'r2', request_code: 'DP-R2', payment_status: '결제 완료' }),
    request({ id: 'r3', receipt_method: 'pickup' }),
    request({ id: 'r4', fulfillment_status: '배송 완료' }),
    request({ id: 'r5', fulfillment_status: 'delivered' })
  ];
  const rows = exporter.buildRows(requests, [{ order_number: 'DP-O1', notice: '냉장 보관' }], delivery, visibility);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(row => row['결제 상태']), ['미결제', '결제 완료']);
});

test('export row contains delivery contact, items, amounts and schedule', () => {
  const [row] = exporter.buildRows([request()], [{ order_number: 'DP-O1', notice: '냉장 보관', customers: { memo: 'VIP 고객' } }], delivery, visibility);
  assert.equal(row['주문번호'], 'DP-O1');
  assert.equal(row['닉네임'], '사과맘');
  assert.equal(row['고객명'], '사과맘');
  assert.equal(row['휴대폰 번호'], '010-1234-5678');
  assert.equal(row['배송지 주소'], '서울시 마포구 1');
  assert.equal(row['공동현관 출입 정보'], '1234#');
  assert.equal(row['배송 요청사항'], '문 앞에 놓아주세요');
  assert.equal(row['주문 상품'], '사과 / 우유');
  assert.equal(row['상품별 수량'], '사과 2개 x 5,000원, 우유 1팩 x 5,000원');
  assert.equal(row['총 상품 금액'], 15000);
  assert.equal(row['배송비'], 500);
  assert.equal(row['총 결제 금액'], 15500);
  assert.match(row['배송 예정일'], /수요일 새벽 배송/);
  assert.equal(row['관리자 메모'], 'VIP 고객 / 냉장 보관');
  assert.deepEqual(Object.keys(row), exporter.COLUMNS);
});

test('download creates a dated xlsx workbook with expected columns', () => {
  const calls = {};
  const XLSX = { utils: {
    json_to_sheet(rows, options) { calls.rows = rows; calls.header = options.header; return {}; },
    book_new() { return {}; },
    book_append_sheet(book, sheet, name) { calls.sheetName = name; }
  }, writeFile(book, name) { calls.filename = name; } };
  const name = exporter.download([{ 주문번호: 'DP-O1' }], XLSX, new Date(2026, 8, 14));
  assert.equal(name, '담픽_문고리배송_미완료목록_2026-09-14.xlsx');
  assert.equal(calls.filename, name);
  assert.equal(calls.sheetName, '문고리 배송 미완료');
  assert.deepEqual(calls.header, exporter.COLUMNS);
  assert.equal(exporter.download([], XLSX), null);
});
