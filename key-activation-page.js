(function () {
  const API_BASE_URL = window.AdvancedProConfig?.apiBaseUrl || "";
  const form = document.querySelector("#keyActivationForm");
  const input = document.querySelector("#keyCode");
  const message = document.querySelector("#keyActivationMessage");
  const submitButton = document.querySelector("[data-submit-button]");
  const submitLabel = document.querySelector("[data-activation-label]");
  const toastStack = document.querySelector("[data-toast-stack]");
  const successModal = document.querySelector("[data-success-modal]");
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
      title: "هذا المفتاح تم استخدامه مسبقًا.",
      body: "إذا كنت تعتقد بوجود خطأ يرجى التواصل مع الدعم الفني.",
      action: "تواصل معنا",
    },
    EXPIRED_KEY: {
      tone: "warning",
      icon: "◴",
      title: "انتهت صلاحية هذا المفتاح.",
      body: "يرجى شراء أو الحصول على مفتاح جديد.",
      action: "عرض الباقات",
    },
    DISABLED_KEY: {
      tone: "danger",
      icon: "⊘",
      title: "تم إيقاف هذا المفتاح.",
      body: "للمزيد من المعلومات يرجى التواصل مع الدعم الفني.",
      action: "تواصل معنا",
    },
    SERVER_ERROR: {
      tone: "neutral",
      icon: "▦",
      title: "تعذر إتمام العملية حالياً.",
      body: "يرجى المحاولة بعد قليل.",
      action: "إعادة المحاولة",
    },
  };

  function apiUrl(path) {
    return `${API_BASE_URL}${path}`;
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
    submitButton.disabled = isBusy;
    input.disabled = isBusy;
    submitButton.classList.toggle("is-loading", isBusy);
    submitButton.setAttribute("aria-busy", isBusy ? "true" : "false");
    submitLabel.textContent = isBusy ? "جارٍ التحقق من المفتاح..." : "ابدأ تفعيل الكود الآن";
  }

  function setInlineMessage(text, tone = "error") {
    if (!message) return;
    message.hidden = !text;
    message.textContent = text || "";
    message.dataset.tone = tone;
  }

  function shakeInput() {
    const target = document.querySelector(".key-input-wrap");
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
      <span class="toast-icon">${meta.icon || "•"}</span>
      <div>
        <strong>${escapeHtml(meta.title || "")}</strong>
        <p>${escapeHtml(meta.body || "")}</p>
      </div>
      ${
        meta.action
          ? `<button type="button" data-toast-action>${escapeHtml(meta.action)}</button>`
          : ""
      }
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
    if (status === 404 || text.includes("غير صحيح") || text.includes("invalid")) return "INVALID_KEY";
    if (status === 410 || text.includes("انتهت") || text.includes("expired")) return "EXPIRED_KEY";
    if (status === 403 || text.includes("غير متاح") || text.includes("موقوف") || text.includes("disabled")) return "DISABLED_KEY";
    if (text.includes("استخدام") || text.includes("used")) return "USED_KEY";
    return "SERVER_ERROR";
  }

  async function activateKey(code) {
    const response = await fetch(apiUrl("/api/keys/activate"), {
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
      error.payload = payload;
      throw error;
    }

    return payload;
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

  function showSuccess(payload) {
    const info = getActivationInfo(payload);
    document.querySelector("[data-success-plan]").textContent = info.planName;
    document.querySelector("[data-success-xp]").textContent = `${new Intl.NumberFormat("en-US").format(info.xp)} XP`;
    document.querySelector("[data-success-expiry]").textContent = info.expiresAt
      ? `${info.validity} - ${formatDate(info.expiresAt)}`
      : info.validity;
    document.querySelector("[data-dashboard-link]").href = info.redirectTo;

    showToast({
      tone: "success",
      icon: "✓",
      title: "تم تفعيل المفتاح بنجاح 🎉",
      body: `تم إضافة ${new Intl.NumberFormat("en-US").format(info.xp)} XP - الباقة: ${info.planName} - الصلاحية: ${info.validity}`,
      action: "الانتقال للوحة التحكم",
    }, {
      onAction: () => {
        window.location.href = info.redirectTo;
      },
    });

    successModal.hidden = false;
    clearTimeout(redirectTimer);
    redirectTimer = setTimeout(() => {
      window.location.href = info.redirectTo;
    }, 2000);
  }

  if (!form || !input) return;

  input.addEventListener("input", () => {
    const cursorAtEnd = input.selectionStart === input.value.length;
    input.value = formatKey(input.value);
    if (cursorAtEnd) input.setSelectionRange(input.value.length, input.value.length);
    setInlineMessage("");
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
      setInlineMessage("تم تفعيل المفتاح بنجاح. يتم تحويلك الآن...", "success");
      showSuccess(payload);
    } catch (error) {
      const codeName = error.code || "SERVER_ERROR";
      const meta = ERROR_META[codeName] || ERROR_META.SERVER_ERROR;
      setInlineMessage(`${meta.title} ${meta.body}`, meta.tone);
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
