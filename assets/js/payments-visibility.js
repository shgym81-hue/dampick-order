/* 결제·배송 관리에는 고객이 직접 제출한 유효한 신청만 표시합니다. */
(function (root) {
  "use strict";
  const hiddenStatuses = new Set(["취소", "신청 취소", "결제 실패", "카드 결제 실패"]);
  function isDeliveryCompleted(status) {
    const value = String(status || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
    return value.includes("배송완료") || ["delivered", "complete", "completed", "deliverycompleted"].includes(value);
  }
  function isActiveRequest(request) {
    if (!request || request.receipt_method !== "home" || !String(request.id || request.request_code || "").trim()) return false;
    if (isDeliveryCompleted(request.fulfillment_status)) return false;
    return ![request.request_status, request.payment_status]
      .some(value => hiddenStatuses.has(String(value || "").trim()));
  }
  function activeHomeRequests(customer) {
    return Array.isArray(customer?.requests) ? customer.requests.filter(isActiveRequest) : [];
  }
  function homeItems(customer) {
    return activeHomeRequests(customer).flatMap(request =>
      (Array.isArray(request.checkout_request_items) ? request.checkout_request_items : [])
        .map(item => ({ item, request })));
  }
  function homeProductAmount(customer) {
    return homeItems(customer).reduce((total, { item }) =>
      total + Number(item.line_total ?? Number(item.unit_price || 0) * Number(item.quantity || 0)), 0);
  }
  function hasActiveRequest(customer) {
    return activeHomeRequests(customer).length > 0;
  }
  root.DampickPaymentsVisibility = Object.freeze({isDeliveryCompleted, isActiveRequest, activeHomeRequests, homeItems, homeProductAmount, hasActiveRequest});
})(typeof window === "undefined" ? module.exports : window);
