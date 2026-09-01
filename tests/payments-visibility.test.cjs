const {test} = require('node:test');
const assert = require('node:assert/strict');
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
    {id:'r1', request_status:'취소'},
    {id:'r2', request_status:'신청 취소'},
    {id:'r3', request_status:'신청', payment_status:'결제 실패'},
    {id:'r4', request_status:'신청', payment_status:'카드 결제 실패'},
    {request_status:'신청', payment_status:'입금 확인 대기'}
  ]) assert.equal(visibility.isActiveRequest(request), false);
});

test('completed payment and delivery request remains visible', () => {
  assert.equal(visibility.isActiveRequest({request_code:'DP-1', request_status:'신청', payment_status:'결제 완료'}), true);
});
