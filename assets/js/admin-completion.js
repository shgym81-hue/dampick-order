/* 주문 상품과 문고리 배송 신청을 한 번씩만 완료 매출에 반영합니다. */
(function (root) {
  "use strict";

  function normalized(value) {
    return String(value || "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  }

  function deliveryCompleted(request) {
    const status = normalized(request?.fulfillment_status);
    return status.includes("배송완료") || ["delivered", "complete", "completed", "deliverycompleted"].includes(status);
  }

  function activeHomeRequest(request) {
    return request?.receipt_method === "home" &&
      ![request.request_status, request.payment_status].some(value =>
        ["취소", "신청취소", "결제실패", "카드결제실패", "cancelled", "canceled", "failed"].includes(normalized(value)));
  }

  function itemAmount(item) {
    return Number(item?.line_total ?? Number(item?.quantity || 0) * Number(item?.unit_price || 0));
  }

  function requestItemMap(requests) {
    const map = new Map();
    for (const request of requests || []) {
      if (!activeHomeRequest(request)) continue;
      for (const item of request.checkout_request_items || []) {
        const id = String(item.order_item_id || "");
        if (id && !map.has(id)) map.set(id, request);
      }
    }
    return map;
  }

  function pickupCompleted(order) {
    return Boolean(order?.completed_at) ||
      ["픽업완료", "배송완료", "pickupcompleted"].includes(normalized(order?.order_status));
  }

  function completionDate(record, fields) {
    for (const field of fields) {
      if (record?.[field]) {
        return { date: record[field], dateSource: field, dateIsFallback: field !== fields[0] };
      }
    }
    return { date: null, dateSource: null, dateIsFallback: false };
  }

  function pendingItems(order, requests) {
    const requestByItem = requestItemMap(requests);
    return (order.order_items || []).filter(item => {
      const request = requestByItem.get(String(item.id));
      return request ? !deliveryCompleted(request) : !pickupCompleted(order);
    });
  }

  function isHomeItem(item, requests) {
    return requestItemMap(requests).has(String(item.id));
  }

  function salesEntries(orders, requests) {
    const requestByItem = requestItemMap(requests);
    const visibleItems = new Map();
    const entries = [];

    for (const order of orders || []) {
      const pickupItems = [];
      for (const item of order.order_items || []) {
        visibleItems.set(String(item.id), { item, order });
        if (!requestByItem.has(String(item.id))) pickupItems.push(item);
      }
      if (pickupItems.length && pickupCompleted(order)) {
        const productAmount = pickupItems.reduce((sum, item) => sum + itemAmount(item), 0);
        // 기존 완료 주문에 completed_at이 없으면 수정일, 생성일을 완료일 대체값으로 사용합니다.
        const dateInfo = completionDate(order, ["completed_at", "updated_at", "created_at"]);
        const kind = normalized(order.order_status).includes("배송완료") ? "배송 완료" : "픽업 완료";
        entries.push({ id: `pickup:${order.id}`, code: order.order_number || "", kind, ...dateInfo,
          nickname: order.customers?.nickname || "고객", itemCount: pickupItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
          productAmount, deliveryFee: 0, total: productAmount });
      }
    }

    const countedItems = new Set();
    for (const request of requests || []) {
      if (!activeHomeRequest(request) || !deliveryCompleted(request)) continue;
      const linked = (request.checkout_request_items || []).filter(item => {
        const id = String(item.order_item_id || "");
        if (!id || !visibleItems.has(id) || requestByItem.get(id) !== request || countedItems.has(id)) return false;
        countedItems.add(id);
        return true;
      });
      if (!linked.length) continue;
      const linkedProductAmount = linked.reduce((sum, item) => sum + itemAmount(item), 0);
      const deliveryFee = Number(request.delivery_fee || 0);
      const paidTotal = Number(request.final_amount);
      const total = Number.isFinite(paidTotal) && request.final_amount != null ? paidTotal : linkedProductAmount + deliveryFee;
      // 전용 배송 완료일이 없으면 수정일, 생성일을 완료일 대체값으로 사용합니다.
      const dateInfo = completionDate(request, ["delivery_completed_at", "completed_at", "updated_at", "created_at"]);
      entries.push({ id: `home:${request.id}`, code: request.request_code || "", kind: "배송 완료", ...dateInfo,
        nickname: request.nickname_snapshot || visibleItems.get(String(linked[0].order_item_id)).order.customers?.nickname || "고객",
        itemCount: linked.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
        productAmount: total - deliveryFee, deliveryFee, total });
    }
    return entries.filter(entry => entry.date);
  }

  root.DampickAdminCompletion = Object.freeze({ deliveryCompleted, activeHomeRequest, pickupCompleted, pendingItems, isHomeItem, salesEntries });
})(typeof window === "undefined" ? module.exports : window);
