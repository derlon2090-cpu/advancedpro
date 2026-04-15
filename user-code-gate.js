(() => {
  const API_BASE_URL =
    window.AdvancedProConfig?.apiBaseUrl || "https://advancedpro.onrender.com";
  const AUTH_TOKEN_KEY = "advancedpro_token";
  const ACCESS_CODE_STORAGE_KEY = "advancedpro_access_code";
  const PAGE = document.body?.dataset?.page || "";
  const ACTIVE_PAGES = new Set(["student", "dashboard"]);

  function getStoredToken() {
    try {
      const local = window.localStorage.getItem(AUTH_TOKEN_KEY);
      if (local) return local;
    } catch (error) {
      // ignore
    }

    try {
      const session = window.sessionStorage.getItem(AUTH_TOKEN_KEY);
      if (session) return session;
    } catch (error) {
      // ignore
    }

    const cookieMatch = document.cookie.match(
      new RegExp(`(?:^|; )${AUTH_TOKEN_KEY}=([^;]*)`)
    );
    return cookieMatch ? decodeURIComponent(cookieMatch[1]) : null;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function setMessage(target, message, type = "info") {
    if (!target) return;

    if (!message) {
      target.hidden = true;
      target.textContent = "";
      target.className = "status-message";
      return;
    }

    target.hidden = false;
    target.textContent = message;
    target.className = `status-message is-${type}`;
  }

  function setButtonBusy(button, busy, label = "جارٍ التحقق...") {
    if (!button) return;
    if (!button.dataset.originalLabel) {
      button.dataset.originalLabel = button.textContent.trim();
    }
    button.disabled = busy;
    button.textContent = busy ? label : button.dataset.originalLabel;
  }

  function formatDate(value) {
    if (!value) return "غير محدد";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "غير محدد";
    return new Intl.DateTimeFormat("ar-SA", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(parsed);
  }

  function formatRemainingDuration(value) {
    if (!value) return "غير محدد";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "غير محدد";

    const diff = date.getTime() - Date.now();
    if (diff <= 0) return "منتهي";

    const totalHours = Math.ceil(diff / (1000 * 60 * 60));
    if (totalHours < 24) {
      return `${totalHours} ساعة`;
    }

    return `${Math.ceil(totalHours / 24)} يوم`;
  }

  function persistCodeInfo(info) {
    try {
      if (info) {
        window.localStorage.setItem(ACCESS_CODE_STORAGE_KEY, JSON.stringify(info));
      } else {
        window.localStorage.removeItem(ACCESS_CODE_STORAGE_KEY);
      }
    } catch (error) {
      // ignore
    }
  }

  function readStoredCodeInfo() {
    try {
      const raw = window.localStorage.getItem(ACCESS_CODE_STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }

  function normalizeCodeInfo(rawInfo = {}) {
    const packageName =
      rawInfo.packageName ||
      rawInfo.ownerName ||
      (rawInfo.code ? `كود ${rawInfo.code}` : "الباقة الحالية");
    const imageAvailable = Number(
      rawInfo.imageAvailable ?? rawInfo.imageBalance ?? rawInfo.remainingImages ?? 0
    );
    const videoAvailable = Number(
      rawInfo.videoAvailable ?? rawInfo.videoBalance ?? rawInfo.remainingVideos ?? 0
    );
    const imageUsed = Number(rawInfo.imageUsed ?? 0);
    const videoUsed = Number(rawInfo.videoUsed ?? 0);
    const endAt = rawInfo.endAt || rawInfo.expiresAt || null;
    const expired = endAt ? new Date(endAt).getTime() <= Date.now() : false;
    const isActive =
      rawInfo.isActive !== false &&
      rawInfo.status !== "expired" &&
      rawInfo.statusKey !== "expired" &&
      !expired;

    let statusLabel = rawInfo.statusLabel || rawInfo.status || "صالح";
    if (!isActive) {
      statusLabel = expired ? "منتهي" : rawInfo.isActive === false ? "غير مفعل" : statusLabel;
    }

    return {
      code: rawInfo.code || "",
      packageName,
      imageAvailable,
      videoAvailable,
      imageUsed,
      videoUsed,
      isRenewable: Boolean(rawInfo.isRenewable),
      renewalLabel: rawInfo.renewalLabel || "",
      endAt,
      email: rawInfo.email || null,
      accessTypeLabel: rawInfo.accessTypeLabel || (rawInfo.email ? "مخصص" : "عام"),
      statusLabel,
      chatStatus:
        isActive && (imageAvailable > 0 || videoAvailable > 0) ? "مفتوح" : "مغلق",
      approved: isActive,
    };
  }

  function deriveFromDashboard(payload) {
    const dashboard = payload?.dashboard;
    if (!dashboard) return null;

    if (dashboard.accessCode) {
      return normalizeCodeInfo(dashboard.accessCode);
    }

    if (dashboard.subscription) {
      return normalizeCodeInfo({
        code: dashboard.subscription.code,
        packageName: dashboard.subscription.packageName,
        imageBalance: dashboard.subscription.imageBalance,
        videoBalance: dashboard.subscription.videoBalance,
        imageUsed: dashboard.subscription.imageUsed,
        videoUsed: dashboard.subscription.videoUsed,
        isRenewable: dashboard.subscription.isRenewable,
        renewalLabel: dashboard.subscription.renewalLabel,
        endAt: dashboard.subscription.endAt,
        email: dashboard.subscription.email,
        accessTypeLabel: dashboard.subscription.accessTypeLabel,
        status: dashboard.subscription.status,
        statusLabel:
          dashboard.subscription.status === "active" ? "صالح" : "منتهي",
      });
    }

    return null;
  }

  async function requestJson(path, options = {}) {
    const token = getStoredToken();
    const response = await fetch(`${API_BASE_URL}${path}`, {
      credentials: "include",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
      const error = new Error(payload.message || payload.error || "تعذر تنفيذ الطلب.");
      error.status = response.status;
      error.payload = payload;
      throw error;
    }

    return payload;
  }

  function classifyFailure(message) {
    const normalized = String(message || "");
    if (normalized.includes("انتهت صلاحية")) {
      return {
        title: "منتهي",
        decision: "مرفوض",
        kind: "error",
        message: normalized,
      };
    }

    if (normalized.includes("غير مخصص")) {
      return {
        title: "غير مطابق",
        decision: "مرفوض",
        kind: "error",
        message: normalized,
      };
    }

    return {
      title: "خطأ",
      decision: "مرفوض",
      kind: "error",
      message: normalized || "الكود غير صحيح أو غير فعال",
    };
  }

  function renderStatusCard(target, state) {
    if (!target) return;

    if (!state) {
      target.innerHTML = `
        <div class="empty-state">
          <strong>الشات مغلق</strong>
          <p>أدخل كود التفعيل لعرض حالة الكود والرصيد وصلاحية الباقة قبل المتابعة.</p>
        </div>
      `;
      return;
    }

    const approvedClass = state.approved ? "status-pill status-pill--active" : "status-pill status-pill--expired";
    const approvedLabel = state.approved ? "تمت الموافقة" : state.decision || "مرفوض";
    const statusLabel = state.statusLabel || state.title || "غير معروف";

    target.innerHTML = `
      <div class="info-stack">
        <div>
          <span>الموافقة</span>
          <strong><span class="${approvedClass}">${escapeHtml(approvedLabel)}</span></strong>
        </div>
        <div>
          <span>حالة الكود</span>
          <strong>${escapeHtml(statusLabel)}</strong>
        </div>
        <div>
          <span>الباقة / الكود</span>
          <strong>${escapeHtml(state.packageName || state.code || "غير متوفر")}</strong>
        </div>
        <div>
          <span>الرصيد الحالي</span>
          <strong>${escapeHtml(state.imageAvailable ?? 0)} صورة / ${escapeHtml(state.videoAvailable ?? 0)} فيديو</strong>
        </div>
        <div>
          <span>المستخدم من الرصيد</span>
          <strong>${escapeHtml(state.imageUsed ?? 0)} صورة / ${escapeHtml(state.videoUsed ?? 0)} فيديو</strong>
        </div>
        <div>
          <span>هل الكود متجدد</span>
          <strong>${state.isRenewable ? "نعم" : "لا"}${state.renewalLabel ? ` - ${escapeHtml(state.renewalLabel)}` : ""}</strong>
        </div>
        <div>
          <span>تاريخ الانتهاء</span>
          <strong>${formatDate(state.endAt)}</strong>
        </div>
        <div>
          <span>المتبقي للانتهاء</span>
          <strong>${formatRemainingDuration(state.endAt)}</strong>
        </div>
        <div>
          <span>نوع الوصول</span>
          <strong>${escapeHtml(state.accessTypeLabel || "عام")}</strong>
        </div>
        <div>
          <span>البريد المرتبط</span>
          <strong>${escapeHtml(state.email || "غير مرتبط")}</strong>
        </div>
        <div>
          <span>حالة الشات</span>
          <strong>${escapeHtml(state.chatStatus || (state.approved ? "مفتوح" : "مغلق"))}</strong>
        </div>
        <div>
          <span>النتيجة</span>
          <strong>${escapeHtml(state.message || (state.approved ? "الكود متاح للمتابعة" : "الكود غير متاح"))}</strong>
        </div>
      </div>
    `;
  }

  function syncSubscriptionUi(state) {
    const subscriptionTarget = document.querySelector("[data-dashboard-subscription]");
    const planTarget = document.querySelector("[data-dashboard-plan]");

    if (subscriptionTarget) {
      if (!state) {
        subscriptionTarget.textContent = "لا توجد باقة مفعلة حاليًا. فعّل كودك للبدء.";
      } else {
        subscriptionTarget.textContent = `الباقة الحالية: ${state.packageName} — حالة الكود: ${state.statusLabel} — المتبقي: ${state.imageAvailable} صورة / ${state.videoAvailable} فيديو — الانتهاء: ${formatDate(state.endAt)}`;
      }
    }

    if (planTarget) {
      renderStatusCard(planTarget, state);
    }
  }

  function toggleChat(enabled, state = null) {
    const createLock = document.querySelector("[data-create-lock]");
    const createGate = document.querySelector("[data-create-gate]");
    const panels = document.querySelectorAll("[data-create-panel]");
    const createMessage = document.querySelector("[data-create-message]");

    if (createLock) {
      createLock.hidden = Boolean(enabled);
    }

    panels.forEach((panel) => {
      panel.classList.toggle("create-disabled", !enabled);
      panel.querySelectorAll("input, textarea, select, button").forEach((input) => {
        input.disabled = !enabled;
      });
    });

    if (createGate) {
      if (enabled) {
        createGate.hidden = true;
        createGate.textContent = "";
      } else {
        createGate.hidden = false;
        createGate.className = "status-message is-error";
        createGate.textContent = state?.message || "فعّل كودًا صالحًا أولًا لفتح الشات.";
      }
    }

    if (createMessage && enabled && state) {
      setMessage(
        createMessage,
        `تم التحقق من الكود بنجاح. رصيدك: ${state.imageAvailable} صورة / ${state.videoAvailable} فيديو`,
        "success"
      );
    }
  }

  async function hydrateFromDashboard() {
    try {
      const payload = await requestJson("/api/dashboard", { method: "GET" });
      const state = deriveFromDashboard(payload);
      const dashboardStatus = document.querySelector("[data-dashboard-code-status]");
      const unlockStatus = document.querySelector("[data-create-unlock-status]");

      if (state) {
        persistCodeInfo(state);
        renderStatusCard(dashboardStatus, state);
        renderStatusCard(unlockStatus, state);
        syncSubscriptionUi(state);
        toggleChat(state.approved, state);
      } else {
        persistCodeInfo(null);
        renderStatusCard(dashboardStatus, null);
        renderStatusCard(unlockStatus, null);
        syncSubscriptionUi(null);
        toggleChat(false, {
          approved: false,
          message: "لم يتم تفعيل أي كود بعد.",
        });
      }
    } catch (error) {
      const fallback = readStoredCodeInfo();
      if (fallback) {
        const state = normalizeCodeInfo(fallback);
        renderStatusCard(document.querySelector("[data-dashboard-code-status]"), state);
        renderStatusCard(document.querySelector("[data-create-unlock-status]"), state);
        syncSubscriptionUi(state);
        toggleChat(state.approved, state);
      }
    }
  }

  async function handleActivation(event, form, messageTarget) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const button = form.querySelector('button[type="submit"]');
    const codeInput = form.elements.namedItem("code");
    const dashboardStatus = document.querySelector("[data-dashboard-code-status]");
    const unlockStatus = document.querySelector("[data-create-unlock-status]");

    try {
      const code = String(codeInput?.value || "").trim();
      if (!code) {
        throw new Error("أدخل كود التفعيل أولًا.");
      }

      setButtonBusy(button, true);
      setMessage(messageTarget, "جارٍ التحقق من الكود...", "info");

      const payload = await requestJson("/api/user/code/activate", {
        method: "POST",
        body: JSON.stringify({ code }),
      });

      const state = normalizeCodeInfo(payload.accessCode || payload.codeInfo || {});
      state.approved = true;
      state.message = payload.message || "تم التحقق من الكود بنجاح";
      state.decision = "تمت الموافقة";

      persistCodeInfo(state);
      renderStatusCard(dashboardStatus, state);
      renderStatusCard(unlockStatus, state);
      syncSubscriptionUi(state);
      toggleChat(true, state);
      setMessage(
        messageTarget,
        `تم الإدخال بنجاح - الكود متاح للمتابعة حتى ${formatDate(state.endAt)}`,
        "success"
      );
      form.reset();

      window.setTimeout(() => {
        hydrateFromDashboard().catch(() => {
          // ignore
        });
      }, 250);
    } catch (error) {
      const failure = classifyFailure(error.message);
      persistCodeInfo(null);
      renderStatusCard(document.querySelector("[data-dashboard-code-status]"), {
        ...failure,
        approved: false,
        chatStatus: "مغلق",
      });
      renderStatusCard(document.querySelector("[data-create-unlock-status]"), {
        ...failure,
        approved: false,
        chatStatus: "مغلق",
      });
      toggleChat(false, {
        approved: false,
        message: failure.message,
      });
      setMessage(messageTarget, failure.message, "error");
    } finally {
      setButtonBusy(button, false);
    }
  }

  function attachActivationForm(formSelector, messageSelector) {
    const form = document.querySelector(formSelector);
    const messageTarget = document.querySelector(messageSelector);
    if (!form || form.dataset.codeGateBound === "true") {
      return;
    }

    form.dataset.codeGateBound = "true";
    form.addEventListener(
      "submit",
      async (event) => {
        await handleActivation(event, form, messageTarget);
      },
      true
    );
  }

  function bootstrap() {
    if (!ACTIVE_PAGES.has(PAGE)) {
      return;
    }

    attachActivationForm("#dashboardActivationForm", "[data-dashboard-activate-message]");
    attachActivationForm("#createUnlockForm", "[data-create-unlock-message]");

    const stored = readStoredCodeInfo();
    if (stored) {
      const state = normalizeCodeInfo(stored);
      renderStatusCard(document.querySelector("[data-dashboard-code-status]"), state);
      renderStatusCard(document.querySelector("[data-create-unlock-status]"), state);
      syncSubscriptionUi(state);
      toggleChat(state.approved, state);
    } else {
      renderStatusCard(document.querySelector("[data-dashboard-code-status]"), null);
      renderStatusCard(document.querySelector("[data-create-unlock-status]"), null);
      toggleChat(false, {
        approved: false,
        message: "فعّل كودًا صالحًا لفتح الشات.",
      });
    }

    hydrateFromDashboard().catch(() => {
      // ignore initial load failures
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap);
  } else {
    bootstrap();
  }
})();
