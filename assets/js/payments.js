"use strict";

    const sb =
      window.dampickSupabase;

    const loginCard =
      document.getElementById(
        "loginCard"
      );

    const app =
      document.getElementById(
        "app"
      );

    const customerList =
      document.getElementById(
        "customerList"
      );

    const message =
      document.getElementById(
        "message"
      );

    const nicknameSearch =
      document.getElementById(
        "nicknameSearch"
      );

    let orders = [];
    let requests = [];
    let customers = [];

    document
      .getElementById(
        "loginButton"
      )
      .addEventListener(
        "click",
        login
      );

    document
      .getElementById(
        "logoutButton"
      )
      .addEventListener(
        "click",
        logout
      );

    document
      .getElementById(
        "refreshButton"
      )
      .addEventListener(
        "click",
        loadAll
      );

    document
      .getElementById(
        "searchButton"
      )
      .addEventListener(
        "click",
        render
      );

    document
      .getElementById(
        "clearButton"
      )
      .addEventListener(
        "click",
        function () {
          nicknameSearch.value = "";
          document
            .getElementById(
              "statusFilter"
            )
            .value = "all";
          render();
        }
      );

    nicknameSearch.addEventListener(
      "keydown",
      function (event) {
        if (event.key === "Enter") {
          render();
        }
      }
    );

    nicknameSearch.addEventListener(
      "input",
      render
    );

    document
      .getElementById(
        "statusFilter"
      )
      .addEventListener(
        "change",
        render
      );

    customerList.addEventListener(
      "click",
      handleAction
    );

    initialize();

    async function initialize() {
      if (!sb) {
        showMessage(
          "Supabase 연결정보를 불러오지 못했습니다.",
          "error"
        );
        return;
      }

      const { data } =
        await sb.auth.getSession();

      if (data.session) {
        showApp();
        await loadAll();
      }
    }

    async function login() {
      clearMessage();

      const email =
        document
          .getElementById(
            "email"
          )
          .value
          .trim();

      const password =
        document
          .getElementById(
            "password"
          )
          .value;

      const { error } =
        await sb.auth
          .signInWithPassword({
            email,
            password
          });

      if (error) {
        showMessage(
          error.message ||
          "로그인하지 못했습니다.",
          "error"
        );
        return;
      }

      showApp();
      await loadAll();
    }

    async function logout() {
      await sb.auth.signOut();

      app.classList.add(
        "hidden"
      );

      loginCard.classList.remove(
        "hidden"
      );
    }

    function showApp() {
      loginCard.classList.add(
        "hidden"
      );

      app.classList.remove(
        "hidden"
      );
    }

    async function loadAll() {
      clearMessage();

      const [
        ordersResult,
        requestsResult
      ] = await Promise.all([
        sb
          .from("orders")
          .select(`
            id,
            customer_id,
            order_number,
            order_date,
            payment_status,
            order_status,
            notice,
            completed_at,
            created_at,
            is_visible,
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
          .eq("is_visible", true)
          .order(
            "created_at",
            {
              ascending: false
            }
          ),

        sb
          .from(
            "checkout_requests"
          )
          .select(`
            *,
            checkout_request_items(
              id,
              order_item_id,
              order_number,
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
            "updated_at",
            {
              ascending: false
            }
          )
      ]);

      if (ordersResult.error) {
        showMessage(
          ordersResult.error.message ||
          "주문 목록을 불러오지 못했습니다.",
          "error"
        );
        return;
      }

      if (requestsResult.error) {
        showMessage(
          requestsResult.error.message ||
          "결제·배송 신청을 불러오지 못했습니다. 먼저 1단계 SQL을 실행했는지 확인해주세요.",
          "error"
        );
        return;
      }

      orders =
        Array.isArray(
          ordersResult.data
        )
          ? ordersResult.data
          : [];

      requests =
        Array.isArray(
          requestsResult.data
        )
          ? requestsResult.data
          : [];

      buildCustomers();
      render();
    }

    function buildCustomers() {
      const map =
        new Map();

      orders.forEach(
        function (order) {
          const customerId =
            String(
              order.customer_id || ""
            );

          if (!map.has(customerId)) {
            map.set(
              customerId,
              {
                id:
                  customerId,
                nickname:
                  order.customers?.nickname ||
                  "고객",
                orders: [],
                requests: []
              }
            );
          }

          map.get(customerId)
            .orders.push(order);
        }
      );

      requests.forEach(
        function (request) {
          const customerId =
            String(
              request.customer_id || ""
            );

          if (!map.has(customerId)) {
            map.set(
              customerId,
              {
                id:
                  customerId,
                nickname:
                  request.nickname_snapshot ||
                  "고객",
                orders: [],
                requests: []
              }
            );
          }

          map.get(customerId)
            .requests.push(request);
        }
      );

      customers =
        Array.from(
          map.values()
        )
        // 관리자 주문 입력만으로는 결제·배송 관리에 노출하지 않습니다.
        // 고객이 제출한 유효한 checkout_request가 있어야 합니다.
        .filter(window.DampickPaymentsVisibility.hasActiveRequest)
        .sort(
          function (a, b) {
            return String(a.nickname)
              .localeCompare(
                String(b.nickname),
                "ko"
              );
          }
        );
    }

    function getActiveRequests(
      customer
    ) {
      return customer.requests.filter(
        window.DampickPaymentsVisibility.isActiveRequest
      );
    }

    function makeItemRequestMap(
      customer
    ) {
      const map =
        new Map();

      getActiveRequests(customer)
        .forEach(
          function (request) {
            const items =
              Array.isArray(
                request.checkout_request_items
              )
                ? request.checkout_request_items
                : [];

            items.forEach(
              function (item) {
                const id =
                  String(
                    item.order_item_id ||
                    ""
                  );

                if (
                  id &&
                  !map.has(id)
                ) {
                  map.set(
                    id,
                    request
                  );
                }
              }
            );
          }
        );

      return map;
    }

    function getCustomerState(
      customer
    ) {
      const itemMap =
        makeItemRequestMap(
          customer
        );

      const allItems =
        customer.orders.flatMap(
          function (order) {
            return Array.isArray(
              order.order_items
            )
              ? order.order_items
              : [];
          }
        );

      const defaultItems =
        allItems.filter(
          function (item) {
            return !itemMap.has(
              String(item.id)
            );
          }
        );

      const activeRequests =
        getActiveRequests(
          customer
        );

      const paymentWait =
        activeRequests.some(
          function (request) {
            return !isPaymentCompleted(
              request.payment_status
            );
          }
        );

      const hasHome =
        activeRequests.some(
          function (request) {
            return request.receipt_method ===
              "home";
          }
        );

      const allOrdersComplete =
        customer.orders.length > 0 &&
        customer.orders.every(
          function (order) {
            return Boolean(
              order.completed_at
            );
          }
        );

      return {
        itemMap,
        allItems,
        defaultItems,
        activeRequests,
        paymentWait,
        hasHome,
        allOrdersComplete
      };
    }

    function getFilteredCustomers() {
      const query =
        normalize(
          nicknameSearch.value
        );

      const status =
        document
          .getElementById(
            "statusFilter"
          )
          .value;

      let matched =
        customers;

      if (query) {
        const exact =
          customers.filter(
            function (customer) {
              return (
                normalize(
                  customer.nickname
                ) === query
              );
            }
          );

        matched =
          exact.length
            ? exact
            : customers.filter(
                function (customer) {
                  return normalize(
                    customer.nickname
                  ).includes(query);
                }
              );
      }

      return matched.filter(
        function (customer) {
          const state =
            getCustomerState(
              customer
            );

          if (status === "default") {
            return (
              state.defaultItems.length > 0
            );
          }

          if (
            status ===
            "payment-wait"
          ) {
            return state.paymentWait;
          }

          if (status === "home") {
            return state.hasHome;
          }

          if (
            status ===
            "complete"
          ) {
            return (
              state.allOrdersComplete
            );
          }

          return true;
        }
      );
    }

    function render() {
      const filtered =
        getFilteredCustomers();

      updateSummary(filtered);

      if (!filtered.length) {
        customerList.innerHTML = `
          <section class="card empty">
            조건에 맞는 고객 주문이 없습니다.
          </section>
        `;
        return;
      }

      customerList.innerHTML =
        filtered
          .map(renderCustomer)
          .join("");
    }

    function updateSummary(
      filtered
    ) {
      const states =
        filtered.map(
          getCustomerState
        );

      const orderCount =
        filtered.reduce(
          function (sum, customer) {
            return (
              sum +
              customer.orders.length
            );
          },
          0
        );

      const defaultCount =
        states.reduce(
          function (sum, state) {
            return (
              sum +
              state.defaultItems.length
            );
          },
          0
        );

      const completedCount =
        filtered.reduce(
          function (sum, customer) {
            return (
              sum +
              customer.orders.filter(
                function (order) {
                  return Boolean(
                    order.completed_at
                  );
                }
              ).length
            );
          },
          0
        );

      document
        .getElementById(
          "customerCount"
        )
        .textContent =
          filtered.length + "명";

      document
        .getElementById(
          "orderCount"
        )
        .textContent =
          orderCount + "건";

      document
        .getElementById(
          "defaultItemCount"
        )
        .textContent =
          defaultCount + "개";

      document
        .getElementById(
          "completedOrderCount"
        )
        .textContent =
          completedCount + "건";
    }

    function renderCustomer(
      customer
    ) {
      const state =
        getCustomerState(
          customer
        );

      const total =
        state.allItems.reduce(
          function (sum, item) {
            return (
              sum +
              Number(
                item.line_total ??
                (
                  Number(
                    item.unit_price || 0
                  ) *
                  Number(
                    item.quantity || 0
                  )
                )
              )
            );
          },
          0
        );

      const ordersHtml =
        customer.orders
          .map(
            function (order) {
              return renderOrder(
                order,
                state.itemMap
              );
            }
          )
          .join("");

      const requestHtml =
        state.activeRequests.length
          ? `
              <section class="request-section">
                <h3>
                  고객 결제·배송 변경 신청
                </h3>

                ${state.activeRequests
                  .map(renderRequest)
                  .join("")}
              </section>
            `
          : "";

      return `
        <article class="customer-card">
          <header class="customer-head">
            <div>
              <div class="customer-name">
                ${escapeHtml(
                  customer.nickname
                )}
              </div>

              <div class="customer-meta">
                주문 ${customer.orders.length}건 ·
                상품 ${state.allItems.length}개
              </div>
            </div>

            <div class="customer-total">
              <span>전체 주문금액</span>
              <strong>
                ${formatWon(total)}
              </strong>
            </div>
          </header>

          <div class="customer-body">
            ${ordersHtml}
            ${requestHtml}
          </div>
        </article>
      `;
    }

    function renderOrder(
      order,
      itemMap
    ) {
      const items =
        Array.isArray(
          order.order_items
        )
          ? [...order.order_items]
              .sort(
                function (a, b) {
                  return String(
                    a.pickup_date || ""
                  ).localeCompare(
                    String(
                      b.pickup_date || ""
                    )
                  );
                }
              )
          : [];

      const total =
        items.reduce(
          function (sum, item) {
            return (
              sum +
              Number(
                item.line_total ??
                (
                  Number(
                    item.unit_price || 0
                  ) *
                  Number(
                    item.quantity || 0
                  )
                )
              )
            );
          },
          0
        );

      const itemsHtml =
        items.map(
          function (item) {
            return renderItem(
              item,
              itemMap.get(
                String(item.id)
              )
            );
          }
        ).join("");

      return `
        <section class="order-block">
          <div class="order-head">
            <div>
              <div class="order-number">
                주문 ${escapeHtml(
                  order.order_number || ""
                )}
              </div>

              <div>
                <span class="badge">
                  주문일
                  ${formatDate(
                    order.order_date ||
                    order.created_at
                  )}
                </span>

                <span class="badge">
                  ${escapeHtml(
                    order.payment_status ||
                    "현장 결제 예정"
                  )}
                </span>

                <span class="
                  badge
                  ${order.completed_at
                    ? "success"
                    : ""}
                ">
                  ${escapeHtml(
                    order.order_status ||
                    "주문 접수"
                  )}
                </span>
              </div>
            </div>

            <strong>
              ${formatWon(total)}
            </strong>
          </div>

          ${
            order.notice
              ? `
                <div class="order-note">
                  고객 안내:
                  ${escapeHtml(
                    order.notice
                  )}
                </div>
              `
              : ""
          }

          <div class="item-list">
            ${itemsHtml}
          </div>
        </section>
      `;
    }

    function renderItem(
      item,
      request
    ) {
      const total =
        Number(
          item.line_total ??
          (
            Number(
              item.unit_price || 0
            ) *
            Number(
              item.quantity || 0
            )
          )
        );

      if (!request) {
        return `
          <div class="
            item-row
            default-item
          ">
            <div>
              <div class="item-name">
                ${escapeHtml(
                  item.product_name ||
                  "상품"
                )}
              </div>

              <div class="item-meta">
                ${Number(
                  item.quantity || 0
                ).toLocaleString("ko-KR")}
                ${escapeHtml(
                  item.unit_name ||
                  "개"
                )}
                · 픽업
                ${formatDate(
                  item.pickup_date
                )}
              </div>

              <div>
                <span class="
                  badge
                  default
                ">
                  기본: 매장 픽업
                </span>

                <span class="
                  badge
                  default
                ">
                  픽업 시 결제
                </span>
              </div>

              <button
                class="
                  button
                  success
                  item-button
                "
                type="button"
                data-action="default-complete"
                data-item-id="${escapeHtml(
                  item.id
                )}"
              >
                현장 결제·픽업 완료
              </button>
            </div>

            <div class="item-price">
              ${formatWon(total)}
            </div>
          </div>
        `;
      }

      return `
        <div class="item-row">
          <div>
            <div class="item-name">
              ${escapeHtml(
                item.product_name ||
                "상품"
              )}
            </div>

            <div class="item-meta">
              ${Number(
                item.quantity || 0
              ).toLocaleString("ko-KR")}
              ${escapeHtml(
                item.unit_name ||
                "개"
              )}
              · 픽업
              ${formatDate(
                item.pickup_date
              )}
            </div>

            <div>
              <span class="
                badge
                ${request.receipt_method ===
                  "home"
                    ? "home"
                    : ""}
              ">
                ${escapeHtml(
                  getReceiptLabel(
                    request.receipt_method
                  )
                )}
              </span>

              <span class="badge">
                ${escapeHtml(
                  getPaymentLabel(
                    request.payment_method
                  )
                )}
              </span>

              <span class="
                badge
                ${isPaymentCompleted(
                  request.payment_status
                )
                  ? "success"
                  : ""}
              ">
                ${escapeHtml(
                  request.payment_status ||
                  ""
                )}
              </span>

              <span class="
                badge
                ${isFulfillmentCompleted(
                  request.fulfillment_status
                )
                  ? "success"
                  : ""}
              ">
                ${escapeHtml(
                  request.fulfillment_status ||
                  ""
                )}
              </span>
            </div>
          </div>

          <div class="item-price">
            ${formatWon(total)}
          </div>
        </div>
      `;
    }

    function renderRequest(
      request
    ) {
      const isHome =
        request.receipt_method ===
        "home";

      const isPaid =
        isPaymentCompleted(
          request.payment_status
        );

      const isCompleted =
        isFulfillmentCompleted(
          request.fulfillment_status
        );

      return `
        <article
          class="
            request-card
            ${isHome ? "home" : ""}
          "
          data-request-id="${escapeHtml(
            request.id
          )}"
        >
          <div class="request-head">
            <div>
              <div class="request-code">
                ${escapeHtml(
                  request.request_code ||
                  ""
                )}
              </div>

              <div>
                <span class="
                  badge
                  ${isHome ? "home" : ""}
                ">
                  ${escapeHtml(
                    getReceiptLabel(
                      request.receipt_method
                    )
                  )}
                </span>

                <span class="badge">
                  ${escapeHtml(
                    getPaymentLabel(
                      request.payment_method
                    )
                  )}
                </span>

                <span class="
                  badge
                  ${isPaid
                    ? "success"
                    : ""}
                ">
                  ${escapeHtml(
                    request.payment_status ||
                    ""
                  )}
                </span>

                <span class="
                  badge
                  ${isCompleted
                    ? "success"
                    : ""}
                ">
                  ${escapeHtml(
                    request.fulfillment_status ||
                    ""
                  )}
                </span>
              </div>
            </div>

            <div class="amount">
              ${formatWon(
                request.final_amount
              )}
            </div>
          </div>

          <div class="detail-grid">
            <div class="detail-box">
              <strong>선택 상품금액</strong>
              ${formatWon(
                request.product_amount
              )}<br>
              배송비:
              ${
                Number(
                  request.delivery_fee || 0
                ) === 0
                  ? "무료"
                  : formatWon(
                      request.delivery_fee
                    )
              }
            </div>

            <div class="detail-box">
              <strong>신청 상태</strong>
              ${escapeHtml(
                request.request_status ||
                ""
              )}
            </div>

            ${
              isHome
                ? `
                  <div class="
                    detail-box
                    sensitive
                  ">
                    <strong>휴대폰 번호</strong>
                    ${escapeHtml(
                      request.delivery_phone ||
                      "미입력"
                    )}
                  </div>

                  <div class="
                    detail-box
                    sensitive
                  ">
                    <strong>배송 주소</strong>
                    ${escapeHtml(
                      request.delivery_address ||
                      ""
                    )}
                  </div>

                  <div class="
                    detail-box
                    sensitive
                  ">
                    <strong>공동현관 출입정보</strong>
                    ${escapeHtml(
                      request.entrance_info ||
                      ""
                    )}
                  </div>

                  <div class="
                    detail-box
                    sensitive
                  ">
                    <strong>배송 요청사항</strong>
                    ${escapeHtml(
                      request.delivery_request ||
                      "없음"
                    )}
                  </div>
                `
                : ""
            }

            ${
              request.payment_method ===
                "card_online"
                ? `
                  <div class="detail-box">
                    <strong>카드 승인정보</strong>
                    승인시각:
                    ${escapeHtml(
                      formatDateTime(
                        request.toss_approved_at
                      )
                    )}
                    ${
                      request.toss_receipt_url
                        ? `
                          <br>
                          <a
                            href="${escapeHtml(
                              request.toss_receipt_url
                            )}"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            카드 영수증 보기
                          </a>
                        `
                        : ""
                    }
                  </div>
                `
                : ""
            }
          </div>

          <div class="actions">
            ${
              (
                request.receipt_method ===
                  "pickup" &&
                request.payment_method ===
                  "pickup_pay" &&
                !isPaid
              )
                ? `
                  <button
                    class="
                      button
                      success
                    "
                    type="button"
                    data-action="
                      payment-and-pickup-complete
                    "
                  >
                    현장 결제·픽업 완료
                  </button>
                `
                : `
                  <button
                    class="
                      button
                      success
                    "
                    type="button"
                    data-action="
                      payment-complete
                    "
                    ${isPaid
                      ? "disabled"
                      : ""}
                  >
                    ${isPaid
                      ? "결제 완료됨"
                      : "결제 완료 처리"}
                  </button>
                `
            }

            ${
              isHome
                ? `
                  <button
                    class="button"
                    type="button"
                    data-action="
                      delivery-ready
                    "
                    ${isPaid && !isCompleted
                      ? ""
                      : "disabled"}
                  >
                    배송 준비
                  </button>

                  <button
                    class="
                      button
                      secondary
                    "
                    type="button"
                    data-action="
                      delivery-complete
                    "
                    ${isPaid && !isCompleted
                      ? ""
                      : "disabled"}
                  >
                    배송 완료
                  </button>
                `
                : `
                  <button
                    class="
                      button
                      secondary
                    "
                    type="button"
                    data-action="
                      pickup-complete
                    "
                    ${isPaid && !isCompleted
                      ? ""
                      : "disabled"}
                  >
                    픽업 완료
                  </button>
                `
            }

            <button
              class="
                button
                danger
              "
              type="button"
              data-action="cancel"
              ${isCompleted
                ? "disabled"
                : ""}
            >
              변경 신청 취소
            </button>
          </div>
        </article>
      `;
    }

    async function handleAction(
      event
    ) {
      const button =
        event.target.closest(
          "button[data-action]"
        );

      if (!button) {
        return;
      }

      const action =
        String(
          button.dataset.action ||
          ""
        ).trim();

      if (
        action ===
        "default-complete"
      ) {
        const accepted =
          window.confirm(
            "이 상품의 현장 결제와 픽업을 완료 처리할까요?"
          );

        if (!accepted) {
          return;
        }

        button.disabled = true;

        try {
          const { data, error } =
            await sb.rpc(
              "complete_default_pickup_item",
              {
                p_order_item_id:
                  button.dataset.itemId
              }
            );

          if (error) {
            throw error;
          }

          showMessage(
            data?.message ||
            "현장 결제와 픽업을 완료 처리했습니다.",
            "success"
          );

          await loadAll();

        } catch (error) {
          console.error(error);

          showMessage(
            error.message ||
            "기본 주문상품을 완료 처리하지 못했습니다.",
            "error"
          );

        } finally {
          button.disabled = false;
        }

        return;
      }

      const requestCard =
        button.closest(
          ".request-card"
        );

      const requestId =
        requestCard?.dataset
          .requestId;

      if (!requestId) {
        return;
      }

      if (action === "cancel") {
        const accepted =
          window.confirm(
            "이 결제·배송 변경 신청을 취소할까요? 취소된 상품은 고객이 다시 선택할 수 있습니다."
          );

        if (!accepted) {
          return;
        }
      }

      button.disabled = true;

      try {
        const { data, error } =
          await sb.rpc(
            "process_checkout_request",
            {
              p_request_id:
                requestId,
              p_action:
                action
            }
          );

        if (error) {
          throw error;
        }

        showMessage(
          data?.message ||
          "처리가 완료되었습니다.",
          "success"
        );

        await loadAll();

      } catch (error) {
        console.error(error);

        showMessage(
          error.message ||
          "처리하지 못했습니다.",
          "error"
        );

      } finally {
        button.disabled = false;
      }
    }

    function isPaymentCompleted(
      status
    ) {
      const value =
        String(status || "");

      return (
        value.includes(
          "결제 완료"
        ) ||
        value.includes(
          "입금 완료"
        )
      );
    }

    function isFulfillmentCompleted(
      status
    ) {
      const value =
        String(status || "");

      return (
        value.includes(
          "픽업 완료"
        ) ||
        value.includes(
          "배송 완료"
        )
      );
    }

    function getReceiptLabel(
      value
    ) {
      return value === "home"
        ? "집 앞 배송"
        : "매장 픽업";
    }

    function getPaymentLabel(
      value
    ) {
      const labels = {
        pickup_pay:
          "픽업 시 결제",
        bank_transfer:
          "계좌이체",
        card_online:
          "카드결제"
      };

      return (
        labels[value] ||
        value ||
        ""
      );
    }

    function normalize(value) {
      return String(
        value || ""
      )
        .trim()
        .toLowerCase()
        .replace(
          /\s+/g,
          ""
        );
    }

    function formatDate(value) {
      if (!value) {
        return "날짜 미정";
      }

      const text =
        String(value);

      const date =
        new Date(
          text.length >= 10
            ? text.slice(0, 10) +
              "T00:00:00"
            : text
        );

      if (
        Number.isNaN(
          date.getTime()
        )
      ) {
        return text;
      }

      return new Intl.DateTimeFormat(
        "ko-KR",
        {
          year: "numeric",
          month: "long",
          day: "numeric"
        }
      ).format(date);
    }

    function formatDateTime(value) {
      if (!value) {
        return "확인 전";
      }

      const date =
        new Date(value);

      if (
        Number.isNaN(
          date.getTime()
        )
      ) {
        return String(value);
      }

      return new Intl.DateTimeFormat(
        "ko-KR",
        {
          year: "numeric",
          month: "long",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit"
        }
      ).format(date);
    }

    function formatWon(value) {
      return (
        Number(value || 0)
          .toLocaleString("ko-KR") +
        "원"
      );
    }

    function showMessage(
      text,
      type
    ) {
      message.textContent =
        text;

      message.className =
        "message show " +
        type;

      window.scrollTo({
        top: 0,
        behavior: "smooth"
      });
    }

    function clearMessage() {
      message.textContent = "";
      message.className =
        "message";
    }

    function escapeHtml(value) {
      return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
    }
