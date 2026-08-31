"use strict";

    const sb =
      window.dampickSupabase;

    const statusBox =
      document.getElementById(
        "status"
      );

    const backLink =
      document.getElementById(
        "backLink"
      );

    const nickname =
      localStorage.getItem(
        "dampickLastNickname"
      ) || "";

    if (nickname) {
      backLink.href =
        "./index.html?nickname=" +
        encodeURIComponent(nickname);
    }

    confirmPayment();

    async function confirmPayment() {
      const params =
        new URLSearchParams(
          window.location.search
        );

      const paymentKey =
        params.get("paymentKey");

      const orderId =
        params.get("orderId");

      const amount =
        Number(
          params.get("amount")
        );

      if (
        !paymentKey ||
        !orderId ||
        !Number.isSafeInteger(amount) ||
        amount < 100
      ) {
        showError(
          "결제 확인 정보가 올바르지 않습니다."
        );
        return;
      }

      try {
        const { data, error } =
          await sb.functions.invoke(
            "confirm-toss-payment",
            {
              body: {
                paymentKey,
                orderId,
                amount
              }
            }
          );

        if (error) {
          throw error;
        }

        if (!data?.success) {
          throw new Error(
            data?.message ||
            "카드 결제를 확인하지 못했습니다."
          );
        }

        statusBox.className =
          "status success";

        statusBox.innerHTML = `
          <strong>카드 결제가 완료되었습니다.</strong><br>
          결제금액:
          ${Number(
            data.amount || amount
          ).toLocaleString("ko-KR")}원<br>
          관리자 화면에도 자동으로 결제 완료가 반영되었습니다.
        `;

      } catch (error) {
        console.error(error);

        showError(
          error?.message ||
          "결제 승인을 확인하는 중 오류가 발생했습니다."
        );
      }
    }

    function showError(text) {
      statusBox.className =
        "status error";

      statusBox.textContent =
        text;
    }
