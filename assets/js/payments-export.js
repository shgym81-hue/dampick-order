/* 문고리 배송 미완료 신청 목록을 배송 관리용 엑셀 행으로 변환합니다. */
(function (root) {
  "use strict";

  const COLUMNS = [
    "주문번호", "닉네임", "고객명", "휴대폰 번호", "결제 상태", "배송 상태",
    "수령 방법", "공동현관 출입 정보", "배송지 주소", "배송 요청사항", "주문 상품",
    "상품별 수량", "총 상품 금액", "배송비", "총 결제 금액", "신청일", "픽업 날짜",
    "배송 예정일", "관리자 메모"
  ];

  function text(value) { return String(value ?? "").trim(); }
  function normalized(value) { return text(value).toLowerCase().replace(/[\s_-]+/g, ""); }
  function won(value) { return Number(value || 0).toLocaleString("ko-KR") + "원"; }

  function isDeliveryCompleted(status) {
    const value = normalized(status);
    return value.includes("배송완료") || ["delivered", "complete", "completed"].includes(value);
  }

  function isPaymentCompleted(status) {
    const value = normalized(status);
    return value.includes("결제완료") || value.includes("입금완료") || ["paid", "complete", "completed"].includes(value);
  }

  function isPendingHomeRequest(request, visibility) {
    return request?.receipt_method === "home" &&
      (!visibility || visibility.isActiveRequest(request)) &&
      !isDeliveryCompleted(request.fulfillment_status);
  }

  function isoDate(value) {
    const match = text(value).match(/^\d{4}-\d{2}-\d{2}/);
    return match ? match[0] : text(value);
  }

  function buildRows(requests, orders, delivery, visibility) {
    const orderMap = new Map((orders || []).map(order => [text(order.order_number), order]));
    return (requests || [])
      .filter(request => isPendingHomeRequest(request, visibility))
      .map(request => {
        const items = Array.isArray(request.checkout_request_items) ? request.checkout_request_items : [];
        const orderNumbers = Array.from(new Set([
          ...(Array.isArray(request.order_numbers) ? request.order_numbers : []),
          ...items.map(item => item.order_number)
        ].map(text).filter(Boolean)));
        const pickupDates = Array.from(new Set(items.map(item => isoDate(item.pickup_date)).filter(Boolean))).sort();
        const deliveryLabels = Array.from(new Set(pickupDates.map(date => delivery?.schedule(date)?.label).filter(Boolean)));
        const notices = Array.from(new Set(orderNumbers.flatMap(number => {
          const order = orderMap.get(number);
          return [text(order?.customers?.memo), text(order?.notice)];
        }).filter(Boolean)));
        const productAmount = request.product_amount ?? items.reduce((sum, item) =>
          sum + Number(item.line_total ?? Number(item.quantity || 0) * Number(item.unit_price || 0)), 0);
        const deliveryFee = Number(request.delivery_fee || 0);
        const finalAmount = request.final_amount ?? Number(productAmount || 0) + deliveryFee;

        return {
          "주문번호": orderNumbers.join(" / ") || text(request.request_code),
          "닉네임": text(request.nickname_snapshot),
          "고객명": text(request.customer_name || request.delivery_name || request.recipient_name || request.nickname_snapshot),
          "휴대폰 번호": text(request.delivery_phone),
          "결제 상태": isPaymentCompleted(request.payment_status) ? "결제 완료" : "미결제",
          "배송 상태": text(request.fulfillment_status) || "배송 대기",
          "수령 방법": "문고리 배송",
          "공동현관 출입 정보": text(request.entrance_info),
          "배송지 주소": text(request.delivery_address),
          "배송 요청사항": text(request.delivery_request),
          "주문 상품": items.map(item => text(item.product_name)).filter(Boolean).join(" / "),
          "상품별 수량": items.map(item => `${text(item.product_name)} ${Number(item.quantity || 0).toLocaleString("ko-KR")}${text(item.unit_name) || "개"} x ${won(item.unit_price)}`).join(", "),
          "총 상품 금액": Number(productAmount || 0),
          "배송비": deliveryFee,
          "총 결제 금액": Number(finalAmount || 0),
          "신청일": isoDate(request.created_at),
          "픽업 날짜": pickupDates.join(" / "),
          "배송 예정일": deliveryLabels.join(" / ") || "일정 확인 필요",
          "관리자 메모": text(request.admin_memo) || notices.join(" / ")
        };
      });
  }

  function filename(now) {
    const date = now instanceof Date ? now : new Date();
    const local = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
    return `담픽_문고리배송_미완료목록_${local}.xlsx`;
  }

  function download(rows, XLSX, now) {
    if (!rows.length) return null;
    if (!XLSX?.utils?.json_to_sheet || !XLSX?.writeFile) throw new Error("엑셀 라이브러리를 불러오지 못했습니다.");
    const sheet = XLSX.utils.json_to_sheet(rows, { header: COLUMNS });
    sheet["!cols"] = COLUMNS.map(column => ({ wch: Math.max(12, Math.min(42, column.length * 2 + 8)) }));
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "문고리 배송 미완료");
    const name = filename(now);
    XLSX.writeFile(book, name);
    return name;
  }

  root.DampickPaymentsExport = Object.freeze({ COLUMNS, isDeliveryCompleted, isPendingHomeRequest, buildRows, filename, download });
})(typeof window === "undefined" ? module.exports : window);
