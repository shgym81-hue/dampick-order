(function () {
  "use strict";

  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", function () {
    navigator.serviceWorker.register("./service-worker.js?v=20260919-mobile-orders")
      .then(function (registration) {
        registration.update().catch(function () {});
      })
      .catch(function (error) {
        console.warn("앱 업데이트 확인 실패:", error);
      });
  });
})();
