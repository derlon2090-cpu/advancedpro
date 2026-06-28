(function () {
  const API_BASE_URL = window.AdvancedProConfig?.apiBaseUrl || "";
  const form = document.querySelector("#keyActivationForm");
  const input = document.querySelector("#keyCode");
  const message = document.querySelector("#keyActivationMessage");
  const submitButton = document.querySelector("[data-submit-button]");
  const submitLabel = document.querySelector("[data-activation-label]");
  const toastStack = document.querySelector("[data-toast-stack]");
  const successModal = document.querySelector("[data-success-modal]");
  const themeToggle = document.querySelector("[data-activation-theme-toggle]");
  const languageToggle = document.querySelector("[data-activation-language-toggle]");
  const languageLabel = document.querySelector("[data-activation-language-label]");
  const sunIcon = document.querySelector('[data-theme-icon="sun"]');
  const moonIcon = document.querySelector('[data-theme-icon="moon"]');
  let redirectTimer = null;

  const ERROR_META = {
    INVALID_KEY: {
      tone: "error",
      icon: "✕",
      title: "المفتاح الذي أدخلته غير صحيح.",
      body: "يرجى التحقق من الكود وإعادة المحاولة.",
      action: "إعادة المحاولة",
    },
    USED_KEY: {
      tone: "warning",
      icon: "⚠",
      title: "تم استخدام هذا المفتاح مسبقًا.",
      body: "إذا كنت تعتقد أن هناك خطأ، تواصل مع الدعم الفني.",
      action: "تواصل معنا",
    },
    EXPIRED_KEY: {
      tone: "warning",
      icon: "◔",
      title: "انتهت صلاحية هذا المفتاح.",
      body: "يرجى الحصول على مفتاح جديد أو التواصل مع المسؤول.",
      action: "عرض الباقات",
    },
    DISABLED_KEY: {
      tone: "danger",
      icon: "⛔",
      title: "تم إيقاف هذا المفتاح.",
      body: "للمزيد من المعلومات يرجى التواصل مع الدعم الفني.",
      action: "تواصل معنا",
    },
    SERVER_ERROR: {
      tone: "neutral",
      icon: "▣",
      title: "تعذر إتمام العملية حاليًا.",
      body: "تعذر التحقق من الكود الآن. تأكد من اتصالك وأعد المحاولة.",
      action: "إعادة المحاولة",
    },
  };

  function apiUrl(path) {
    return `${API_BASE_URL}${path}`;
  }

  function getStoredSettings() {
    try {
      return {
        language: "ar",
        theme: "light",
        ...JSON.parse(window.localStorage.getItem("pixigen:settings") || "{}"),
      };
    } catch {
      return { language: "ar", theme: "light" };
    }
  }

  function saveStoredSettings(settings) {
    try {
      window.localStorage.setItem("pixigen:settings", JSON.stringify(settings));
    } catch {
      // Keep the visual state for this page even if storage is blocked.
    }
  }

  function applyActivationTheme(themeValue = getStoredSettings().theme) {
    const theme = themeValue === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = theme;
    document.body.dataset.theme = theme;
    if (themeToggle) {
      const isEnglish = getStoredSettings().language === "en";
      themeToggle.setAttribute("aria-pressed", String(theme === "dark"));
      themeToggle.setAttribute(
        "aria-label",
        isEnglish
          ? (theme === "dark" ? "Switch to light mode" : "Switch to dark mode")
          : (theme === "dark" ? "التحويل إلى الوضع الشمسي" : "التحويل إلى الوضع الليلي")
      );
    }
    if (themeToggle) themeToggle.dataset.themeState = theme;
    if (sunIcon) {
      sunIcon.hidden = theme === "dark";
      sunIcon.style.display = theme === "dark" ? "none" : "";
    }
    if (moonIcon) {
      moonIcon.hidden = theme !== "dark";
      moonIcon.style.display = theme === "dark" ? "" : "none";
    }
  }

  function setActivationTheme(themeValue) {
    const settings = getStoredSettings();
    settings.theme = themeValue === "dark" ? "dark" : "light";
    saveStoredSettings(settings);
    applyActivationTheme(settings.theme);
  }

  function toggleActivationTheme() {
    const current = getStoredSettings().theme === "dark" ? "dark" : "light";
    setActivationTheme(current === "dark" ? "light" : "dark");
  }

  function applyActivationLanguage(languageValue = getStoredSettings().language) {
    const language = languageValue === "en" ? "en" : "ar";
    document.documentElement.lang = language;
    document.documentElement.dir = language === "en" ? "ltr" : "rtl";
    document.body.dataset.language = language;
    if (languageToggle) languageToggle.setAttribute("aria-pressed", String(language === "en"));
    if (languageLabel) languageLabel.textContent = language === "en" ? "English" : "عربي";
    applyActivationCopy(language);
  }

  function setActivationLanguage(languageValue) {
    const settings = getStoredSettings();
    settings.language = languageValue === "en" ? "en" : "ar";
    saveStoredSettings(settings);
    applyActivationLanguage(settings.language);
  }

  function toggleActivationLanguage() {
    const current = getStoredSettings().language === "en" ? "en" : "ar";
    setActivationLanguage(current === "en" ? "ar" : "en");
  }

  function applyActivationCopy(language) {
    const isEnglish = language === "en";
    const brand = document.querySelector(".activation-portal__brand small");
    const title = document.querySelector("#activateTitle");
    const intro = document.querySelector(".activation-portal__card > p");
    const stepsTitle = document.querySelector(".activation-portal__steps h2");
    const note = document.querySelector(".activation-portal__note");
    const trustItems = document.querySelectorAll(".activation-portal__trust span");
    const successTitle = document.querySelector("#successTitle");
    const successCopy = document.querySelector(".success-dialog > p");
    const successSummary = document.querySelectorAll(".success-summary article span");
    const successActions = document.querySelectorAll(".success-actions a");
    if (brand) brand.innerHTML = isEnglish ? "<i></i>Activation Portal<i></i>" : "<i></i>بوابة التفعيل<i></i>";
    if (title) title.textContent = isEnglish ? "Activate your digital key" : "فعّل مفتاحك الرقمي";
    if (intro) {
      intro.innerHTML = isEnglish
        ? "Enter your activation code to access the AI image<br />and video generation workspace."
        : "أدخل كود التفعيل الخاص بك للوصول إلى منصة<br />إنشاء الصور والفيديو بالذكاء الاصطناعي.";
    }
    if (input) input.placeholder = "APRO-XXXX-XXXX-XXXX";
    if (submitLabel && !submitButton?.classList.contains("is-loading")) {
      submitLabel.textContent = isEnglish ? "Activate code now" : "تفعيل الكود الآن";
    }
    if (stepsTitle) stepsTitle.textContent = isEnglish ? "Activation steps" : "خطوات التفعيل";
    if (note) {
      const icon = note.querySelector("span")?.outerHTML || "";
      note.innerHTML = `${icon}${isEnglish
        ? " Credits are consumed only after the first successful generation."
        : " يتم استهلاك الرصيد بعد تنفيذ أول عملية إنشاء ناجحة."}`;
    }

    const steps = [
      isEnglish
        ? ["Enter code", "Enter your activation code<br />in the dedicated field"]
        : ["أدخل الكود", "أدخل كود التفعيل<br />في الحقل المخصص"],
      isEnglish
        ? ["Verify activation", "We securely verify<br />the code validity"]
        : ["التحقق من التفعيل", "يتم التحقق من صحة<br />الكود بأمان"],
      isEnglish
        ? ["Instant access", "Start using the platform<br />right away"]
        : ["الوصول الفوري", "ابدأ استخدام المنصة<br />ببساطة"],
    ];
    document.querySelectorAll(".activation-portal__steps article").forEach((article, index) => {
      const copy = steps[index];
      if (!copy) return;
      const heading = article.querySelector("strong");
      const paragraph = article.querySelector("p");
      if (heading) heading.textContent = copy[0];
      if (paragraph) paragraph.innerHTML = copy[1];
    });

    if (trustItems[0]) {
      const icon = trustItems[0].querySelector("svg")?.outerHTML || "";
      trustItems[0].innerHTML = `${icon}${isEnglish ? "Thousands of users trust us" : "آلاف المستخدمين يثقون بنا"}`;
    }
    if (trustItems[1]) trustItems[1].textContent = isEnglish ? "A trusted platform for everyone" : "منصة موثوقة للجميع";
    if (successTitle) successTitle.textContent = isEnglish ? "Key activated successfully" : "تم تفعيل المفتاح بنجاح";
    if (successCopy) {
      successCopy.textContent = isEnglish
        ? "Your account is ready and you will be redirected to the dashboard shortly."
        : "تم تجهيز حسابك وسيتم تحويلك للوحة التحكم خلال لحظات.";
    }
    const summaryLabels = isEnglish ? ["Plan", "Balance", "Validity"] : ["الباقة", "الرصيد", "الصلاحية"];
    successSummary.forEach((label, index) => {
      label.textContent = summaryLabels[index] || label.textContent;
    });
    if (successActions[0]) successActions[0].textContent = isEnglish ? "Go to dashboard" : "الدخول إلى لوحة التحكم";
    if (successActions[1]) successActions[1].textContent = isEnglish ? "Create first project" : "إنشاء أول مشروع";
    document.title = isEnglish ? "Activation Portal | PixiGenI" : "بوابة التفعيل | PixiGenI";
    languageToggle?.setAttribute("aria-label", isEnglish ? "Change language" : "تغيير اللغة");
    const currentTheme = getStoredSettings().theme === "dark" ? "dark" : "light";
    themeToggle?.setAttribute(
      "aria-label",
      isEnglish
        ? (currentTheme === "dark" ? "Switch to light mode" : "Switch to dark mode")
        : (currentTheme === "dark" ? "التحويل إلى الوضع الشمسي" : "التحويل إلى الوضع الليلي")
    );
  }

  function formatKey(value) {
    const raw = String(value || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 16);
    const parts = raw.match(/.{1,4}/g) || [];
    return parts.join("-").slice(0, 19);
  }

  function compactCode(value) {
    return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  }

  function setBusy(isBusy) {
    if (!submitButton || !input) return;
    const isEnglish = getStoredSettings().language === "en";
    submitButton.disabled = isBusy;
    input.disabled = isBusy;
    submitButton.classList.toggle("is-loading", isBusy);
    submitButton.setAttribute("aria-busy", isBusy ? "true" : "false");
    submitLabel.textContent = isBusy
      ? (isEnglish ? "Checking..." : "جارِ التحقق...")
      : (isEnglish ? "Activate code now" : "تفعيل الكود الآن");
  }

  function setInlineMessage(text, tone = "error") {
    if (!message) return;
    message.hidden = !text;
    message.textContent = text || "";
    message.dataset.tone = tone;
  }

  function getFriendlyErrorMessage(errorCode) {
    if (errorCode === "SERVER_ERROR") {
      return "تعذر التحقق من الكود حاليًا. تأكد من صحة الكود واتصالك ثم أعد المحاولة.";
    }
    if (errorCode === "INVALID_KEY") {
      return "أدخل الكود بشكل صحيح ثم أعد المحاولة.";
    }
    if (errorCode === "USED_KEY") {
      return "هذا الكود مستخدم مسبقًا.";
    }
    if (errorCode === "EXPIRED_KEY") {
      return "انتهت صلاحية هذا الكود.";
    }
    if (errorCode === "DISABLED_KEY") {
      return "هذا الكود متوقف حاليًا.";
    }
    return "تعذر إتمام العملية.";
  }

  function shakeInput() {
    const target = document.querySelector(".activation-portal__input") || document.querySelector(".key-input-wrap");
    if (!target) return;
    target.classList.remove("is-shaking");
    void target.offsetWidth;
    target.classList.add("is-shaking");
  }

  function showToast(meta, options = {}) {
    if (!toastStack) return;
    const toast = document.createElement("article");
    toast.className = `activation-toast is-${meta.tone || "neutral"}`;
    toast.innerHTML = `
      <span class="toast-icon">${escapeHtml(meta.icon || "•")}</span>
      <div>
        <strong>${escapeHtml(meta.title || "")}</strong>
        <p>${escapeHtml(meta.body || "")}</p>
      </div>
      ${meta.action ? `<button type="button" data-toast-action>${escapeHtml(meta.action)}</button>` : ""}
    `;
    toastStack.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("is-visible"));

    toast.querySelector("[data-toast-action]")?.addEventListener("click", () => {
      if (options.onAction) {
        options.onAction();
      } else {
        input?.focus();
      }
      dismissToast(toast);
    });

    setTimeout(() => dismissToast(toast), 4000);
  }

  function dismissToast(toast) {
    toast.classList.remove("is-visible");
    setTimeout(() => toast.remove(), 220);
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function normalizeError(payload, status) {
    const apiCode = String(payload?.code || payload?.errorCode || payload?.reason || "").trim();
    if (apiCode && ERROR_META[apiCode]) return apiCode;

    const text = String(payload?.message || payload?.error || "").toLowerCase();
    if (status === 404 || text.includes("invalid")) return "INVALID_KEY";
    if (status === 410 || text.includes("expired")) return "EXPIRED_KEY";
    if (status === 403 || text.includes("disabled") || text.includes("blocked")) return "DISABLED_KEY";
    if (text.includes("used")) return "USED_KEY";
    return "SERVER_ERROR";
  }

  async function activateKey(code) {
    const routes = ["/api/public/keys/activate", "/api/keys/activate"];
    let lastError = null;

    for (const path of routes) {
      try {
        const response = await fetch(apiUrl(path), {
          method: "POST",
          credentials: "include",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ code }),
        });

        let payload = {};
        try {
          payload = await response.json();
        } catch {
          payload = {};
        }

        if (!response.ok || payload.success === false) {
          const errorCode = normalizeError(payload, response.status);
          const error = new Error(errorCode);
          error.code = errorCode;
          error.status = response.status;
          error.payload = payload;
          throw error;
        }

        return payload;
      } catch (error) {
        lastError = error;
        const canRetry =
          !error?.code ||
          error.code === "SERVER_ERROR";

        if (!canRetry) {
          throw error;
        }
      }
    }

    throw lastError || new Error("SERVER_ERROR");
  }

  function calculateDaysLeft(expiresAt) {
    if (!expiresAt) return "غير محدد";
    const expiry = new Date(expiresAt);
    if (Number.isNaN(expiry.getTime())) return "غير محدد";
    const days = Math.max(0, Math.ceil((expiry.getTime() - Date.now()) / 86400000));
    return `${days} يوم`;
  }

  function formatDate(value) {
    if (!value) return "غير محدد";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "غير محدد";
    return new Intl.DateTimeFormat("ar-SA", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(date);
  }

  function getActivationInfo(payload) {
    const codeInfo = payload?.accessCode || payload?.codeInfo || payload?.key || {};
    const xp = Number(
      codeInfo.creditsRemaining ??
        codeInfo.balance ??
        codeInfo.xp ??
        codeInfo.xpBalance ??
        codeInfo.imageAvailable ??
        1200
    );

    return {
      planName: codeInfo.planName || codeInfo.plan || "إبداع",
      xp,
      expiresAt: codeInfo.expiresAt || codeInfo.endAt || null,
      validity: calculateDaysLeft(codeInfo.expiresAt || codeInfo.endAt),
      redirectTo: payload.redirectTo || "/dashboard",
    };
  }

  function saveActivationState(payload) {
    const accessCode = payload?.accessCode || payload?.codeInfo || null;
    const token = payload?.token || null;

    try {
      if (token) {
        window.localStorage.setItem("advancedpro_token", token);
        window.sessionStorage.setItem("advancedpro_token", token);
      }
    } catch {
      // ignore storage failures
    }

    try {
      if (accessCode) {
        window.localStorage.setItem("advancedpro_access_code", JSON.stringify(accessCode));
      }
    } catch {
      // ignore storage failures
    }
  }

  function showSuccess(payload) {
    const info = getActivationInfo(payload);
    const planTarget = document.querySelector("[data-success-plan]");
    const xpTarget = document.querySelector("[data-success-xp]");
    const expiryTarget = document.querySelector("[data-success-expiry]");
    const dashboardLink = document.querySelector("[data-dashboard-link]");

    if (planTarget) planTarget.textContent = info.planName;
    if (xpTarget) xpTarget.textContent = `${new Intl.NumberFormat("en-US").format(info.xp)} XP`;
    if (expiryTarget) {
      expiryTarget.textContent = info.expiresAt ? `${info.validity} · ${formatDate(info.expiresAt)}` : info.validity;
    }
    if (dashboardLink) dashboardLink.href = info.redirectTo;

    showToast(
      {
        tone: "success",
        icon: "✓",
        title: "تم تفعيل الحساب بنجاح",
        body: `تمت إضافة ${new Intl.NumberFormat("en-US").format(info.xp)} XP - الباقة: ${info.planName}`,
        action: "الانتقال إلى لوحة التحكم",
      },
      {
        onAction: () => {
          window.location.href = info.redirectTo;
        },
      }
    );

    if (successModal) {
      successModal.hidden = false;
    }

    clearTimeout(redirectTimer);
    redirectTimer = setTimeout(() => {
      window.location.href = info.redirectTo;
    }, 2000);
  }

  applyActivationTheme();
  applyActivationLanguage();
  themeToggle?.addEventListener("click", toggleActivationTheme);
  languageToggle?.addEventListener("click", toggleActivationLanguage);

  if (!form || !input) return;

  input.addEventListener("input", () => {
    const cursorAtEnd = input.selectionStart === input.value.length;
    input.value = formatKey(input.value);
    if (cursorAtEnd) input.setSelectionRange(input.value.length, input.value.length);
    setInlineMessage("");
  });

  input.addEventListener("paste", (event) => {
    event.preventDefault();
    const pasted = event.clipboardData?.getData("text") || "";
    input.value = formatKey(pasted);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const code = formatKey(input.value);
    input.value = code;

    const compacted = compactCode(code);
    if (!compacted.startsWith("APRO") || compacted.length !== 16) {
      setInlineMessage("أدخل مفتاحًا صحيحًا بصيغة APRO-XXXX-XXXX-XXXX.", "error");
      shakeInput();
      showToast(ERROR_META.INVALID_KEY, { onAction: () => input.focus() });
      input.focus();
      return;
    }

    setBusy(true);
    setInlineMessage("");

    try {
      const payload = await activateKey(code);
      saveActivationState(payload);
      setInlineMessage("تم تفعيل الحساب بنجاح. سيتم تحويلك الآن...", "success");
      showSuccess(payload);
    } catch (error) {
      const codeName = error.code || "SERVER_ERROR";
      const meta = ERROR_META[codeName] || ERROR_META.SERVER_ERROR;
      const fallbackMessage =
        error?.message && error.message !== codeName
          ? error.message
          : getFriendlyErrorMessage(codeName);
      setInlineMessage(fallbackMessage, meta.tone);
      shakeInput();
      showToast(meta, {
        onAction: () => {
          if (codeName === "EXPIRED_KEY") {
            window.location.href = "/pricing";
            return;
          }
          if (codeName === "USED_KEY" || codeName === "DISABLED_KEY") {
            window.location.href = "mailto:support@advancedpro.com";
            return;
          }
          input.focus();
        },
      });
    } finally {
      setBusy(false);
    }
  });

  successModal?.addEventListener("click", (event) => {
    if (event.target === successModal) {
      successModal.hidden = true;
    }
  });
})();
