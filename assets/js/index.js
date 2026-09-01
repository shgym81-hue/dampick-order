"use strict";

    const FREE_DELIVERY_THRESHOLD = 40000;
    const HOME_DELIVERY_FEE = 500;

    const sb = window.dampickSupabase;
    const paymentConfig = window.DAMPICK_PAYMENT_CONFIG || {};
    const TOSS_CLIENT_KEY = String(paymentConfig.tossClientKey || "").trim();

    const nicknameInput = document.getElementById("nickname");
    const lookupButton = document.getElementById("lookupButton");
    const message = document.getElementById("message");
    const results = document.getElementById("results");
    const checkoutCard = document.getElementById("checkoutCard");
    const submitCheckoutButton = document.getElementById("submitCheckoutButton");
    const stickyCheckout = document.getElementById("stickyCheckout");
    const stickyCheckoutButton = document.getElementById("stickyCheckoutButton");

    let currentOrders = [];
    let productGroups = [];
    let checkoutBusy = false;

    restoreNickname();

    lookupButton.addEventListener("click", lookupOrder);

    nicknameInput.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        lookupOrder();
      }
    });

    document.querySelectorAll('input[name="paymentMethod"]').forEach(function (input) {
      input.addEventListener("change", updateCheckoutDisplay);
    });

    results.addEventListener("change", handleProductSelection);
    submitCheckoutButton.addEventListener("click", submitCheckout);
    stickyCheckoutButton.addEventListener("click", function () {
      checkoutCard.scrollIntoView({ behavior: "smooth", block: "start" });
      document.getElementById("deliveryPhone").focus({ preventScroll: true });
    });

    function setProgress(step) {
      document.querySelectorAll("[data-progress-step]").forEach(function (item) {
        const value = Number(item.dataset.progressStep);
        item.classList.toggle("active", value === step);
        item.classList.toggle("done", value < step);
      });
    }

    async function lookupOrder(options = {}) {
      const nickname = nicknameInput.value.trim();

      if (!options.keepMessage) {
        clearMessage();
      }

      results.innerHTML = "";
      currentOrders = [];
      productGroups = [];
      checkoutCard.classList.remove("show");
      stickyCheckout.classList.remove("show");
      setProgress(1);

      if (!options.keepComplete) {
        document.getElementById("checkoutComplete").classList.remove("show");
      }

      if (!nickname) {
        showMessage("닉네임을 입력해주세요.", "error");
        nicknameInput.focus();
        return;
      }

      if (!sb) {
        showMessage("담픽 데이터베이스 연결정보를 불러오지 못했습니다.", "error");
        return;
      }

      lookupButton.disabled = true;
      lookupButton.textContent = "주문을 확인하고 있습니다...";

      try {
        const { data, error } = await sb.rpc(
          "lookup_orders_by_nickname",
          { p_nickname: nickname }
        );

        if (error) {
          throw error;
        }

        currentOrders = normalizeOrders(data);
        productGroups = buildProductGroups(currentOrders);

        if (!productGroups.length) {
          showMessage("해당 닉네임으로 등록된 주문상품이 없습니다.", "error");
          return;
        }

        renderProductGroups();
        setProgress(2);

        const availableCount = productGroups.filter(function (group) {
          return !group.checkout;
        }).length;

        if (availableCount) {
          checkoutCard.classList.add("show");
          showMessage(
            "문고리 배송을 원하는 상품을 체크해주세요. 같은 배송 일정 상품끼리 선택할 수 있습니다.",
            "success"
          );
        } else {
          showMessage("모든 주문상품의 결제·배송 신청이 완료되어 있습니다.", "success");
        }

        updateCheckoutDisplay();

      } catch (error) {
        console.error(error);
        showMessage(
          error.message || "주문정보를 불러오지 못했습니다.",
          "error"
        );
      } finally {
        lookupButton.disabled = false;
        lookupButton.textContent = "주문 조회하기";
      }
    }

    function normalizeOrders(data) {
      if (Array.isArray(data)) {
        return data;
      }

      if (typeof data === "string") {
        try {
          const parsed = JSON.parse(data);
          return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
          return [];
        }
      }

      return [];
    }

    function buildProductGroups(orders) {
      const groupMap = new Map();

      orders.forEach(function (order) {
        const items = Array.isArray(order.items) ? order.items : [];

        items.forEach(function (item) {
          const checkout = item.checkout || null;

          const productIdentity = String(
            item.product_id ||
            item.product_name ||
            "상품"
          );

          const baseKey = [
            productIdentity,
            String(item.product_name || ""),
            String(item.unit_price || 0),
            String(item.unit_name || "개"),
            String(item.pickup_date || "")
          ].join("::");

          const checkoutKey = checkout
            ? "assigned:" + String(
                checkout.request_id ||
                checkout.request_code ||
                ""
              )
            : "available";

          const key = baseKey + "::" + checkoutKey;

          if (!groupMap.has(key)) {
            groupMap.set(key, {
              key,
              productName: item.product_name || "상품",
              unitName: item.unit_name || "개",
              unitPrice: Number(item.unit_price || 0),
              pickupDate: item.pickup_date || "",
              quantity: 0,
              lineTotal: 0,
              itemIds: [],
              checkout
            });
          }

          const group = groupMap.get(key);

          group.quantity += Number(item.quantity || 0);

          group.lineTotal += Number(
            item.line_total ??
            (
              Number(item.unit_price || 0) *
              Number(item.quantity || 0)
            )
          );

          if (item.item_id) {
            group.itemIds.push(String(item.item_id));
          }
        });
      });

      return Array
        .from(groupMap.values())
        .sort(function (a, b) {
          const dateCompare = String(a.pickupDate)
            .localeCompare(String(b.pickupDate));

          if (dateCompare !== 0) {
            return dateCompare;
          }

          return a.productName.localeCompare(b.productName, "ko");
        });
    }

    function getPickupWeekday(value) {
      if (!value) {
        return "";
      }

      const date = new Date(
        String(value).slice(0, 10) + "T00:00:00"
      );

      if (Number.isNaN(date.getTime())) {
        return "";
      }

      return ["일", "월", "화", "수", "목", "금", "토"][date.getDay()];
    }

    function getDeliveryGroup(group) {
      return window.DampickDelivery.schedule(group?.pickupDate)?.key || "OTHER";
    }

    function getDeliveryGroupLabel(groupName) {
      const group = productGroups.find(item => getDeliveryGroup(item) === groupName);
      return window.DampickDelivery.schedule(group?.pickupDate)?.label || "배송 일정 확인 필요";
    }

    function getSelectedDeliveryGroups() {
      return [
        ...new Set(
          getSelectedGroups()
            .map(getDeliveryGroup)
            .filter(function (groupName) {
              return groupName && groupName !== "OTHER";
            })
        )
      ];
    }

    function validateDeliveryGroupSelection() {
      if (!window.DampickDelivery.validate(getSelectedGroups())) {
        showMessage("같은 배송 날짜의 상품만 함께 결제할 수 있습니다. 배송 묶음을 하나 선택해주세요.", "error");
        return false;
      }
      return true;
    }

    function getFirstSelectedDeliveryGroup() {
      return getSelectedDeliveryGroups()[0] || "";
    }

    function renderProductGroups() {
      const initialDeliveryGroup = "";
      const cards = productGroups.map(function (group, index) {
        const assigned = Boolean(group.checkout);
        const deliveryGroup = getDeliveryGroup(group);

        const shouldCheck =
          !assigned &&
          initialDeliveryGroup &&
          deliveryGroup === initialDeliveryGroup;

        const statusText = assigned
          ? [
              getReceiptLabel(group.checkout.receipt_method),
              getPaymentLabel(group.checkout.payment_method),
              group.checkout.payment_status || "처리 중"
            ].join(" · ")
          : "";

        return `
          <article
            class="product-card ${assigned ? "assigned" : shouldCheck ? "selected" : ""}"
            data-group-index="${index}"
            data-delivery-group="${deliveryGroup}"
          >
            <div class="product-head">
              <input
                class="product-check"
                type="checkbox"
                data-group-index="${index}"
                data-delivery-group="${deliveryGroup}"
                ${assigned || deliveryGroup === "OTHER" || !group.itemIds.length ? "disabled" : ""}
                ${shouldCheck ? "checked" : ""}
                aria-label="${escapeHtml(group.productName)} 선택"
              >

              <div>
                <div class="product-name">
                  ${escapeHtml(group.productName)}
                </div>

                <div class="product-facts">
                  <div class="product-fact">
                    <span>개당 금액</span>
                    <strong>${formatWon(group.unitPrice)}</strong>
                  </div>
                  <div class="product-fact">
                    <span>합산 수량</span>
                    <strong>${Number(group.quantity).toLocaleString("ko-KR")} ${escapeHtml(group.unitName)}</strong>
                  </div>
                  <div class="product-fact product-fact-pickup">
                    <span>픽업 날짜</span>
                    <strong>${formatDate(group.pickupDate)}</strong>
                  </div>
                  <div class="product-fact product-fact-delivery">
                    <span>배송 일정</span>
                    <strong>${getDeliveryGroupLabel(deliveryGroup)}</strong>
                  </div>
                </div>

                ${
                  assigned
                    ? `<span class="status-badge">${escapeHtml(statusText)}</span>`
                    : ""
                }
              </div>
            </div>

            <div class="product-bottom">
              <span class="product-meta">
                ${
                  assigned
                    ? "이미 결제·배송 신청이 완료된 상품입니다."
                    : deliveryGroup === "OTHER" || !group.itemIds.length ? "배송 일정을 확인하려면 관리자에게 문의해주세요." : "이 배송 묶음에 포함할 상품만 체크하세요."
                }
              </span>

              <span class="product-price">
                ${formatWon(group.lineTotal)}
              </span>
            </div>
          </article>
        `;
      });
      const buckets = new Map();
      productGroups.forEach((group, index) => {
        const key = getDeliveryGroup(group);
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(index);
      });
      results.innerHTML = Array.from(buckets).map(([key, indexes]) => {
        const available = indexes.filter(i => !productGroups[i].checkout && productGroups[i].itemIds.length && key !== "OTHER");
        const info = window.DampickDelivery.schedule(productGroups[indexes[0]].pickupDate);
        return `<section class="delivery-bucket" data-bucket="${key}">
          <div class="delivery-bucket-heading"><h3>${escapeHtml(info?.label || "배송 일정 확인 필요")}</h3>
          <p>${escapeHtml(info?.pickupLabel || "주말·미정 상품은 관리자에게 문의해주세요.")}</p></div>
          ${available.length ? `<label class="select-all-box"><input type="checkbox" class="bucket-select-all" data-delivery-group="${key}"><span>이 배송 묶음 전체 선택</span></label>` : ""}
          ${indexes.map(i => cards[i]).join("")}
          ${available.length ? `<button type="button" class="bucket-checkout primary-button" data-delivery-group="${key}" disabled>선택 상품 결제하기</button>` : ""}
        </section>`;
      }).join("");
      results.querySelectorAll(".bucket-select-all").forEach(control => {
        control.addEventListener("change", () => {
          if (checkoutBusy) return;
          document.querySelectorAll(".product-check:not(:disabled)").forEach(checkbox => {
            checkbox.checked = control.checked && checkbox.dataset.deliveryGroup === control.dataset.deliveryGroup;
            toggleProductCard(checkbox);
          });
          clearMessage();
          syncSelectAll();
          updateCheckoutDisplay();
        });
      });
      results.querySelectorAll(".bucket-checkout").forEach(button => {
        button.addEventListener("click", () => {
          if (!checkoutBusy && validateDeliveryGroupSelection()) {
            checkoutCard.scrollIntoView({ behavior: "smooth", block: "start" });
            document.getElementById("deliveryPhone").focus({ preventScroll: true });
          }
        });
      });
      syncSelectAll();
    }

    function handleProductSelection(event) {
      if (!event.target.matches(".product-check")) {
        return;
      }

      if (event.target.checked) {
        if (!window.DampickDelivery.validate(getSelectedGroups())) {
          event.target.checked = false;

          showMessage(
            "배송 날짜가 다른 상품은 함께 선택할 수 없습니다. 다른 묶음의 전체 선택을 누르면 해당 묶음으로 전환됩니다.",
            "error"
          );
        }
      }

      toggleProductCard(event.target);
      syncSelectAll();
      updateCheckoutDisplay();
    }

    function toggleProductCard(checkbox) {
      const card = checkbox.closest(".product-card");

      card?.classList.toggle(
        "selected",
        checkbox.checked
      );
    }

    function syncSelectAll() {
      const checkboxes = Array.from(document.querySelectorAll(".product-check:not(:disabled)"));
      document.querySelectorAll(".bucket-select-all").forEach(control => {
        const available = checkboxes.filter(item => item.dataset.deliveryGroup === control.dataset.deliveryGroup);
        const checked = available.filter(item => item.checked);
        control.checked = available.length > 0 && checked.length === available.length;
        control.indeterminate = checked.length > 0 && checked.length < available.length;
      });
      document.querySelectorAll(".bucket-checkout").forEach(button => {
        const selected = checkboxes.filter(item => item.checked && item.dataset.deliveryGroup === button.dataset.deliveryGroup);
        button.disabled = checkoutBusy || selected.length === 0;
        button.textContent = selected.length ? `선택 ${selected.length}종 결제하기` : "상품을 선택해주세요";
      });
    }

    function getSelectedGroups() {
      return Array.from(
        document.querySelectorAll(".product-check:checked:not(:disabled)")
      )
        .map(function (checkbox) {
          return productGroups[
            Number(checkbox.dataset.groupIndex)
          ];
        })
        .filter(Boolean);
    }

    function getSelectedItemIds() {
      return getSelectedGroups()
        .flatMap(function (group) {
          return group.itemIds;
        })
        .filter(Boolean);
    }

    function getProductAmount() {
      return getSelectedGroups().reduce(function (sum, group) {
        return sum + Number(group.lineTotal || 0);
      }, 0);
    }

    function getReceiptMethod() {
      return "home";
    }

    function getPaymentMethod() {
      return (
        document.querySelector('input[name="paymentMethod"]:checked')?.value ||
        "bank_transfer"
      );
    }

    function updateCheckoutDisplay() {
      const selectedGroups = getSelectedGroups();
      const selectedCount = selectedGroups.length;
      const productAmount = getProductAmount();
      const paymentMethod = getPaymentMethod();

      document.getElementById("deliveryFields").hidden = false;
      document.getElementById("bankBox").hidden =
        paymentMethod !== "bank_transfer";
      document.getElementById("cardBox").hidden =
        paymentMethod !== "card_online";

      // 사용자 기준:
      // 40,000원 초과 무료 / 40,000원 이하 500원
      const deliveryFee =
        selectedCount === 0
          ? 0
          : productAmount > FREE_DELIVERY_THRESHOLD
            ? 0
            : HOME_DELIVERY_FEE;

      const finalAmount = productAmount + deliveryFee;

      document.getElementById("productAmountText").textContent =
        formatWon(productAmount);

      document.getElementById("deliveryFeeText").textContent =
        selectedCount === 0
          ? "0원"
          : deliveryFee === 0
            ? "무료"
            : formatWon(deliveryFee);

      document.getElementById("finalAmountText").textContent =
        formatWon(finalAmount);

      submitCheckoutButton.disabled = checkoutBusy || selectedCount === 0;
      document.getElementById("stickySelectionText").textContent = selectedCount
        ? `선택 ${selectedCount}종 · ${getDeliveryGroupLabel(getFirstSelectedDeliveryGroup())}`
        : "배송받을 상품을 선택해 주세요";
      document.getElementById("stickyAmountText").textContent = formatWon(finalAmount);
      stickyCheckoutButton.disabled = checkoutBusy || selectedCount === 0;
      stickyCheckout.classList.toggle("show", productGroups.some(group => !group.checkout));
      setProgress(selectedCount ? 3 : productGroups.length ? 2 : 1);
      const scheduleTextBox = document.getElementById("checkoutSchedule");
      if (scheduleTextBox) scheduleTextBox.textContent = selectedCount ? getDeliveryGroupLabel(getFirstSelectedDeliveryGroup()) : "결제할 배송 묶음을 선택해주세요.";

      const guide = document.getElementById("deliveryGuide");

      if (!selectedCount) {
        guide.textContent =
          "이번 문고리 배송에 포함할 상품을 한 개 이상 체크해주세요.";
        return;
      }

      const deliveryGroup = getFirstSelectedDeliveryGroup();

      const scheduleText = getDeliveryGroupLabel(deliveryGroup);

      if (productAmount > FREE_DELIVERY_THRESHOLD) {
        guide.textContent =
          `배송 일정: ${scheduleText} · 선택 상품 합계가 40,000원을 초과하여 배송비가 무료입니다.`;
      } else {
        guide.textContent =
          `배송 일정: ${scheduleText} · 선택 상품 합계가 40,000원 이하이므로 배송비 500원이 추가됩니다.`;
      }
    }

    async function submitCheckout() {
      if (checkoutBusy) return;
      clearMessage();

      const nickname = nicknameInput.value.trim();
      const itemIds = getSelectedItemIds();
      const receiptMethod = getReceiptMethod();
      const paymentMethod = getPaymentMethod();

      const deliveryPhone =
        document.getElementById("deliveryPhone").value.trim();

      const address =
        document.getElementById("deliveryAddress").value.trim();

      const entranceInfo =
        document.getElementById("entranceInfo").value.trim();

      const deliveryRequest =
        document.getElementById("deliveryRequest").value.trim();

      if (!nickname) {
        showMessage("닉네임을 입력해주세요.", "error");
        return;
      }

      if (!itemIds.length) {
        showMessage(
          "이번 문고리 배송에 포함할 상품을 한 개 이상 체크해주세요.",
          "error"
        );
        return;
      }

      if (!validateDeliveryGroupSelection()) {
        return;
      }

      const phoneDigits = deliveryPhone.replace(/\D/g, "");

      if (phoneDigits.length < 10 || phoneDigits.length > 11) {
        showMessage(
          "문고리 배송을 위해 휴대폰 번호를 정확히 입력해주세요.",
          "error"
        );
        return;
      }

      if (!address || !entranceInfo) {
        showMessage(
          "문고리 배송을 위해 주소와 공동현관 출입정보를 입력해주세요.",
          "error"
        );
        return;
      }

      if (
        paymentMethod === "card_online" &&
        !isTossConfigured()
      ) {
        showMessage(
          "카드결제 설정이 아직 완료되지 않았습니다. assets/js/payment-config.js의 토스 클라이언트 키를 확인해주세요.",
          "error"
        );
        return;
      }

      const selectedSnapshot = getSelectedGroups().map(group => ({ ...group, itemIds: [...group.itemIds] }));
      const orderName = (getDeliveryGroupLabel(getFirstSelectedDeliveryGroup()) + " / " + selectedSnapshot[0].productName + (selectedSnapshot.length > 1 ? " 외 " + (selectedSnapshot.length - 1) + "종" : "")).slice(0, 100);
      try { localStorage.setItem("dampickLastNickname", nickname); } catch (_) { /* 저장 차단 시에도 결제는 진행합니다. */ }
      checkoutBusy = true;
      const lockedControls = Array.from(document.querySelectorAll("input, textarea, button")).filter(control => !control.disabled);
      lockedControls.forEach(control => { control.disabled = true; });

      submitCheckoutButton.disabled = true;
      submitCheckoutButton.textContent =
        "선택 상품 신청을 저장하고 있습니다...";

      try {
        const { data, error } = await sb.rpc(
          paymentConfig.scheduledCheckoutRpc || "submit_checkout_item_request_v2",
          {
            p_nickname: nickname,
            p_item_ids: itemIds,
            p_receipt_method: receiptMethod,
            p_payment_method: paymentMethod,
            p_delivery_phone: deliveryPhone,
            p_delivery_address: address,
            p_entrance_info: entranceInfo,
            p_delivery_request: deliveryRequest
          }
        );

        if (error) {
          throw error;
        }

        const result =
          typeof data === "string"
            ? JSON.parse(data)
            : data;

        if (paymentMethod === "card_online") {
          await startTossCardPayment(result, nickname, orderName);
          return;
        }

        const completeBox =
          document.getElementById("checkoutComplete");

        const nextGuide =
          "하나은행 412-910821-25107, 예금주 담픽으로 " +
          formatWon(result.final_amount) +
          "을 입금해주세요.";

        completeBox.innerHTML = `
          <strong>문고리 배송 신청이 저장되었습니다.</strong><br>
          신청번호:
          ${escapeHtml(result.request_code || "")}<br>
          선택 상품 합계:
          ${formatWon(result.product_amount)}<br>
          배송비:
          ${
            Number(result.delivery_fee || 0) === 0
              ? "무료"
              : formatWon(result.delivery_fee)
          }<br>
          이번 결제금액:
          <strong>${formatWon(result.final_amount)}</strong><br>
          ${escapeHtml(nextGuide)}
        `;

        completeBox.classList.add("show");
        await lookupOrder({
          keepComplete: true,
          keepMessage: true
        });

        setProgress(4);
        stickyCheckout.classList.remove("show");

        checkoutCard.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });

      } catch (error) {
        console.error(error);

        showMessage(
          error.message || "문고리 배송 신청을 저장하지 못했습니다.",
          "error"
        );

      } finally {
        checkoutBusy = false;
        lockedControls.forEach(control => { control.disabled = false; });
        syncSelectAll();
        submitCheckoutButton.disabled =
          getSelectedGroups().length === 0;

        submitCheckoutButton.textContent =
          "선택 상품 결제·문고리 배송 신청하기";
      }
    }

    function restoreNickname() {
      const params = new URLSearchParams(window.location.search);

      const saved =
        params.get("nickname") ||
        localStorage.getItem("dampickLastNickname") ||
        "";

      if (saved) {
        nicknameInput.value = saved;
      }
    }

    function isTossConfigured() {
      return window.isDampickTossKeyConfigured(TOSS_CLIENT_KEY);
    }

    function makeTossOrderName() {
      const groups = getSelectedGroups();

      if (!groups.length) {
        return "담픽 주문상품";
      }

      const firstName = String(
        groups[0].productName || "담픽 상품"
      );

      return groups.length > 1
        ? (
            firstName +
            " 외 " +
            (groups.length - 1) +
            "건"
          ).slice(0, 100)
        : firstName.slice(0, 100);
    }

    async function startTossCardPayment(result, nickname, orderName) {
      if (typeof window.TossPayments !== "function") {
        throw new Error("토스페이먼츠 결제 모듈을 불러오지 못했습니다.");
      }

      const amount = Number(result.final_amount || 0);

      if (!Number.isInteger(amount) || amount < 100) {
        throw new Error("카드결제 금액은 100원 이상이어야 합니다.");
      }

      const tossPayments = window.TossPayments(TOSS_CLIENT_KEY);

      const payment = tossPayments.payment({
        customerKey: window.TossPayments.ANONYMOUS
      });

      const successUrl = new URL(
        "./payment-success.html",
        window.location.href
      ).href;

      const failUrl = new URL(
        "./payment-fail.html",
        window.location.href
      ).href;

      try {
        await payment.requestPayment({
          method: "CARD",
          amount: {
            currency: "KRW",
            value: amount
          },
          orderId: String(result.request_code),
          orderName,
          successUrl,
          failUrl,
          customerName: nickname.slice(0, 100),
          card: {
            flowMode: "DEFAULT"
          }
        });

      } catch (error) {
        try {
          await sb.rpc(
            "mark_card_payment_failed",
            {
              p_request_code: String(result.request_code),
              p_error_code: String(error?.code || ""),
              p_error_message: String(
                error?.message ||
                "카드결제 창을 열지 못했습니다."
              )
            }
          );
        } catch (ignore) {
          console.warn(ignore);
        }

        throw error;
      }
    }

    function getReceiptLabel(value) {
      return value === "home"
        ? "문고리 배송"
        : "매장 픽업";
    }

    function getPaymentLabel(value) {
      const labels = {
        pickup_pay: "픽업 시 결제",
        bank_transfer: "계좌이체",
        card_online: "카드결제"
      };

      return labels[value] || "결제방법 확인";
    }

    function formatDate(value) {
      if (!value) {
        return "날짜 미정";
      }

      const date = new Date(
        String(value).slice(0, 10) + "T00:00:00"
      );

      if (Number.isNaN(date.getTime())) {
        return String(value);
      }

      const weekday =
        ["일", "월", "화", "수", "목", "금", "토"][date.getDay()];

      return (
        date.getFullYear() +
        "년 " +
        (date.getMonth() + 1) +
        "월 " +
        date.getDate() +
        "일 (" +
        weekday +
        ")"
      );
    }

    function formatWon(value) {
      return (
        Number(value || 0).toLocaleString("ko-KR") +
        "원"
      );
    }

    function showMessage(text, type) {
      message.textContent = text;
      message.className = "message show " + type;
    }

    function clearMessage() {
      message.textContent = "";
      message.className = "message";
    }

    function escapeHtml(value) {
      return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
    }
