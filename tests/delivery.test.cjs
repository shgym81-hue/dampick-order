const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DampickDelivery: delivery } = require('../assets/js/delivery-schedule.js');
test('Mon/Tue and Wed/Thu/Fri map to separate actual delivery dates', () => {
  for (const date of ['2026-08-31', '2026-09-01']) assert.equal(delivery.schedule(date).key, '2026-09-02:DAWN');
  for (const date of ['2026-09-02', '2026-09-03', '2026-09-04']) assert.equal(delivery.schedule(date).key, '2026-09-04:PM');
  assert.equal(delivery.schedule('2026-09-07').key, '2026-09-09:DAWN');
});
test('weekends, missing and invalid dates cannot be shipped', () => {
  for (const date of ['', null, 'invalid', '2026-02-30', '2026-09-05', '2026-09-06']) assert.equal(delivery.schedule(date), null);
});
test('selection rejects different weeks, different delivery slots and unknown dates', () => {
  const groups = dates => dates.map(pickupDate => ({ pickupDate }));
  assert.equal(delivery.validate(groups(['2026-08-31', '2026-09-01'])), true);
  assert.equal(delivery.validate(groups(['2026-09-02', '2026-09-04'])), true);
  for (const dates of [[], ['2026-09-01', '2026-09-02'], ['2026-08-31', '2026-09-07'], ['2026-08-31', ''], ['2026-09-05']]) assert.equal(delivery.validate(groups(dates)), false);
});
