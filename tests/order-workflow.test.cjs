const {test} = require('node:test');
const assert = require('node:assert/strict');
const {DampickOrderWorkflow: workflow} = require('../assets/js/admin-order-workflow.js');
test('new order enables payment and blocks pickup', () => {
  assert.deepEqual(workflow.state({payment_status:'고객 선택 대기',order_status:'주문 접수'}), {paid:false,pickedUp:false,paymentDisabled:false,pickupDisabled:true});
});
test('paid order advances to pickup', () => {
  for (const payment_status of ['결제 완료','입금 완료','카드 자동 결제 완료'])
    assert.deepEqual(workflow.state({payment_status,order_status:'픽업 가능'}), {paid:true,pickedUp:false,paymentDisabled:true,pickupDisabled:false});
});
test('completed order locks both steps', () => {
  assert.deepEqual(workflow.state({payment_status:'결제 완료',order_status:'픽업 완료',completed_at:'2026-09-01'}), {paid:true,pickedUp:true,paymentDisabled:true,pickupDisabled:true});
});
test('pickup requires a checked item and completed payment', () => {
  const unpaid = {payment_status:'입금 대기',order_status:'주문 접수'};
  assert.deepEqual(workflow.pickupControl(unpaid, 0), {enabled:false,message:'픽업 완료할 상품을 먼저 체크해주세요.'});
  assert.deepEqual(workflow.pickupControl(unpaid, 1), {enabled:false,message:'결제 완료 후 픽업 완료 처리할 수 있습니다.'});
  assert.deepEqual(workflow.pickupControl({payment_status:'결제 완료',order_status:'픽업 가능'}, 1), {enabled:true,message:'선택한 상품을 확인한 후 픽업 완료 처리해주세요.'});
});
