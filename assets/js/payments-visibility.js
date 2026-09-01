/* 결제·배송 관리에는 고객이 직접 제출한 유효한 신청만 표시합니다. */
(function (root) {
  "use strict";
  const hiddenStatuses = new Set(["취소", "신청 취소", "결제 실패", "카드 결제 실패"]);
  function isActiveRequest(request) {
    if (!request || !String(request.id || request.request_code || "").trim()) return false;
    return ![request.request_status, request.payment_status]
      .some(value => hiddenStatuses.has(String(value || "").trim()));
  }
  function hasActiveRequest(customer) {
    return Array.isArray(customer?.requests) && customer.requests.some(isActiveRequest);
  }
  root.DampickPaymentsVisibility = Object.freeze({isActiveRequest, hasActiveRequest});
})(typeof window === "undefined" ? module.exports : window);
