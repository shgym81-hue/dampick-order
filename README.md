# dampick-order
단픽 고객 주문조회 및 관리자 주문관리
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
  >

  <meta
    name="description"
    content="단픽 고객 주문조회 서비스"
  >

  <title>단픽 주문조회</title>

  <style>
    * {
      box-sizing: border-box;
    }

    :root {
      --main-color: #ef4f87;
      --main-dark: #d93d72;
      --main-light: #fff0f5;
      --background: #fff7fa;
      --text: #252525;
      --sub-text: #777777;
      --border: #e7e7e7;
      --success: #198754;
      --warning: #e78b00;
    }

    body {
      margin: 0;
      min-height: 100vh;
      font-family:
        "Pretendard",
        "Noto Sans KR",
        Arial,
        sans-serif;
      background:
        linear-gradient(
          180deg,
          #fff1f6 0%,
          #fffafb 48%,
          #ffffff 100%
        );
      color: var(--text);
    }

    button,
    input {
      font-family: inherit;
    }

    .page {
      width: 100%;
      max-width: 500px;
      min-height: 100vh;
      margin: 0 auto;
      padding: 38px 18px 50px;
    }

    .brand {
      text-align: center;
      margin-bottom: 28px;
    }

    .brand-name {
      margin: 0;
      font-size: 38px;
      font-weight: 900;
      letter-spacing: -1px;
      color: var(--main-color);
    }

    .brand-korean {
      margin-left: 5px;
      font-size: 17px;
      font-weight: 800;
      color: var(--main-dark);
    }

    .brand-slogan {
      margin: 7px 0 0;
      font-size: 14px;
      color: var(--sub-text);
    }

    .card {
      padding: 28px 22px;
      background: rgba(255, 255, 255, 0.96);
      border: 1px solid rgba(239, 79, 135, 0.1);
      border-radius: 23px;
      box-shadow:
        0 15px 40px rgba(145, 70, 96, 0.12);
    }

    .card-title {
      margin: 0;
      text-align: center;
      font-size: 25px;
      font-weight: 850;
      letter-spacing: -0.7px;
    }

    .card-description {
      margin: 11px 0 27px;
      text-align: center;
      color: var(--sub-text);
      font-size: 14px;
      line-height: 1.65;
    }

    .field {
      margin-bottom: 18px;
    }

    .field label {
      display: block;
      margin-bottom: 8px;
      font-size: 14px;
      font-weight: 800;
    }

    .field input {
      width: 100%;
      height: 54px;
      padding: 0 15px;
      border: 1px solid var(--border);
      border-radius: 13px;
      background: #ffffff;
      color: var(--text);
      font-size: 17px;
      outline: none;
      transition: 0.2s;
    }

    .field input::placeholder {
      color: #b5b5b5;
    }

    .field input:focus {
      border-color: var(--main-color);
      box-shadow:
        0 0 0 4px rgba(239, 79, 135, 0.12);
    }

    .lookup-button {
      width: 100%;
      height: 56px;
      margin-top: 5px;
      border: 0;
      border-radius: 14px;
      background:
        linear-gradient(
          135deg,
          var(--main-color),
          var(--main-dark)
        );
      color: #ffffff;
      font-size: 17px;
      font-weight: 850;
      cursor: pointer;
      box-shadow:
        0 9px 20px rgba(239, 79, 135, 0.25);
      transition: 0.2s;
    }

    .lookup-button:hover {
      transform: translateY(-1px);
    }

    .lookup-button:active {
      transform: translateY(1px);
    }

    .message {
      display: none;
      margin-top: 18px;
      padding: 14px;
      border-radius: 12px;
      text-align: center;
      font-size: 14px;
      line-height: 1.55;
    }

    .message.error {
      display: block;
      background: #fff0f2;
      color: #be294d;
    }

    .message.info {
      display: block;
      background: #eef7ff;
      color: #236396;
    }

    .order-result {
      display: none;
      margin-top: 22px;
    }

    .order-result.show {
      display: block;
    }

    .customer-box {
      padding: 17px;
      border-radius: 15px;
      background: var(--main-light);
      border: 1px solid rgba(239, 79, 135, 0.18);
    }

    .customer-name {
      margin: 0 0 6px;
      font-size: 18px;
      font-weight: 850;
    }

    .order-number {
      margin: 0;
      color: var(--sub-text);
      font-size: 13px;
    }

    .status-line {
      display: flex;
      gap: 8px;
      margin-top: 13px;
      flex-wrap: wrap;
    }

    .status {
      display: inline-flex;
      align-items: center;
      min-height: 30px;
      padding: 5px 10px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 800;
    }

    .status.order {
      background: #fff3d9;
      color: var(--warning);
    }

    .status.payment {
      background: #e7f7ed;
      color: var(--success);
    }

    .section-title {
      margin: 25px 0 11px;
      font-size: 16px;
      font-weight: 850;
    }

    .product-list {
      overflow: hidden;
      border: 1px solid var(--border);
      border-radius: 15px;
      background: #ffffff;
    }

    .product {
      display: flex;
      justify-content: space-between;
      gap: 14px;
      padding: 16px;
      border-bottom: 1px solid #eeeeee;
    }

    .product:last-child {
      border-bottom: 0;
    }

    .product-name {
      margin: 0 0 5px;
      font-size: 15px;
      font-weight: 800;
    }

    .product-option {
      margin: 0;
      color: var(--sub-text);
      font-size: 13px;
    }

    .product-price {
      flex-shrink: 0;
      text-align: right;
      font-size: 14px;
      font-weight: 800;
    }

    .total-box {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: 12px;
      padding: 17px;
      border-radius: 14px;
      background: #292929;
      color: #ffffff;
    }

    .total-label {
      font-size: 14px;
    }

    .total-price {
      font-size: 21px;
      font-weight: 900;
      color: #ff8bb3;
    }

    .information {
      overflow: hidden;
      border: 1px solid var(--border);
      border-radius: 15px;
      background: #ffffff;
    }

    .information-row {
      display: flex;
      padding: 14px 15px;
      border-bottom: 1px solid #eeeeee;
      font-size: 14px;
      line-height: 1.5;
    }

    .information-row:last-child {
      border-bottom: 0;
    }

    .information-label {
      width: 92px;
      flex-shrink: 0;
      color: var(--sub-text);
    }

    .information-value {
      flex: 1;
      font-weight: 700;
      word-break: keep-all;
    }

    .notice-box {
      padding: 16px;
      border-radius: 14px;
      background: #fff8dd;
      color: #634d00;
      font-size: 14px;
      line-height: 1.7;
    }

    .test-guide {
      margin-top: 18px;
      padding: 14px;
      border: 1px dashed #e8a6be;
      border-radius: 13px;
      background: #fffafd;
      color: #855063;
      font-size: 13px;
      line-height: 1.7;
    }

    .test-guide strong {
      color: var(--main-dark);
    }

    .footer {
      margin-top: 25px;
      text-align: center;
      color: #aaaaaa;
      font-size: 12px;
      line-height: 1.6;
    }

    @media (max-width: 380px) {
      .page {
        padding-right: 14px;
        padding-left: 14px;
      }

      .card {
        padding-right: 18px;
        padding-left: 18px;
      }

      .brand-name {
        font-size: 33px;
      }
    }
  </style>
