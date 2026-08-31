"use strict";

    const params =
      new URLSearchParams(
        window.location.search
      );

    const code =
      params.get("code") ||
      "PAYMENT_FAILED";

    const message =
      params.get("message") ||
      "결제를 취소했거나 카드 인증에 실패했습니다.";

    const orderId =
      params.get("orderId") ||
      "";

    const nickname =
      localStorage.getItem(
        "dampickLastNickname"
      ) || "";

    const errorBox =
      document.getElementById(
        "errorBox"
      );

    errorBox.innerHTML = `
      <strong>${escapeHtml(code)}</strong><br>
      ${escapeHtml(message)}
    `;

    const backLink =
      document.getElementById(
        "backLink"
      );

    if (nickname) {
      backLink.href =
        "./index.html?nickname=" +
        encodeURIComponent(nickname);
    }

    markFailed();

    async function markFailed() {
      if (
        !orderId ||
        !window.dampickSupabase
      ) {
        return;
      }

      try {
        await window.dampickSupabase.rpc(
          "mark_card_payment_failed",
          {
            p_request_code:
              orderId,
            p_error_code:
              code,
            p_error_message:
              message
          }
        );
      } catch (error) {
        console.warn(error);
      }
    }

    function escapeHtml(value) {
      return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
    }
