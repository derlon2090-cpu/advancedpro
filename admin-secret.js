(function () {
  const API_BASE_URL =
    window.AdvancedProConfig?.apiBaseUrl || "https://advancedpro.onrender.com";

  const $ = (selector) => document.querySelector(selector);

  function setMessage(text, type = "error") {
    const message = $("[data-admin-secret-message]");
    if (!message) return;
    message.hidden = !text;
    message.textContent = text || "";
    message.dataset.type = type;
  }

  async function requestJson(path, options = {}) {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      credentials: "include",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });

    let payload = {};
    try {
      payload = await response.json();
    } catch (error) {
      payload = {};
    }

    if (!response.ok) {
      const error = new Error(payload.message || "تعذر تنفيذ الطلب.");
      error.payload = payload;
      throw error;
    }

    return payload;
  }

  async function initLogin() {
    const form = $("#adminSecretLoginForm");
    if (!form) return;

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = form.querySelector("button[type='submit']");
      const email = String(form.email.value || "").trim();
      const password = String(form.password.value || "");

      if (!email || !password) {
        setMessage("أدخل البريد وكلمة المرور.");
        return;
      }

      button.disabled = true;
      button.textContent = "جارٍ الدخول...";
      setMessage("", "");

      try {
        const payload = await requestJson("/api/admin/login", {
          method: "POST",
          body: JSON.stringify({ email, password }),
        });
        window.location.href = payload.redirectTo || "/admin/dashboard";
      } catch (error) {
        setMessage(error.message || "فشل تسجيل الدخول.");
      } finally {
        button.disabled = false;
        button.textContent = "دخول لوحة الأدمن";
      }
    });
  }

  async function initSetup() {
    const form = $("#adminSecretSetupForm");
    if (!form) return;

    try {
      const status = await requestJson("/api/admin/setup-status");
      if (!status.enabled) {
        window.location.href = status.loginPath || "/advanced-pro-control";
        return;
      }
    } catch (error) {
      setMessage(error.message || "تعذر التحقق من حالة الإعداد.");
    }

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = form.querySelector("button[type='submit']");
      const name = String(form.name.value || "").trim();
      const email = String(form.email.value || "").trim();
      const password = String(form.password.value || "");
      const passwordConfirm = String(form.passwordConfirm.value || "");

      if (!name || !email || !password || !passwordConfirm) {
        setMessage("أكمل جميع الحقول.");
        return;
      }
      if (password !== passwordConfirm) {
        setMessage("تأكيد كلمة المرور غير مطابق.");
        return;
      }

      button.disabled = true;
      button.textContent = "جارٍ إنشاء الأدمن...";
      setMessage("", "");

      try {
        const payload = await requestJson("/api/admin/setup", {
          method: "POST",
          body: JSON.stringify({ name, email, password, passwordConfirm }),
        });
        window.location.href = payload.redirectTo || "/admin/dashboard";
      } catch (error) {
        setMessage(error.message || "تعذر إنشاء أول أدمن.");
      } finally {
        button.disabled = false;
        button.textContent = "إنشاء أول أدمن";
      }
    });
  }

  initLogin();
  initSetup();
})();
