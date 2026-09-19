"use strict";

    const sb =
      window.dampickSupabase;

    const loginSection =
      document.getElementById(
        "loginSection"
      );

    const adminApp =
      document.getElementById(
        "adminApp"
      );

    const loginMessage =
      document.getElementById(
        "loginMessage"
      );

    const appMessage =
      document.getElementById(
        "appMessage"
      );

    let customers = [];
    let products = [];
    let orders = [];
    let checkoutRequests = [];

    const productEditor = window.createDampickProductEditor(sb, async product => {
      await loadProducts();
      setMessage(appMessage, product.name + " 상품을 수정했습니다. 기존 주문은 변경되지 않습니다.", "success");
    });

    let memberListOpen = false;
    let orderListOpen = false;
    let selectedSalesDate = "";

    bindEvents();
    start();

    function bindEvents() {
      document
        .getElementById("loginButton")
        .addEventListener("click", login);

      document
        .getElementById("logoutButton")
        .addEventListener("click", logout);

      document
        .getElementById("customerForm")
        .addEventListener(
          "submit",
          addCustomer
        );

      document
        .getElementById("productForm")
        .addEventListener(
          "submit",
          addProduct
        );

      document
        .getElementById("orderForm")
        .addEventListener(
          "submit",
          addOrder
        );

      document.querySelectorAll("[data-category-toggle]").forEach(function (button) {
        const section = document.getElementById(button.dataset.categoryToggle);
        if (section && window.matchMedia("(max-width: 720px)").matches) {
          section.classList.add("is-collapsed");
          button.setAttribute("aria-expanded", "false");
          button.textContent = "펼치기";
        }

        button.addEventListener("click", function () {
          const section = document.getElementById(button.dataset.categoryToggle);
          if (!section) return;
          const collapsed = section.classList.toggle("is-collapsed");
          button.setAttribute("aria-expanded", String(!collapsed));
          button.textContent = collapsed ? "펼치기" : "접기";
        });
      });

      document
        .getElementById("customerSearch")
        .addEventListener(
          "input",
          renderCustomers
        );

      document
        .getElementById(
          "customerListToggle"
        )
        .addEventListener(
          "click",
          function () {
            memberListOpen =
              !memberListOpen;

            renderCustomers();
          }
        );

      document
        .getElementById(
          "orderCustomerSearch"
        )
        .addEventListener(
          "input",
          renderCustomerSelect
        );

      document
        .getElementById(
          "orderListSearch"
        )
        .addEventListener(
          "input",
          renderOrders
        );

      document
        .getElementById(
          "orderListToggle"
        )
        .addEventListener(
          "click",
          function () {
            orderListOpen =
              !orderListOpen;

            renderOrders();
          }
        );

      document
        .getElementById(
          "salesMonth"
        )
        .addEventListener(
          "change",
          renderSalesCalendar
        );

      document
        .getElementById(
          "refreshSalesButton"
        )
        .addEventListener(
          "click",
          loadOrders
        );

      document
        .getElementById(
          "downloadMonthlyExcel"
        )
        .addEventListener(
          "click",
          downloadMonthlyExcel
        );

      document
        .getElementById(
          "downloadAllExcel"
        )
        .addEventListener(
          "click",
          downloadAllExcel
        );

      document
        .getElementById(
          "adminPassword"
        )
        .addEventListener(
          "keydown",
          function (event) {
            if (event.key === "Enter") {
              login();
            }
          }
        );
    }

    async function start() {
      setToday();
      setCurrentMonth();

      if (!sb) {
        setMessage(
          loginMessage,
          "config.js의 Supabase 연결정보를 불러오지 못했습니다.",
          "error"
        );

        return;
      }

      const { data } =
        await sb.auth.getSession();

      if (data.session) {
        showAdmin();
        await loadAll();
      }
    }

    async function login() {
      const email =
        document
          .getElementById(
            "adminEmail"
          )
          .value
          .trim();

      const password =
        document
          .getElementById(
            "adminPassword"
          )
          .value;

      clearMessage(loginMessage);

      if (!email || !password) {
        setMessage(
          loginMessage,
          "관리자 이메일과 비밀번호를 입력해주세요.",
          "error"
        );

        return;
      }

      const { error } =
        await sb.auth.signInWithPassword({
          email,
          password
        });

      if (error) {
        setMessage(
          loginMessage,
          "로그인에 실패했습니다. 이메일과 비밀번호를 확인해주세요.",
          "error"
        );

        return;
      }

      showAdmin();
      await loadAll();
    }

    async function logout() {
      await sb.auth.signOut();

      adminApp.classList.add("hidden");
      loginSection.classList.remove(
        "hidden"
      );
    }

    function showAdmin() {
      loginSection.classList.add(
        "hidden"
      );

      adminApp.classList.remove(
        "hidden"
      );

      window.scrollTo(0, 0);
    }

    async function loadAll() {
      await Promise.all([
        loadCustomers(),
        loadProducts()
      ]);

      await loadOrders();
    }

    async function loadCustomers() {
      const { data, error } =
        await sb
          .from("customers")
          .select("*")
          .order("nickname");

      if (error) {
        showAppError(error);
        return;
      }

      customers = data || [];

      renderCustomers();
      renderCustomerSelect();
    }

    async function loadProducts() {
      const { data, error } =
        await sb
          .from("products")
          .select("*")
          .eq("is_active", true)
          .order("pickup_date", {
            ascending: true,
            nullsFirst: false
          })
          .order("created_at", {
            ascending: false
          });

      if (error) {
        showAppError(error);
        return;
      }

      products = data || [];

      renderProducts();
      renderProductChecks();
    }

    async function loadOrders() {
      const ordersResult = await sb
          .from("orders")
          .select(`
            *,
            customers(
              id,
              nickname
            ),
            order_items(
              id,
              product_id,
              product_name,
              quantity,
              unit_name,
              unit_price,
              line_total,
              pickup_date,
              created_at
            )
          `)
          .order(
            "created_at",
            { ascending: false }
          );

      if (ordersResult.error) {
        showAppError(ordersResult.error);
        return;
      }

      orders =
        (ordersResult.data || []).filter(
          function (order) {
            return order.is_visible !== false;
          }
        );

      try {
        const requestsResult = await sb.from("checkout_requests")
          .select("*,checkout_request_items(order_item_id,quantity,unit_price,line_total)")
          .eq("receipt_method", "home");
        if (requestsResult.error) throw requestsResult.error;
        checkoutRequests = requestsResult.data || [];
      } catch (error) {
        console.warn("문고리 배송 신청 조회 실패; 주문 목록만 표시합니다.", error);
        checkoutRequests = [];
        setMessage(appMessage,
          "문고리 배송 신청 상태를 불러오지 못했습니다. 4번 주문 목록은 표시하지만 배송 상태와 5번 매출은 정확하지 않을 수 있습니다.",
          "error");
      }

      renderOrders();
      renderSalesCalendar();
    }

    async function addCustomer(event) {
      event.preventDefault();

      const nickname =
        document
          .getElementById(
            "newNickname"
          )
          .value
          .trim();

      const memo =
        document
          .getElementById(
            "customerMemo"
          )
          .value
          .trim();

      if (!nickname) return;

      const { error } =
        await sb
          .from("customers")
          .insert({
            nickname,
            memo
          });

      if (error) {
        setMessage(
          appMessage,
          "회원 등록 실패: 같은 닉네임이 이미 등록되어 있는지 확인해주세요.",
          "error"
        );

        return;
      }

      event.target.reset();
      memberListOpen = true;

      document
        .getElementById(
          "customerSearch"
        )
        .value = nickname;

      setMessage(
        appMessage,
        nickname +
        " 회원을 등록했습니다.",
        "success"
      );

      await loadCustomers();
    }

    async function addProduct(event) {
      event.preventDefault();

      const name =
        document
          .getElementById(
            "newProductName"
          )
          .value
          .trim();

      const unitPrice =
        Number(
          document
            .getElementById(
              "newProductPrice"
            )
            .value
        );

      const unitName =
        document
          .getElementById(
            "newProductUnit"
          )
          .value
          .trim();

      const pickupDate =
        document
          .getElementById(
            "newProductPickupDate"
          )
          .value;

      const stockQuantity = Number(
        document.getElementById("newProductStock").value
      );

      if (
        !name ||
        !Number.isFinite(unitPrice) ||
        unitPrice < 0 ||
        !unitName ||
        !pickupDate ||
        !Number.isSafeInteger(stockQuantity) ||
        stockQuantity < 0
      ) {
        setMessage(
          appMessage,
          "상품명·가격·단위·픽업 날짜와 0 이상의 재고 수량을 입력해주세요.",
          "error"
        );

        return;
      }

      const { error } =
        await sb
          .from("products")
          .insert({
            name,
            unit_price: unitPrice,
            unit_name: unitName,
            pickup_date: pickupDate,
            stock_quantity: stockQuantity
          });

      if (error) {
        setMessage(
          appMessage,
          "상품 등록에 실패했습니다. Supabase에 pickup_date 칸이 있는지 확인해주세요.",
          "error"
        );

        return;
      }

      event.target.reset();

      document
        .getElementById(
          "newProductUnit"
        )
        .value = "개";

      document.getElementById("newProductStock").value = "0";

      setDefaultProductPickupDate();

      setMessage(
        appMessage,
        name +
        " 상품을 등록했습니다.",
        "success"
      );

      await loadProducts();
    }

    async function addOrder(event) {
      event.preventDefault();

      const customerId =
        document
          .getElementById(
            "orderCustomer"
          )
          .value;

      const selected =
        products
          .filter(
            function (product) {
              const checkbox =
                document.getElementById(
                  "check-" + product.id
                );

              return (
                checkbox &&
                checkbox.checked
              );
            }
          )
          .map(
            function (product) {
              const quantityInput =
                document.getElementById(
                  "qty-" + product.id
                );

              return {
                product,
                quantity: Math.max(
                  1,
                  Number(
                    quantityInput?.value || 1
                  )
                )
              };
            }
          );

      if (!customerId) {
        setMessage(
          appMessage,
          "고객 닉네임을 선택해주세요.",
          "error"
        );
        return;
      }

      if (!selected.length) {
        setMessage(
          appMessage,
          "주문 상품을 한 개 이상 선택해주세요.",
          "error"
        );
        return;
      }

      if (selected.some(function (selection) {
        return !Number.isSafeInteger(selection.quantity) ||
          selection.quantity < 1 ||
          selection.quantity > Number(selection.product.stock_quantity || 0);
      })) {
        setMessage(appMessage, "재고가 부족합니다. 남은 재고를 확인해주세요.", "error");
        return;
      }

      const orderNumber =
        makeOrderNumber();

      const { error: orderError } = await sb.rpc("create_order_with_stock", {
        p_customer_id: customerId,
        p_order_number: orderNumber,
        p_order_date: document.getElementById("orderDate").value,
        p_payment_status: "현장 결제 예정",
        p_order_status: document.getElementById("orderStatus").value,
        p_notice: document.getElementById("orderNotice").value.trim(),
        p_items: selected.map(function (selection) {
          return { product_id: selection.product.id, quantity: selection.quantity };
        })
      });

      if (orderError) {
        const stockError = String(orderError.message || "").includes("재고가 부족합니다");
        setMessage(
          appMessage,
          stockError
            ? "재고가 부족합니다. 남은 재고를 확인해주세요."
            : "주문 저장에 실패했습니다. 재고 관리 SQL 실행 여부를 확인해주세요.",
          "error"
        );
        return;
      }

      event.target.reset();
      setToday();

      document
        .getElementById(
          "orderCustomerSearch"
        )
        .value = "";

      renderCustomerSelect();
      renderProductChecks();
      updateTotalPreview();

      setMessage(
        appMessage,
        "주문번호 " +
        orderNumber +
        "을 저장했습니다.",
        "success"
      );

      orderListOpen = true;
      await Promise.all([loadProducts(), loadOrders()]);
    }

    async function editCustomer(
      id,
      currentNickname,
      currentMemo
    ) {
      const nickname =
        prompt(
          "변경할 닉네임을 입력하세요.",
          currentNickname
        );

      if (nickname === null) return;

      const trimmedNickname =
        nickname.trim();

      if (!trimmedNickname) {
        alert("닉네임을 입력해주세요.");
        return;
      }

      const memo =
        prompt(
          "관리자 메모를 입력하세요.",
          currentMemo || ""
        );

      if (memo === null) return;

      const { error } =
        await sb
          .from("customers")
          .update({
            nickname: trimmedNickname,
            memo: memo.trim()
          })
          .eq("id", id);

      if (error) {
        showAppError(error);
        return;
      }

      setMessage(
        appMessage,
        "회원 정보를 수정했습니다.",
        "success"
      );

      await loadCustomers();
    }

    async function deleteCustomer(
      id,
      nickname
    ) {
      const accepted =
        confirm(
          nickname +
          " 회원과 연결된 주문을 모두 삭제할까요?"
        );

      if (!accepted) return;

      const { error } = await sb.rpc("delete_customer_with_stock", {
        p_customer_id: id
      });

      if (error) {
        showAppError(error);
        return;
      }

      setMessage(
        appMessage,
        "회원을 삭제했습니다.",
        "success"
      );

      await loadAll();
    }

    async function deactivateProduct(
      id,
      name
    ) {
      const accepted =
        confirm(
          name +
          " 상품을 현재 상품목록에서 내릴까요?"
        );

      if (!accepted) return;

      const { error } =
        await sb
          .from("products")
          .update({
            is_active: false
          })
          .eq("id", id);

      if (error) {
        showAppError(error);
        return;
      }

      setMessage(
        appMessage,
        "상품을 현재 판매목록에서 내렸습니다.",
        "success"
      );

      await loadProducts();
    }

    async function deleteSelectedItems(
      orderId
    ) {
      const checked =
        Array.from(
          document.querySelectorAll(
            '[data-order-item-check="' +
            orderId +
            '"]:checked'
          )
        );

      const itemIds =
        checked.map(
          function (checkbox) {
            return checkbox.value;
          }
        );

      if (!itemIds.length) {
        alert(
          "부분 취소할 상품을 먼저 체크해주세요."
        );
        return;
      }

      const accepted =
        confirm(
          "선택한 상품 " +
          itemIds.length +
          "개를 주문에서 취소할까요?"
        );

      if (!accepted) return;

      const { error } = await sb.rpc("cancel_order_items_with_stock", {
        p_order_id: orderId,
        p_item_ids: itemIds
      });

      if (error) {
        showAppError(error);
        return;
      }

      setMessage(
        appMessage,
        "선택한 상품을 취소했습니다.",
        "success"
      );

      await Promise.all([loadProducts(), loadOrders()]);
    }

    async function updateOrderItemQuantity(itemId, orderId) {
      const input = document.querySelector('[data-order-item-quantity="' + itemId + '"]');
      const quantity = Number(input?.value || 0);
      const order = orders.find(function (entry) { return entry.id === orderId; });
      const item = order?.order_items?.find(function (entry) { return entry.id === itemId; });

      if (!item || !Number.isInteger(quantity) || quantity < 1) {
        alert("수량은 1개 이상의 정수로 입력해 주세요.");
        return;
      }

      const accepted = confirm(item.product_name + " 수량을 " + quantity + (item.unit_name || "개") + "로 변경할까요?");
      if (!accepted) return;

      const { error } = await sb.rpc("update_order_item_quantity_with_stock", {
        p_order_id: orderId,
        p_item_id: itemId,
        p_quantity: quantity
      });

      if (error) {
        if (String(error.message || "").includes("재고가 부족합니다")) {
          setMessage(appMessage, "재고가 부족합니다. 남은 재고를 확인해주세요.", "error");
        } else {
          showAppError(error);
        }
        return;
      }

      setMessage(appMessage, item.product_name + " 주문 수량을 수정했습니다.", "success");
      await Promise.all([loadProducts(), loadOrders()]);
    }

    async function updatePaymentStatus(
      orderId
    ) {
      const select =
        document.getElementById(
          "payment-edit-" + orderId
        );

      if (!select) return;

      const { error } =
        await sb
          .from("orders")
          .update({
            payment_status:
              select.value
          })
          .eq("id", orderId);

      if (error) {
        showAppError(error);
        return;
      }

      setMessage(
        appMessage,
        "결제상태를 " +
        select.value +
        "로 변경했습니다.",
        "success"
      );

      await loadOrders();
    }

    async function markPaymentComplete(
      orderId
    ) {
      const { error } =
        await sb
          .from("orders")
          .update({
            payment_status:
              "결제 완료"
          })
          .eq("id", orderId);

      if (error) {
        showAppError(error);
        return;
      }

      setMessage(
        appMessage,
        "결제 완료로 처리했습니다.",
        "success"
      );

      await loadOrders();
    }

    async function updateOrderStatus(
      orderId
    ) {
      const select =
        document.getElementById(
          "order-status-edit-" + orderId
        );

      if (!select) return;

      const currentOrder = orders.find(order => order.id === orderId);
      const completed = /픽업 완료|배송 완료/.test(select.value);
      const updateValues = { order_status: select.value };
      if (completed && !currentOrder?.completed_at) updateValues.completed_at = new Date().toISOString();
      if (!completed && currentOrder?.completed_at) updateValues.completed_at = null;

      const { error } =
        await sb
          .from("orders")
          .update(updateValues)
          .eq("id", orderId);

      if (error) {
        showAppError(error);
        return;
      }

      setMessage(
        appMessage,
        "주문상태를 " +
        select.value +
        "로 변경했습니다.",
        "success"
      );

      await loadOrders();
    }

    function isPaymentCompleted(
      status
    ) {
      const value =
        String(status || "");

      return (
        value.includes("결제 완료") ||
        value.includes("입금 완료") ||
        value.includes("카드 자동 결제 완료")
      );
    }

    async function togglePickupComplete(
      orderId,
      completed
    ) {
      const currentOrder =
        orders.find(
          function (order) {
            return order.id === orderId;
          }
        );

      if (
        !completed &&
        !isPaymentCompleted(
          currentOrder?.payment_status
        )
      ) {
        alert(
          "먼저 결제상태를 결제 완료 또는 입금 완료로 변경해주세요."
        );
        return;
      }

      const accepted =
        confirm(
          completed
            ? "픽업 완료 처리를 취소할까요? 이 주문은 완료 매출에서 제외됩니다."
            : "이 주문을 픽업 완료로 처리할까요? 완료 날짜의 매출에 포함됩니다."
        );

      if (!accepted) return;

      const updateValues =
        completed
          ? {
              order_status:
                "픽업 가능",
              completed_at: null
            }
          : {
              order_status:
                "픽업 완료",
              completed_at:
                new Date().toISOString()
            };

      const { error } =
        await sb
          .from("orders")
          .update(updateValues)
          .eq("id", orderId);

      if (error) {
        showAppError(error);
        return;
      }

      setMessage(
        appMessage,
        completed
          ? "픽업 완료를 취소했습니다."
          : "픽업 완료 처리했습니다. 매출 달력에 반영됩니다.",
        "success"
      );

      await loadOrders();
    }

    async function deleteOrder(
      id,
      number
    ) {
      const accepted =
        confirm(
          "주문번호 " +
          number +
          " 전체를 삭제할까요?"
        );

      if (!accepted) return;

      const { error } = await sb.rpc("delete_order_with_stock", {
        p_order_id: id
      });

      if (error) {
        showAppError(error);
        return;
      }

      setMessage(
        appMessage,
        "주문을 삭제했습니다.",
        "success"
      );

      await Promise.all([loadProducts(), loadOrders()]);
    }

    function renderCustomers() {
      const target =
        document.getElementById(
          "customerList"
        );

      const keyword =
        document
          .getElementById(
            "customerSearch"
          )
          .value
          .trim()
          .toLocaleLowerCase(
            "ko-KR"
          );

      const filtered =
        customers.filter(
          function (customer) {
            return (
              !keyword ||
              String(
                customer.nickname || ""
              )
                .toLocaleLowerCase(
                  "ko-KR"
                )
                .includes(keyword)
            );
          }
        );

      target.classList.toggle(
        "open",
        memberListOpen
      );

      document
        .getElementById(
          "customerListToggle"
        )
        .textContent =
          memberListOpen
            ? (
                "회원 목록 접기 ▲ (" +
                customers.length +
                "명)"
              )
            : (
                "회원 목록 펼치기 ▼ (" +
                customers.length +
                "명)"
              );

      document
        .getElementById(
          "customerListInfo"
        )
        .textContent =
          keyword
            ? (
                "검색 결과 " +
                filtered.length +
                "명"
              )
            : (
                "등록 회원 " +
                customers.length +
                "명"
              );

      if (!filtered.length) {
        target.innerHTML = `
          <div class="muted">
            표시할 회원이 없습니다.
          </div>
        `;
        return;
      }

      target.innerHTML =
        filtered.map(
          function (customer) {
            return `
              <div class="list-row">
                <div class="list-row-main">
                  <p class="list-row-title">
                    ${escapeHtml(customer.nickname)}
                  </p>

                  <p class="list-row-meta">
                    ${escapeHtml(customer.memo || "메모 없음")}
                  </p>
                </div>

                <div class="actions" style="margin-top:0;">
                  <button
                    class="button light small"
                    type="button"
                    data-customer-edit="${escapeHtml(customer.id)}"
                  >
                    수정
                  </button>

                  <button
                    class="button danger small"
                    type="button"
                    data-customer-delete="${escapeHtml(customer.id)}"
                  >
                    삭제
                  </button>
                </div>
              </div>
            `;
          }
        ).join("");

      target
        .querySelectorAll(
          "[data-customer-edit]"
        )
        .forEach(
          function (button) {
            button.addEventListener(
              "click",
              function () {
                const customer =
                  customers.find(
                    function (item) {
                      return (
                        item.id ===
                        button.dataset.customerEdit
                      );
                    }
                  );

                if (customer) {
                  editCustomer(
                    customer.id,
                    customer.nickname,
                    customer.memo
                  );
                }
              }
            );
          }
        );

      target
        .querySelectorAll(
          "[data-customer-delete]"
        )
        .forEach(
          function (button) {
            button.addEventListener(
              "click",
              function () {
                const customer =
                  customers.find(
                    function (item) {
                      return (
                        item.id ===
                        button.dataset.customerDelete
                      );
                    }
                  );

                if (customer) {
                  deleteCustomer(
                    customer.id,
                    customer.nickname
                  );
                }
              }
            );
          }
        );
    }

    function renderCustomerSelect() {
      const target =
        document.getElementById(
          "orderCustomer"
        );

      const keyword =
        document
          .getElementById(
            "orderCustomerSearch"
          )
          .value
          .trim()
          .toLocaleLowerCase(
            "ko-KR"
          );

      const previousValue =
        target.value;

      const filtered =
        customers.filter(
          function (customer) {
            return (
              !keyword ||
              String(
                customer.nickname || ""
              )
                .toLocaleLowerCase(
                  "ko-KR"
                )
                .includes(keyword)
            );
          }
        );

      target.innerHTML = `
        <option value="">
          닉네임을 선택하세요
        </option>
      ` +
      filtered.map(
        function (customer) {
          return `
            <option value="${escapeHtml(customer.id)}">
              ${escapeHtml(customer.nickname)}
            </option>
          `;
        }
      ).join("");

      if (
        filtered.some(
          function (customer) {
            return customer.id === previousValue;
          }
        )
      ) {
        target.value = previousValue;
      }

      document
        .getElementById(
          "orderCustomerSearchInfo"
        )
        .textContent =
          keyword
            ? (
                "검색 결과 " +
                filtered.length +
                "명"
              )
            : (
                "등록 회원 " +
                customers.length +
                "명"
              );
    }

    function renderProducts() {
      const target =
        document.getElementById(
          "productList"
        );

      if (!products.length) {
        target.innerHTML = `
          <div class="muted">
            등록된 판매 상품이 없습니다.
          </div>
        `;
        return;
      }

      target.innerHTML =
        products.map(
          function (product) {
            return `
              <div class="product-summary-row">
                <div class="product-summary-mobile">
                  <div><strong>${escapeHtml(product.name)}</strong> <span>${formatWon(product.unit_price)} / ${escapeHtml(product.unit_name || "개")}</span></div>
                  <b>픽업: ${formatDate(product.pickup_date)}</b>
                  <em class="${Number(product.stock_quantity || 0) === 0 ? "sold-out" : ""}">${Number(product.stock_quantity || 0) === 0 ? "품절" : "남은 재고: " + Number(product.stock_quantity).toLocaleString("ko-KR") + "개"}</em>
                </div>
                <div class="product-summary-cell product-summary-name">
                  <span class="product-summary-label">상품명</span>
                  <strong>${escapeHtml(product.name)}</strong>
                </div>
                <div class="product-summary-cell">
                  <span class="product-summary-label">금액</span>
                  <strong>${formatWon(product.unit_price)}</strong>
                </div>
                <div class="product-summary-cell">
                  <span class="product-summary-label">수량 단위</span>
                  <strong>${escapeHtml(product.unit_name || "개")}</strong>
                </div>
                <div class="product-summary-cell product-summary-date">
                  <span class="product-summary-label">픽업 날짜</span>
                  <strong>${formatDate(product.pickup_date)}</strong>
                </div>
                <div class="product-summary-cell product-stock ${Number(product.stock_quantity || 0) === 0 ? "sold-out" : ""}">
                  <span class="product-summary-label">재고</span>
                  <strong>${Number(product.stock_quantity || 0) === 0 ? "품절" : "남은 재고: " + Number(product.stock_quantity).toLocaleString("ko-KR") + "개"}</strong>
                </div>

                <div class="product-action-buttons">
                <button class="button secondary small" type="button" data-product-edit="${escapeHtml(product.id)}">수정</button>
                <button
                  class="button danger small"
                  type="button"
                  data-product-deactivate="${escapeHtml(product.id)}"
                >
                  상품 내리기
                </button>
                </div>
              </div>
            `;
          }
        ).join("");

      target.querySelectorAll("[data-product-edit]").forEach(button => {
        button.addEventListener("click", () => {
          const product = products.find(item => item.id === button.dataset.productEdit);
          if (product) productEditor.open(product);
        });
      });

      target
        .querySelectorAll(
          "[data-product-deactivate]"
        )
        .forEach(
          function (button) {
            button.addEventListener(
              "click",
              function () {
                const product =
                  products.find(
                    function (item) {
                      return (
                        item.id ===
                        button.dataset.productDeactivate
                      );
                    }
                  );

                if (product) {
                  deactivateProduct(
                    product.id,
                    product.name
                  );
                }
              }
            );
          }
        );
    }

    function renderProductChecks() {
      const target =
        document.getElementById(
          "productChecks"
        );

      if (!products.length) {
        target.innerHTML = `
          <div class="muted">
            먼저 2번 공동구매 상품 관리에서 상품과 픽업 날짜를 등록해주세요.
          </div>
        `;

        updateTotalPreview();
        return;
      }

      target.innerHTML =
        products.map(
          function (product) {
            return `
              <label
                id="choice-${escapeHtml(product.id)}"
                class="product-choice ${Number(product.stock_quantity || 0) === 0 ? "sold-out" : ""}"
              >
                <input
                  id="check-${escapeHtml(product.id)}"
                  type="checkbox"
                  data-product-check="${escapeHtml(product.id)}"
                  ${Number(product.stock_quantity || 0) === 0 ? "disabled" : ""}
                >

                <span>
                  <strong>
                    ${escapeHtml(product.name)}
                  </strong>

                  <span class="muted">
                    ${formatWon(product.unit_price)}
                    /
                    ${escapeHtml(product.unit_name || "개")}
                  </span>

                  <span class="pickup-date-badge">
                    픽업:
                    ${formatDate(product.pickup_date)}
                  </span>

                  <span class="stock-badge ${Number(product.stock_quantity || 0) === 0 ? "sold-out" : ""}">
                    ${Number(product.stock_quantity || 0) === 0 ? "품절" : "남은 재고: " + Number(product.stock_quantity).toLocaleString("ko-KR") + "개"}
                  </span>
                </span>

                <input
                  id="qty-${escapeHtml(product.id)}"
                  type="number"
                  min="1"
                  step="1"
                  value="1"
                  aria-label="${escapeHtml(product.name)} 수량"
                  data-product-qty="${escapeHtml(product.id)}"
                  max="${Number(product.stock_quantity || 0)}"
                  ${Number(product.stock_quantity || 0) === 0 ? "disabled" : ""}
                >
              </label>
            `;
          }
        ).join("");

      target
        .querySelectorAll(
          "[data-product-check]"
        )
        .forEach(
          function (checkbox) {
            checkbox.addEventListener(
              "change",
              function () {
                const choice =
                  document.getElementById(
                    "choice-" +
                    checkbox.dataset.productCheck
                  );

                choice?.classList.toggle(
                  "selected",
                  checkbox.checked
                );

                updateTotalPreview();
              }
            );
          }
        );

      target
        .querySelectorAll(
          "[data-product-qty]"
        )
        .forEach(
          function (input) {
            input.addEventListener(
              "input",
              updateTotalPreview
            );
          }
        );

      updateTotalPreview();
    }

    function updateTotalPreview() {
      const total =
        products.reduce(
          function (sum, product) {
            const checkbox =
              document.getElementById(
                "check-" + product.id
              );

            if (
              !checkbox ||
              !checkbox.checked
            ) {
              return sum;
            }

            const quantity =
              Math.max(
                1,
                Number(
                  document
                    .getElementById(
                      "qty-" + product.id
                    )
                    ?.value || 1
                )
              );

            return (
              sum +
              Number(
                product.unit_price || 0
              ) *
              quantity
            );
          },
          0
        );

      document
        .getElementById(
          "totalPreview"
        )
        .textContent =
          formatWon(total);
    }

    function renderOrders() {
      const target =
        document.getElementById(
          "orderList"
        );

      const keyword =
        document
          .getElementById(
            "orderListSearch"
          )
          .value
          .trim()
          .toLocaleLowerCase(
            "ko-KR"
          );

      const openOrders = orders.filter(order =>
        window.DampickAdminCompletion.pendingItems(order, checkoutRequests).length > 0);
      const filtered =
        openOrders.filter(
          function (order) {
            const nickname =
              String(
                order.customers?.nickname ||
                ""
              )
                .toLocaleLowerCase(
                  "ko-KR"
                );

            return (
              !keyword ||
              nickname.includes(keyword)
            );
          }
        );

      target.classList.toggle(
        "open",
        orderListOpen
      );

      document
        .getElementById(
          "orderListToggle"
        )
        .textContent =
          orderListOpen
            ? (
                "주문 목록 접기 ▲ (" +
                openOrders.length +
                "건)"
              )
            : (
                "주문 목록 펼치기 ▼ (" +
                openOrders.length +
                "건)"
              );

      document
        .getElementById(
          "orderListInfo"
        )
        .textContent =
          keyword
            ? (
                "검색 결과 " +
                filtered.length +
                "건"
              )
            : (
                "등록 주문 " +
                openOrders.length +
                "건"
              );

      if (!filtered.length) {
        target.innerHTML = `
          <div class="muted">
            표시할 주문이 없습니다.
          </div>
        `;
        return;
      }

      target.innerHTML =
        filtered.map(
          function (order) {
            const items = window.DampickAdminCompletion.pendingItems(order, checkoutRequests);

            const completed = window.DampickAdminCompletion.pickupCompleted(order);
            const displayStatus = completed ? "문고리 배송 진행 중" : order.order_status || "주문 접수";

            const workflow = window.DampickOrderWorkflow.state(order);

            const total = getOrderTotal({ order_items: items });

            const itemsHtml =
              items.map(
                function (item) {
                  return `
                    <div class="order-item-edit-row">
                      <input
                        type="checkbox"
                        value="${escapeHtml(item.id)}"
                        data-order-item-check="${escapeHtml(order.id)}"
                        ${window.DampickAdminCompletion.isHomeItem(item, checkoutRequests) ? "disabled" : ""}
                      >

                      <span class="order-item-cell order-item-name"><small>상품명</small><strong>${escapeHtml(item.product_name)}</strong></span>
                      <span class="order-item-cell order-item-quantity-cell">
                        <small>수량 수정</small>
                        <span class="order-item-quantity-editor">
                          <input type="number" min="1" step="1" value="${Number(item.quantity || 1)}" data-order-item-quantity="${escapeHtml(item.id)}" aria-label="${escapeHtml(item.product_name)} 수량">
                          <span>${escapeHtml(item.unit_name || "개")}</span>
                          <button class="button secondary small quantity-save-button" type="button" data-order-item-save="${escapeHtml(item.id)}" data-order-id="${escapeHtml(order.id)}" aria-label="수량 저장"><span>수량</span><span>저장</span></button>
                        </span>
                      </span>
                      <span class="order-item-cell order-item-unit-price"><small>개당 금액</small><strong>${formatWon(item.unit_price)}</strong></span>
                      <span class="order-item-cell order-item-line-total"><small>상품 금액</small><strong>${formatWon(item.line_total)}</strong></span>
                      <span class="order-item-cell order-item-date"><small>픽업 날짜</small><strong>${formatDate(item.pickup_date)}</strong></span>
                    </div>
                  `;
                }
              ).join("");

            return `
              <article
                class="order-card"
              >
                <div class="order-head">
                  <div>
                    <strong>
                      ${escapeHtml(order.customers?.nickname || "고객")}
                    </strong>

                    <div class="muted">
                      주문일:
                      ${formatDate(order.order_date)}
                    </div>

                    <span class="order-status-badge">
                      ${escapeHtml(displayStatus)}
                    </span>

                    <span class="order-status-badge">
                      ${escapeHtml(order.payment_status || "고객 선택 대기")}
                    </span>
                  </div>

                  <span class="muted">
                    ${escapeHtml(order.order_number || "")}
                  </span>
                </div>

                <div class="order-item-edit-list">
                  ${itemsHtml}
                </div>

                ${
                  order.notice
                    ? `
                      <div class="muted">
                        안내:
                        ${escapeHtml(order.notice)}
                      </div>
                    `
                    : ""
                }

                <div class="order-total">
                  주문 상품 합계:
                  ${formatWon(total)}
                </div>

                <p class="order-workflow-guide" data-pickup-guide="${escapeHtml(order.id)}" aria-live="polite">${escapeHtml(window.DampickOrderWorkflow.pickupControl(order, 0).message)}</p>
                <div class="order-action-grid order-workflow-actions">
                  <button
                    class="button light"
                    type="button"
                    data-items-delete="${escapeHtml(order.id)}"
                  >
                    ① 체크 상품 취소
                  </button>

                  <button
                    class="button success"
                    type="button"
                    data-payment-complete="${escapeHtml(order.id)}"
                    ${workflow.paymentDisabled ? "disabled" : ""}
                  >
                    ${workflow.paid ? "② 결제 완료됨" : "② 결제 완료"}
                  </button>

                  <button
                    class="button success"
                    type="button"
                    data-pickup-toggle="${escapeHtml(order.id)}"
                    data-completed="false"
                    disabled
                  >
                    ${workflow.pickedUp ? "③ 픽업 완료됨" : "③ 픽업 완료"}
                  </button>

                  <button
                    class="button danger"
                    type="button"
                    data-order-delete="${escapeHtml(order.id)}"
                  >
                    ④ 주문 전체 삭제
                  </button>
                </div>
              </article>
            `;
          }
        ).join("");

      bindOrderActionButtons();
    }

    function bindOrderActionButtons() {
      document.querySelectorAll("[data-order-item-check]").forEach(function (checkbox) {
        checkbox.addEventListener("change", function () {
          updatePickupControl(checkbox.dataset.orderItemCheck);
        });
      });

      document
        .querySelectorAll(
          "[data-items-delete]"
        )
        .forEach(
          function (button) {
            button.addEventListener(
              "click",
              function () {
                deleteSelectedItems(
                  button.dataset.itemsDelete
                );
              }
            );
          }
        );

      document.querySelectorAll("[data-order-item-save]").forEach(function (button) {
        button.addEventListener("click", function () {
          updateOrderItemQuantity(button.dataset.orderItemSave, button.dataset.orderId);
        });
      });

      document
        .querySelectorAll(
          "[data-payment-save]"
        )
        .forEach(
          function (button) {
            button.addEventListener(
              "click",
              function () {
                updatePaymentStatus(
                  button.dataset.paymentSave
                );
              }
            );
          }
        );

      document
        .querySelectorAll(
          "[data-order-status-save]"
        )
        .forEach(
          function (button) {
            button.addEventListener(
              "click",
              function () {
                updateOrderStatus(
                  button.dataset.orderStatusSave
                );
              }
            );
          }
        );

      document
        .querySelectorAll(
          "[data-payment-complete]"
        )
        .forEach(
          function (button) {
            button.addEventListener(
              "click",
              function () {
                markPaymentComplete(
                  button.dataset.paymentComplete
                );
              }
            );
          }
        );

      document
        .querySelectorAll(
          "[data-pickup-toggle]"
        )
        .forEach(
          function (button) {
            button.addEventListener(
              "click",
              function () {
                if (!updatePickupControl(button.dataset.pickupToggle)) return;
                togglePickupComplete(
                  button.dataset.pickupToggle,
                  button.dataset.completed ===
                    "true"
                );
              }
            );
          }
        );

      document
        .querySelectorAll(
          "[data-order-delete]"
        )
        .forEach(
          function (button) {
            button.addEventListener(
              "click",
              function () {
                const order =
                  orders.find(
                    function (item) {
                      return (
                        item.id ===
                        button.dataset.orderDelete
                      );
                    }
                  );

                if (order) {
                  deleteOrder(
                    order.id,
                    order.order_number
                  );
                }
              }
            );
          }
        );
    }

    function updatePickupControl(orderId) {
      const order = orders.find(function (entry) { return entry.id === orderId; });
      const button = document.querySelector('[data-pickup-toggle="' + orderId + '"]');
      const guide = document.querySelector('[data-pickup-guide="' + orderId + '"]');
      if (!order || !button) return false;
      const selectedCount = document.querySelectorAll('[data-order-item-check="' + orderId + '"]:checked').length;
      const control = window.DampickOrderWorkflow.pickupControl(order, selectedCount);
      button.disabled = !control.enabled;
      if (guide) guide.textContent = control.message;
      return control.enabled;
    }

    function renderPaymentOptions(
      currentStatus
    ) {
      const statuses = [
        "고객 선택 대기",
        "입금 대기",
        "입금 확인 대기",
        "현장 결제 예정",
        "카드 인증 대기",
        "카드 결제 대기",
        "카드 자동 결제 완료",
        "입금 완료",
        "결제 완료"
      ];

      if (
        currentStatus &&
        !statuses.includes(
          currentStatus
        )
      ) {
        statuses.unshift(
          currentStatus
        );
      }

      return statuses.map(
        function (status) {
          return `
            <option
              ${status === currentStatus ? "selected" : ""}
            >
              ${escapeHtml(status)}
            </option>
          `;
        }
      ).join("");
    }

    function renderOrderStatusOptions(
      currentStatus
    ) {
      const statuses = [
        "주문 접수",
        "상품 준비 중",
        "픽업 가능",
        "픽업 완료",
        "선결제 확인 대기",
        "배송 준비 가능",
        "배송 준비 중",
        "배송 완료"
      ];

      if (
        currentStatus &&
        !statuses.includes(
          currentStatus
        )
      ) {
        statuses.unshift(
          currentStatus
        );
      }

      return statuses.map(
        function (status) {
          return `
            <option
              ${status === currentStatus ? "selected" : ""}
            >
              ${escapeHtml(status)}
            </option>
          `;
        }
      ).join("");
    }

    function getOrderTotal(order) {
      return (
        order.order_items || []
      ).reduce(
        function (sum, item) {
          return (
            sum +
            Number(
              item.line_total ??
              (
                Number(item.quantity || 0) *
                Number(item.unit_price || 0)
              )
            )
          );
        },
        0
      );
    }

    function getCompletedEntriesForMonth() {
      const monthValue =
        document
          .getElementById(
            "salesMonth"
          )
          .value;

      return window.DampickAdminCompletion.salesEntries(orders, checkoutRequests)
        .filter(entry => String(entry.date).slice(0, 7) === monthValue);
    }

    function renderSalesCalendar() {
      const monthInput =
        document.getElementById(
          "salesMonth"
        );

      if (!monthInput.value) {
        setCurrentMonth();
      }

      const [year, month] =
        monthInput.value
          .split("-")
          .map(Number);

      const completedEntries = getCompletedEntriesForMonth();

      const total = completedEntries.reduce((sum, entry) => sum + entry.total, 0);
      const productTotal = completedEntries.reduce((sum, entry) => sum + entry.productAmount, 0);
      const deliveryTotal = completedEntries.reduce((sum, entry) => sum + entry.deliveryFee, 0);

      const itemCount = completedEntries.reduce((sum, entry) => sum + entry.itemCount, 0);

      document
        .getElementById(
          "monthlyOrderCount"
        )
        .textContent =
          completedEntries.length +
          "건";

      document.getElementById("monthlyProductTotal").textContent = formatWon(productTotal);
      document.getElementById("monthlyDeliveryTotal").textContent = formatWon(deliveryTotal);

      document
        .getElementById(
          "monthlyItemCount"
        )
        .textContent =
          itemCount.toLocaleString(
            "ko-KR"
          ) +
          "개";

      document
        .getElementById(
          "monthlySalesTotal"
        )
        .textContent =
          formatWon(total);

      const firstDay =
        new Date(
          year,
          month - 1,
          1
        );

      const lastDate =
        new Date(
          year,
          month,
          0
        ).getDate();

      const dailyMap =
        new Map();

      completedEntries.forEach(
        function (entry) {
          const date =
            String(
              entry.date
            ).slice(0, 10);

          if (!dailyMap.has(date)) {
            dailyMap.set(
              date,
              []
            );
          }

          dailyMap
            .get(date)
            .push(entry);
        }
      );

      const calendar =
        document.getElementById(
          "salesCalendar"
        );

      const cells = [];

      for (
        let i = 0;
        i < firstDay.getDay();
        i += 1
      ) {
        cells.push(
          '<div class="calendar-empty"></div>'
        );
      }

      for (
        let day = 1;
        day <= lastDate;
        day += 1
      ) {
        const date =
          [
            year,
            String(month).padStart(2, "0"),
            String(day).padStart(2, "0")
          ].join("-");

        const dayEntries =
          dailyMap.get(date) || [];

        const dayTotal = dayEntries.reduce((sum, entry) => sum + entry.total, 0);

        cells.push(`
          <button
            class="
              calendar-day
              ${dayEntries.length ? "has-sales" : ""}
              ${selectedSalesDate === date ? "selected" : ""}
            "
            type="button"
            data-sales-date="${date}"
          >
            <span class="calendar-date-number">
              ${day}
            </span>

            ${
              dayEntries.length
                ? `
                  <span class="calendar-sales-amount">
                    ${formatWon(dayTotal)}
                  </span>
                `
                : ""
            }
          </button>
        `);
      }

      calendar.innerHTML =
        cells.join("");

      calendar
        .querySelectorAll(
          "[data-sales-date]"
        )
        .forEach(
          function (button) {
            button.addEventListener(
              "click",
              function () {
                selectedSalesDate =
                  button.dataset.salesDate;

                renderSalesCalendar();
                renderDailySalesDetail();
              }
            );
          }
        );

      renderDailySalesDetail();
    }

    function renderDailySalesDetail() {
      const target =
        document.getElementById(
          "dailySalesDetail"
        );

      if (!selectedSalesDate) {
        target.textContent =
          "날짜를 누르면 해당 날짜의 완료 주문이 표시됩니다.";
        return;
      }

      const dayEntries = window.DampickAdminCompletion.salesEntries(orders, checkoutRequests)
        .filter(entry => String(entry.date).slice(0, 10) === selectedSalesDate);

      if (!dayEntries.length) {
        target.innerHTML = `
          <strong>${formatDate(selectedSalesDate)}</strong><br>
          완료 매출이 없습니다.
        `;
        return;
      }

      const total = dayEntries.reduce((sum, entry) => sum + entry.total, 0);

      target.innerHTML = `
        <strong>
          ${formatDate(selectedSalesDate)}
          · ${formatWon(total)}
        </strong>

        ${dayEntries.map(
          function (entry) {
            return `
              <div class="daily-sales-row">
                <span>
                  ${escapeHtml(entry.nickname)} · ${escapeHtml(entry.kind)}
                  ${entry.dateIsFallback ? `<small> · 완료일 대체값 (${escapeHtml(entry.dateSource)})</small>` : ""}
                </span>

                <strong>
                  ${formatWon(entry.total)}
                </strong>
              </div>
            `;
          }
        ).join("")}
      `;
    }

    function downloadMonthlyExcel() {
      if (
        typeof XLSX === "undefined"
      ) {
        alert(
          "엑셀 라이브러리를 불러오지 못했습니다."
        );
        return;
      }

      const month =
        document
          .getElementById(
            "salesMonth"
          )
          .value;

      const rows = getCompletedEntriesForMonth().map(entry => ({
        고객닉네임: entry.nickname,
        주문또는신청번호: entry.code,
        완료구분: entry.kind,
        완료일: String(entry.date).slice(0, 10),
        완료일근거: entry.dateIsFallback ? `완료일 대체값 (${entry.dateSource})` : "실제 완료일",
        상품수량: entry.itemCount,
        상품매출: entry.productAmount,
        배송비: entry.deliveryFee,
        총완료매출: entry.total
      }));

      downloadExcel(
        rows,
        "담픽_" +
        month +
        "_완료매출.xlsx"
      );
    }

    function downloadAllExcel() {
      if (
        typeof XLSX === "undefined"
      ) {
        alert(
          "엑셀 라이브러리를 불러오지 못했습니다."
        );
        return;
      }

      const rows =
        makeExcelRows(orders);

      downloadExcel(
        rows,
        "담픽_전체주문.xlsx"
      );
    }

    function makeExcelRows(
      sourceOrders
    ) {
      const rows = [];

      sourceOrders.forEach(
        function (order) {
          const items =
            order.order_items || [];

          items.forEach(
            function (item) {
              rows.push({
                고객닉네임:
                  order.customers?.nickname ||
                  "",
                주문번호:
                  order.order_number ||
                  "",
                주문일:
                  order.order_date ||
                  "",
                상품명:
                  item.product_name ||
                  "",
                수량:
                  Number(
                    item.quantity || 0
                  ),
                단위:
                  item.unit_name ||
                  "개",
                단가:
                  Number(
                    item.unit_price || 0
                  ),
                금액:
                  Number(
                    item.line_total ??
                    (
                      Number(item.quantity || 0) *
                      Number(item.unit_price || 0)
                    )
                  ),
                상품픽업날짜:
                  item.pickup_date ||
                  "",
                결제상태:
                  order.payment_status ||
                  "",
                주문상태:
                  order.order_status ||
                  "",
                완료일:
                  order.completed_at
                    ? String(
                        order.completed_at
                      ).slice(0, 10)
                    : "",
                안내사항:
                  order.notice ||
                  ""
              });
            }
          );
        }
      );

      return rows;
    }

    function downloadExcel(
      rows,
      filename
    ) {
      const workbook =
        XLSX.utils.book_new();

      const sheet =
        XLSX.utils.json_to_sheet(
          rows.length
            ? rows
            : [
                {
                  안내:
                    "표시할 주문이 없습니다."
                }
              ]
        );

      XLSX.utils.book_append_sheet(
        workbook,
        sheet,
        "주문내역"
      );

      XLSX.writeFile(
        workbook,
        filename
      );
    }

    function setToday() {
      const today =
        new Date();

      document
        .getElementById(
          "orderDate"
        )
        .value =
          toDateInputValue(today);

      setDefaultProductPickupDate();
    }

    function setDefaultProductPickupDate() {
      const target =
        document.getElementById(
          "newProductPickupDate"
        );

      if (!target || target.value) {
        return;
      }

      const date =
        new Date();

      date.setDate(
        date.getDate() + 1
      );

      target.value =
        toDateInputValue(date);
    }

    function setCurrentMonth() {
      const now =
        new Date();

      document
        .getElementById(
          "salesMonth"
        )
        .value =
          [
            now.getFullYear(),
            String(
              now.getMonth() + 1
            ).padStart(2, "0")
          ].join("-");
    }

    function toDateInputValue(
      date
    ) {
      return [
        date.getFullYear(),
        String(
          date.getMonth() + 1
        ).padStart(2, "0"),
        String(
          date.getDate()
        ).padStart(2, "0")
      ].join("-");
    }

    function makeOrderNumber() {
      const now =
        new Date();

      return (
        "DP-" +
        now
          .toISOString()
          .replace(/\D/g, "")
          .slice(0, 14) +
        "-" +
        Math.floor(
          1000 +
          Math.random() * 9000
        )
      );
    }

    function formatWon(value) {
      return (
        Number(value || 0)
          .toLocaleString("ko-KR") +
        "원"
      );
    }

      function formatDate(value) {
      if (!value) {
        return "날짜 미정";
      }

      const date =
        new Date(
          String(value).slice(0, 10) +
          "T00:00:00"
        );

      if (
        Number.isNaN(
          date.getTime()
        )
      ) {
        return String(value);
      }

      const weekdays = [
        "일",
        "월",
        "화",
        "수",
        "목",
        "금",
        "토"
      ];

      const weekday =
        weekdays[date.getDay()];

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

    function setMessage(
      element,
      text,
      type
    ) {
      element.textContent = text;
      element.className =
        text
          ? (
              "message show " +
              (type || "info")
            )
          : "message";
    }

    function clearMessage(
      element
    ) {
      setMessage(
        element,
        "",
        ""
      );
    }

    function showAppError(error) {
      console.error(error);

      setMessage(
        appMessage,
        error?.message ||
        "데이터를 처리하는 중 오류가 발생했습니다.",
        "error"
      );
    }

    function escapeHtml(value) {
      return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
    }
