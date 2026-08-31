/* 브라우저 시간대와 관계없이 픽업 날짜를 실제 배송일로 묶습니다. */
(function (root) {
  "use strict";
  function schedule(value) {
    const text = String(value || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
    const date = new Date(text + "T00:00:00Z");
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== text) return null;
    const day = date.getUTCDay();
    if (day < 1 || day > 5) return null;
    const early = day <= 2;
    date.setUTCDate(date.getUTCDate() + (early ? 3 : 5) - day);
    const deliveryDate = date.toISOString().slice(0, 10);
    return {
      key: deliveryDate + (early ? ":DAWN" : ":PM"),
      date: deliveryDate,
      label: `${deliveryDate} ${early ? "수요일 새벽" : "금요일 오후"} 배송`,
      pickupLabel: early ? "월·화 픽업 상품" : "수·목·금 픽업 상품"
    };
  }
  function validate(groups) {
    if (!groups.length) return false;
    const schedules = groups.map(group => schedule(group.pickupDate));
    return schedules.every(Boolean) && new Set(schedules.map(item => item.key)).size === 1;
  }
  root.DampickDelivery = Object.freeze({ schedule, validate });
})(typeof window === "undefined" ? module.exports : window);
