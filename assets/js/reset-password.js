"use strict";

    const sb = window.dampickSupabase;

    const requestSection = document.getElementById("requestSection");
    const changeSection = document.getElementById("changeSection");
    const completeSection = document.getElementById("completeSection");

    const emailInput = document.getElementById("email");
    const sendButton = document.getElementById("sendButton");
    const newPasswordInput = document.getElementById("newPassword");
    const confirmPasswordInput = document.getElementById("confirmPassword");
    const changeButton = document.getElementById("changeButton");

    const requestMessage = document.getElementById("requestMessage");
    const changeMessage = document.getElementById("changeMessage");

    init();

    async function init() {
      if (!sb) {
        showMessage(
          requestMessage,
          "Supabase 연결정보를 불러오지 못했습니다. config.js를 확인해주세요.",
          "error"
        );
        sendButton.disabled = true;
        return;
      }

      // 복구 링크로 들어온 경우 Supabase가 URL의 인증정보를 읽어
      // 세션을 생성합니다. 이미 세션이 있으면 바로 비밀번호 변경 화면을 보여줍니다.
      await checkSession();

      sb.auth.onAuthStateChange(function (event, session) {
        if (
          event === "PASSWORD_RECOVERY" ||
          event === "SIGNED_IN" ||
          session
        ) {
          showChangeSection();
        }
      });
    }

    async function checkSession() {
      try {
        const { data, error } = await sb.auth.getSession();

        if (error) {
          console.warn(error);
          return;
        }

        if (data?.session) {
          showChangeSection();
          return;
        }

        // URL에 복구 인증정보가 있는 경우 초기화 시간을 조금 기다립니다.
        if (
          window.location.hash.includes("access_token=") ||
          window.location.search.includes("code=")
        ) {
          showMessage(
            requestMessage,
            "재설정 링크를 확인하고 있습니다. 잠시만 기다려주세요.",
            "info"
          );

          setTimeout(checkSession, 700);
        }
      } catch (error) {
        console.error(error);
      }
    }

    sendButton.addEventListener("click", sendResetEmail);

    emailInput.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        sendResetEmail();
      }
    });

    changeButton.addEventListener("click", changePassword);

    confirmPasswordInput.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        changePassword();
      }
    });

    async function sendResetEmail() {
      clearMessage(requestMessage);

      const email = emailInput.value.trim();

      if (!email) {
        showMessage(
          requestMessage,
          "관리자 이메일을 입력해주세요.",
          "error"
        );
        emailInput.focus();
        return;
      }

      if (!isValidEmail(email)) {
        showMessage(
          requestMessage,
          "이메일 형식을 확인해주세요.",
          "error"
        );
        return;
      }

      sendButton.disabled = true;
      sendButton.textContent = "메일을 보내고 있습니다...";

      try {
        const redirectTo =
          window.location.origin +
          window.location.pathname;

        const { error } =
          await sb.auth.resetPasswordForEmail(
            email,
            { redirectTo }
          );

        if (error) {
          throw error;
        }

        showMessage(
          requestMessage,
          "재설정 메일을 보냈습니다. 네이버 메일함에서 가장 최근에 도착한 'Reset your password' 메일을 열고 Reset password를 눌러주세요.",
          "success"
        );

      } catch (error) {
        console.error(error);

        showMessage(
          requestMessage,
          error.message || "재설정 메일을 보내지 못했습니다.",
          "error"
        );

      } finally {
        sendButton.disabled = false;
        sendButton.textContent = "비밀번호 재설정 메일 보내기";
      }
    }

    async function changePassword() {
      clearMessage(changeMessage);

      const password = newPasswordInput.value;
      const confirmPassword = confirmPasswordInput.value;

      if (password.length < 8) {
        showMessage(
          changeMessage,
          "새 비밀번호는 8자 이상으로 입력해주세요.",
          "error"
        );
        return;
      }

      if (password !== confirmPassword) {
        showMessage(
          changeMessage,
          "새 비밀번호와 확인 비밀번호가 서로 다릅니다.",
          "error"
        );
        return;
      }

      changeButton.disabled = true;
      changeButton.textContent = "비밀번호를 변경하고 있습니다...";

      try {
        const { error } =
          await sb.auth.updateUser({
            password: password
          });

        if (error) {
          throw error;
        }

        // 변경 후에는 복구 세션을 종료하고
        // 새 비밀번호로 관리자 페이지에서 다시 로그인하게 합니다.
        await sb.auth.signOut();

        requestSection.hidden = true;
        changeSection.hidden = true;
        completeSection.hidden = false;

      } catch (error) {
        console.error(error);

        showMessage(
          changeMessage,
          error.message || "비밀번호를 변경하지 못했습니다. 재설정 메일을 다시 받아 시도해주세요.",
          "error"
        );

      } finally {
        changeButton.disabled = false;
        changeButton.textContent = "비밀번호 변경하기";
      }
    }

    function showChangeSection() {
      requestSection.hidden = true;
      completeSection.hidden = true;
      changeSection.hidden = false;
      newPasswordInput.focus();
    }

    function showMessage(element, text, type) {
      element.textContent = text;
      element.className = "message show " + type;
    }

    function clearMessage(element) {
      element.textContent = "";
      element.className = "message";
    }

    function isValidEmail(value) {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    }
