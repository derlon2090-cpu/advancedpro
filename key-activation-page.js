(function () {
  const API_BASE_URL =
    window.AdvancedProConfig?.apiBaseUrl || "";
  const TOKEN_KEY = "advancedpro_token";
  const ACCESS_CODE_KEY = "advancedpro_access_code";
  const form = document.querySelector("#keyActivationForm");
  const input = document.querySelector("#keyCode");
  const message = document.querySelector("#keyActivationMessage");
  const label = document.querySelector("[data-activation-label]");
  const submitButton = form?.querySelector('button[type="submit"]');

  function getStoredToken() {
    try {
      return (
        window.localStorage.getItem(TOKEN_KEY) ||
        window.sessionStorage.getItem(TOKEN_KEY) ||
        ""
      );
    } catch (error) {
      return "";
    }
  }

  function setMessage(text, type) {
    if (!message) {
      return;
    }

    message.hidden = !text;
    message.textContent = text || "";
    message.dataset.type = type || "";
  }

  function setBusy(isBusy) {
    if (submitButton) {
      submitButton.disabled = isBusy;
      submitButton.classList.toggle("is-loading", isBusy);
      submitButton.setAttribute("aria-busy", isBusy ? "true" : "false");
    }

    if (label) {
      label.textContent = isBusy ? "جارٍ التفعيل..." : "تفعيل المفتاح";
    }
  }

  function normalizeApiError(payload, status) {
    const rawMessage = String(payload?.message || payload?.error || "").trim();

    if (status === 401) {
      return "تعذر إنشاء جلسة المفتاح. حاول تفعيل المفتاح مرة أخرى.";
    }

    if (status === 403) {
      return "لا تملك صلاحية تنفيذ هذه العملية.";
    }

    if (rawMessage && !/[طظ]/.test(rawMessage)) {
      return rawMessage;
    }

    return "تعذر تفعيل المفتاح. تأكد من صحة الكود أو حالته ثم حاول مرة أخرى.";
  }

  async function activateKey(code) {
    const response = await fetch(`${API_BASE_URL}/api/public/keys/activate`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ code }),
    });

    let payload = {};
    try {
      payload = await response.json();
    } catch (error) {
      payload = {};
    }

    if (!response.ok || payload.success === false) {
      const error = new Error(normalizeApiError(payload, response.status));
      error.payload = payload;
      throw error;
    }

    return payload;
  }

  if (!form || !input) {
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const code = String(input.value || "").trim();

    if (!code) {
      setMessage("أدخل مفتاحك الرقمي أولًا.", "error");
      input.focus();
      return;
    }

    setBusy(true);
    setMessage("", "");

    try {
      const payload = await activateKey(code);
      const accessCode = payload.accessCode || payload.codeInfo || null;

      if (accessCode) {
        try {
          window.localStorage.setItem(ACCESS_CODE_KEY, JSON.stringify(accessCode));
        } catch (error) {
          // التخزين المحلي اختياري، والباكند هو مصدر الحقيقة.
        }
      }

      setMessage("تم تفعيل المفتاح بنجاح. يتم تحويلك الآن إلى لوحة المستخدم.", "success");

      window.setTimeout(() => {
        window.location.href = payload.redirectTo || "/dashboard";
      }, 900);
    } catch (error) {
      setMessage(error.message, "error");
    } finally {
      setBusy(false);
    }
  });
})();
