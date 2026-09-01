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
  root.DampickOrderWorkflow = Object.freeze({paymentCompleted, state});
})(typeof window === "undefined" ? module.exports : window);