</head>

<body>

  <main class="page">

    <header class="brand">

      <h1 class="brand-name">
        DAMPICK
        <span class="brand-korean">단픽</span>
      </h1>

      <p class="brand-slogan">
        픽하는 순간 취향이 밝아진다
      </p>

    </header>

    <section class="card">

      <h2 class="card-title">
        내 주문 조회
      </h2>

      <p class="card-description">
        고객 아이디와 조회번호를 입력하면<br>
        주문하신 상품을 확인할 수 있습니다.
      </p>

      <div class="field">

        <label for="customerId">
          고객 아이디
        </label>

        <input
          type="text"
          id="customerId"
          placeholder="예: DP-TEST01"
          autocomplete="off"
        >

      </div>

      <div class="field">

        <label for="lookupPin">
          조회번호
        </label>

        <input
          type="password"
          id="lookupPin"
          placeholder="조회번호 4자리"
          inputmode="numeric"
          maxlength="4"
          autocomplete="off"
        >

      </div>

      <button
        type="button"
        class="lookup-button"
        id="lookupButton"
      >
        주문 조회하기
      </button>

      <div
        class="message"
        id="message"
      ></div>

      <section
        class="order-result"
        id="orderResult"
      >

        <div class="customer-box">

          <p class="customer-name">
            김○○ 고객님의 주문
          </p>

          <p class="order-number">
            주문번호: DP-20260727-001
          </p>

          <div class="status-line">

            <span class="status order">
              상품 준비 중
            </span>

            <span class="status payment">
              입금 완료
            </span>

          </div>

        </div>

        <h3 class="section-title">
          주문 상품
        </h3>

        <div class="product-list">

          <div class="product">

            <div>
              <p class="product-name">
                프리미엄 수박
              </p>

              <p class="product-option">
                대과 · 수량 1개
              </p>
            </div>

            <div class="product-price">
              18,000원
            </div>

          </div>

          <div class="product">

            <div>
              <p class="product-name">
                무항생제 계란
              </p>

              <p class="product-option">
                30구 · 수량 2판
              </p>
            </div>

            <div class="product-price">
              16,000원
            </div>

          </div>

        </div>

        <div class="total-box">

          <span class="total-label">
            총 주문금액
          </span>

          <strong class="total-price">
            34,000원
          </strong>

        </div>

        <h3 class="section-title">
          픽업정보
        </h3>

        <div class="information">

          <div class="information-row">

            <span class="information-label">
              주문일
            </span>

            <span class="information-value">
              2026년 7월 27일
            </span>

          </div>

          <div class="information-row">

            <span class="information-label">
              픽업 예정일
            </span>

            <span class="information-value">
              2026년 7월 30일
            </span>

          </div>

          <div class="information-row">

            <span class="information-label">
              픽업 장소
            </span>

            <span class="information-value">
              ○○아파트 관리동 앞
            </span>

          </div>

        </div>

        <h3 class="section-title">
          단픽 안내
        </h3>

        <div class="notice-box">
          상품은 7월 30일 오후 5시부터
          픽업 가능합니다.
          상품 수령 시 주문자 성함을 말씀해주세요.
        </div>

      </section>

      <div class="test-guide">

        <strong>현재 시험용 아이디</strong><br>

        고객 아이디:
        <strong>DP-TEST01</strong><br>

        조회번호:
        <strong>1234</strong><br>

        위 내용을 입력하면 시험 주문이 표시됩니다.

      </div>

    </section>

    <footer class="footer">
      © DAMPICK. All rights reserved.<br>
      본 페이지는 단픽 주문조회 서비스입니다.
    </footer>

  </main>

  <script>
    const customerIdInput =
      document.getElementById("customerId");

    const lookupPinInput =
      document.getElementById("lookupPin");

    const lookupButton =
      document.getElementById("lookupButton");

    const message =
      document.getElementById("message");

    const orderResult =
      document.getElementById("orderResult");

    lookupButton.addEventListener(
      "click",
      lookupOrder
    );

    customerIdInput.addEventListener(
      "keydown",
      function (event) {
        if (event.key === "Enter") {
          lookupPinInput.focus();
        }
      }
    );

    lookupPinInput.addEventListener(
      "keydown",
      function (event) {
        if (event.key === "Enter") {
          lookupOrder();
        }
      }
    );

    function lookupOrder() {
      const customerId =
        customerIdInput.value
          .trim()
          .toUpperCase();

      const lookupPin =
        lookupPinInput.value.trim();

      hideMessage();
      hideOrder();

      if (!customerId) {
        showMessage(
          "고객 아이디를 입력해주세요.",
          "error"
        );

        customerIdInput.focus();
        return;
      }

      if (!/^[0-9]{4}$/.test(lookupPin)) {
        showMessage(
          "조회번호 숫자 4자리를 입력해주세요.",
          "error"
        );

        lookupPinInput.focus();
        return;
      }

      lookupButton.disabled = true;
      lookupButton.textContent = "주문을 확인하고 있습니다...";

      setTimeout(function () {
        if (
          customerId === "DP-TEST01" &&
          lookupPin === "1234"
        ) {
          showOrder();

          showMessage(
            "주문정보를 정상적으로 불러왔습니다.",
            "info"
          );
        } else {
          showMessage(
            "고객 아이디 또는 조회번호가 일치하지 않습니다.",
            "error"
          );
        }

        lookupButton.disabled = false;
        lookupButton.textContent = "주문 조회하기";
      }, 450);
    }

    function showMessage(text, type) {
      message.textContent = text;
      message.className =
        "message " + type;
    }

    function hideMessage() {
      message.textContent = "";
      message.className = "message";
    }

    function showOrder() {
      orderResult.classList.add("show");

      setTimeout(function () {
        orderResult.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });
      }, 100);
    }

    function hideOrder() {
      orderResult.classList.remove("show");
    }
  </script>

</body>
</html>
