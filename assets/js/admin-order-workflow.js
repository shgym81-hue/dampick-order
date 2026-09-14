(function (root) {
  "use strict";
  function paymentCompleted(status) {
    const value = String(status || "");
    return value.includes("결제 완료") || value.includes("입금 완료") || value.includes("카드 자동 결제 완료");
  }
  function state(order) {
    const paid = paymentCompleted(order?.payment_status);
    const pickedUp = Boolean(order?.completed_at) || /픽업 완료|배송 완료/.test(String(order?.order_status || ""));
    return {paid, pickedUp, paymentDisabled: paid || pickedUp, pickupDisabled: !paid || pickedUp};
  }
  function pickupControl(order, selectedCount) {
    const current = state(order);
    if (current.pickedUp) return { enabled: false, message: "픽업 완료 처리된 주문입니다." };
    if (Number(selectedCount || 0) < 1) return { enabled: false, message: "픽업 완료할 상품을 먼저 체크해주세요." };
    if (!current.paid) return { enabled: false, message: "결제 완료 후 픽업 완료 처리할 수 있습니다." };
    return { enabled: true, message: "선택한 상품을 확인한 후 픽업 완료 처리해주세요." };
  }
  root.DampickOrderWorkflow = Object.freeze({paymentCompleted, state, pickupControl});
})(typeof window === "undefined" ? module.exports : window);
