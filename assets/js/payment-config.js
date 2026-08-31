/*
  담픽 토스페이먼츠 브라우저 설정

  1. 테스트할 때:
     tossClientKey에 test_ck_로 시작하는 클라이언트 키를 넣습니다.

  2. 실제 결제를 받을 때:
     토스페이먼츠 계약·카드사 심사 완료 후
     live_ck_로 시작하는 라이브 클라이언트 키로 바꿉니다.

  중요:
  - 클라이언트 키만 이 파일에 넣습니다.
  - test_sk_ 또는 live_sk_로 시작하는 시크릿 키는
    절대로 이 파일이나 GitHub에 넣지 마세요.
*/

window.DAMPICK_PAYMENT_CONFIG = {
  tossClientKey: "",
  // database/002_scheduled_checkout.sql을 검토·설치한 뒤
  // "submit_scheduled_checkout_request"로 설정합니다. 빈 값은 기존 RPC 유지.
  scheduledCheckoutRpc: ""
};

// 형식 검사만 수행합니다. 키의 유효성과 서버 설정은 별도 검증이 필요합니다.
window.isDampickTossKeyConfigured = function (key) {
  return /^(test|live)_ck_[A-Za-z0-9]+$/.test(String(key || "").trim()) &&
    !/placeholder|example|your|replace/i.test(String(key));
};
