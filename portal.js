window.__portalLoaded = true;

const defaultSiteSettings = {
  storeUrl: "https://advproai.com",
  supportWhatsapp: "966556915980",
  supportWhatsappMessage: "السلام عليكم أبغى الاشتراك في Advanced Pro",
};

const appConfig = {
  apiBaseUrl:
    window.AdvancedProConfig?.apiBaseUrl || "https://advancedpro.onrender.com",
};

const REQUEST_TIMEOUT_MS = 16000;

const state = {
  currentUser: undefined,
  siteSettings: { ...defaultSiteSettings },
  codeRecords: [],
  subscriptionRecords: [],
};

const AUTH_TOKEN_KEY = "advancedpro_token";

function getStoredToken() {
  try {
    const token = window.localStorage.getItem(AUTH_TOKEN_KEY);
    if (token) {
      return token;
    }
  } catch (error) {
    // Ignore storage failures.
  }

  try {
    const token = window.sessionStorage.getItem(AUTH_TOKEN_KEY);
    if (token) {
      return token;
    }
  } catch (error) {
    // Ignore storage failures.
  }

  const cookieMatch = document.cookie.match(
    new RegExp(`(?:^|; )${AUTH_TOKEN_KEY}=([^;]*)`)
  );
  if (cookieMatch) {
    return decodeURIComponent(cookieMatch[1]);
  }

  return null;
}

function setStoredToken(token) {
  try {
    if (token) {
      window.localStorage.setItem(AUTH_TOKEN_KEY, token);
    } else {
      window.localStorage.removeItem(AUTH_TOKEN_KEY);
    }
  } catch (error) {
    // Ignore storage failures (private mode, blocked storage).
  }

  try {
    if (token) {
      window.sessionStorage.setItem(AUTH_TOKEN_KEY, token);
    } else {
      window.sessionStorage.removeItem(AUTH_TOKEN_KEY);
    }
  } catch (error) {
    // Ignore storage failures.
  }

  try {
    if (token) {
      document.cookie = `${AUTH_TOKEN_KEY}=${encodeURIComponent(
        token
      )}; Path=/; Max-Age=604800; SameSite=Lax`;
    } else {
      document.cookie = `${AUTH_TOKEN_KEY}=; Path=/; Max-Age=0; SameSite=Lax`;
    }
  } catch (error) {
    // Ignore cookie failures.
  }
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function getPasswordValidationError(password) {
  const normalized = String(password || "");

  if (normalized.length < 8) {
    return "كلمة المرور يجب أن تكون 8 أحرف على الأقل.";
  }

  if (!/[A-Z]/.test(normalized)) {
    return "أضف حرفًا كبيرًا واحدًا على الأقل داخل كلمة المرور.";
  }

  if (!/\d/.test(normalized)) {
    return "أضف رقمًا واحدًا على الأقل داخل كلمة المرور.";
  }

  return "";
}

function getHttpErrorMessage(status) {
  switch (status) {
    case 400:
      return "تحقق من البيانات المدخلة ثم أعد المحاولة.";
    case 401:
      return "انتهت الجلسة أو بيانات الدخول غير صحيحة. سجل الدخول مرة أخرى.";
    case 403:
      return "ليس لديك صلاحية لتنفيذ هذا الإجراء.";
    case 404:
      return "تعذر العثور على الطلب المطلوب.";
    case 409:
      return "هذه البيانات مستخدمة بالفعل أو يوجد تعارض في الطلب.";
    case 422:
      return "بعض البيانات غير مكتملة أو غير صحيحة.";
    case 429:
      return "تم تجاوز عدد المحاولات المسموح. انتظر قليلًا ثم أعد المحاولة.";
    default:
      return "حدث خطأ غير متوقع. حاول مرة أخرى بعد قليل.";
  }
}

function getNetworkErrorMessage(error) {
  if (error?.name === "AbortError") {
    return "انتهت مهلة الاتصال بالخدمة. حاول مرة أخرى بعد قليل.";
  }

  return "تعذر الوصول إلى الخادم الآن. تأكد من اتصال الإنترنت، وقد تحتاج خدمة Render إلى ثوانٍ للاستيقاظ ثم إعادة المحاولة.";
}

function renderLoadError(target, title, error, hint) {
  if (!target) {
    return;
  }

  target.innerHTML = `
    <div class="empty-state is-error">
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(error?.message || "تعذر تحميل البيانات الآن.")}</p>
      <small>${escapeHtml(hint || "حاول تحديث الصفحة أو انتظر قليلًا ثم أعد المحاولة.")}</small>
    </div>
  `;
}

function formatDate(value, withTime = false) {
  if (!value) {
    return "غير متوفر";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "غير متوفر";
  }

  return new Intl.DateTimeFormat("ar-SA", {
    dateStyle: "medium",
    ...(withTime ? { timeStyle: "short" } : {}),
  }).format(date);
}

function getEyeIcon(isVisible) {
  if (isVisible) {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M3.3 4.7L2 6l4 4.02A11.2 11.2 0 0 0 1.5 12s3.9 6.5 10.5 6.5c2.18 0 4.1-.7 5.73-1.7L21 20l1.3-1.3zm8.7 11.8c-3.8 0-6.43-2.99-7.6-4.5a11.6 11.6 0 0 1 3.07-2.4l1.54 1.54a3.5 3.5 0 0 0 4.83 4.83l1.63 1.63a8.9 8.9 0 0 1-3.5.9m9-4.5S17.1 5.5 12 5.5c-1.52 0-2.92.35-4.2.92l1.55 1.56A8.4 8.4 0 0 1 12 7.5c3.8 0 6.43 2.99 7.6 4.5a11 11 0 0 1-2.68 2.23l1.46 1.46A11 11 0 0 0 22.5 12s-.5-.84-1.5-2.02M12 9.5a2.5 2.5 0 0 0-.8.14l3.16 3.16A2.5 2.5 0 0 0 12 9.5"/>
      </svg>
    `;
  }

  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M12 5.5C5.4 5.5 1.5 12 1.5 12S5.4 18.5 12 18.5S22.5 12 22.5 12S18.6 5.5 12 5.5m0 11c-3.8 0-6.43-2.99-7.6-4.5c1.17-1.51 3.8-4.5 7.6-4.5s6.43 2.99 7.6 4.5c-1.17 1.51-3.8 4.5-7.6 4.5m0-7A2.5 2.5 0 1 0 12 14.5A2.5 2.5 0 0 0 12 9.5"/>
    </svg>
  `;
}

async function requestJson(url, options = {}) {
  const resolvedUrl = url.startsWith("http") ? url : `${appConfig.apiBaseUrl}${url}`;
  const isCrossOrigin =
    resolvedUrl.startsWith("http") && !resolvedUrl.startsWith(window.location.origin);
  const controller = options.signal ? null : new AbortController();
  const timeoutId = controller
    ? window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    : null;

  let response;

  try {
    response = await fetch(resolvedUrl, {
      credentials: isCrossOrigin ? "include" : "same-origin",
      ...options,
      signal: options.signal || controller?.signal,
      headers: {
        "Content-Type": "application/json",
        ...(getStoredToken() ? { Authorization: `Bearer ${getStoredToken()}` } : {}),
        ...(options.headers || {}),
      },
    });
  } catch (error) {
    throw new Error(getNetworkErrorMessage(error));
  } finally {
    if (timeoutId) {
      window.clearTimeout(timeoutId);
    }
  }

  let payload = {};

  try {
    payload = await response.json();
  } catch (error) {
    payload = {};
  }

  !response.ok &&
    (payload.message = payload.message || payload.error || getHttpErrorMessage(response.status));

  if (!response.ok) {
    throw new Error(payload.message || "حدث خطأ غير متوقع.");
  }

  return payload;
}

function setMessage(target, message, type = "info") {
  if (!target) {
    return;
  }

  if (!message) {
    target.hidden = true;
    target.textContent = "";
    target.className = "status-message";
    return;
  }

  target.hidden = false;
  target.textContent = message;
  target.className = `status-message is-${type}`;
  target.setAttribute("role", type === "error" ? "alert" : "status");
  target.setAttribute("aria-live", type === "error" ? "assertive" : "polite");

  if (type === "error") {
    window.requestAnimationFrame(() => {
      target.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }
}

function showToast(message, type = "success") {
  if (!message) {
    return;
  }

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  window.setTimeout(() => {
    toast.classList.add("is-visible");
  }, 50);

  window.setTimeout(() => {
    toast.classList.remove("is-visible");
    window.setTimeout(() => toast.remove(), 300);
  }, 2800);
}

function setButtonBusy(button, busy, busyText = "جاري التنفيذ...") {
  if (!button) {
    return;
  }

  if (!button.dataset.originalLabel) {
    button.dataset.originalLabel = button.textContent.trim();
  }

  button.disabled = busy;
  button.textContent = busy ? busyText : button.dataset.originalLabel;
}

function formToObject(form) {
  const data = Object.fromEntries(new FormData(form).entries());

  form.querySelectorAll('input[type="checkbox"]').forEach((input) => {
    data[input.name] = input.checked;
  });

  return data;
}

async function loadPublicSettings() {
  try {
    const payload = await requestJson("/api/public/settings", {
      method: "GET",
    });

    state.siteSettings = {
      ...state.siteSettings,
      ...(payload.settings || {}),
    };
  } catch (error) {
    state.siteSettings = { ...defaultSiteSettings };
  }
}

function applyPublicSettings() {
  const whatsappLink = `https://wa.me/${state.siteSettings.supportWhatsapp}?text=${encodeURIComponent(
    state.siteSettings.supportWhatsappMessage
  )}`;

  document.querySelectorAll("[data-store-url]").forEach((element) => {
    if (element.tagName === "A") {
      element.href = state.siteSettings.storeUrl;
      return;
    }

    if ("value" in element) {
      element.value = state.siteSettings.storeUrl;
    }
  });

  document.querySelectorAll("[data-support-whatsapp]").forEach((element) => {
    if (element.tagName === "A") {
      element.href = whatsappLink;
    }
  });
}

async function getCurrentUser(force = false) {
  if (!force && state.currentUser !== undefined) {
    return state.currentUser;
  }

  try {
    const payload = await requestJson("/api/me", {
      method: "GET",
    });

    state.currentUser = payload.user;
  } catch (error) {
    state.currentUser = null;
  }

  return state.currentUser;
}

function updateSessionUi(user) {
  document.querySelectorAll("[data-session-name]").forEach((element) => {
    element.textContent = user?.fullName || "ضيف";
  });

  document.querySelectorAll("[data-auth-state]").forEach((element) => {
    if (!user) {
      element.textContent = "تسجيل الدخول";
      element.setAttribute("href", "/login");
      return;
    }

    element.textContent = user.role === "admin" ? "لوحة الأدمن" : "لوحة المستخدم";
    element.setAttribute("href", user.role === "admin" ? "/admin" : "/student.html");
  });
}

function setupPasswordToggles() {
  document.querySelectorAll("[data-password-toggle]").forEach((button) => {
    const input = button.parentElement?.querySelector("input");

    if (!input) {
      return;
    }

    const render = () => {
      const isVisible = input.type === "text";
      button.classList.toggle("is-visible", isVisible);
      button.innerHTML = getEyeIcon(isVisible);
      button.setAttribute("aria-label", isVisible ? "إخفاء كلمة المرور" : "إظهار كلمة المرور");
    };

    button.__renderPasswordToggle = render;
    render();

    if (button.dataset.bound === "true") {
      return;
    }

    button.dataset.bound = "true";
    button.addEventListener("click", () => {
      input.type = input.type === "password" ? "text" : "password";
      render();
    });
  });
}

function setupLogoutButtons() {
  document.querySelectorAll("[data-logout]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.preventDefault();

      try {
        await requestJson("/api/auth/logout", {
          method: "POST",
        });
      } finally {
        setStoredToken(null);
        window.location.href = "/login";
      }
    });
  });
}

async function enforceRoute() {
  const page = document.body.dataset.page || "";
  const needsAuth = document.body.dataset.requiresAuth === "true";
  const needsAdmin = document.body.dataset.requiresAdmin === "true";
  const guestOnly = document.body.dataset.guestOnly === "true";
  let user = await getCurrentUser();

  updateSessionUi(user);

  if (guestOnly && user) {
    window.location.href = user.role === "admin" ? "/admin" : "/student.html";
    return null;
  }

  if (needsAuth && !user) {
    if (getStoredToken()) {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 600 + attempt * 400));
        user = await getCurrentUser(true);
        if (user) {
          break;
        }
      }
    }

    if (!user) {
      window.location.href = page === "activate" ? "/login?next=/activate" : "/login";
      return null;
    }
  }

  if (needsAdmin && (!user || user.role !== "admin")) {
    window.location.href = user ? "/student.html" : "/login";
    return null;
  }

  return user;
}

function renderUsageList(target, logs) {
  if (!target) {
    return;
  }

  if (!logs.length) {
    target.innerHTML = `<div class="empty-state">لا يوجد سجل استخدام حتى الآن.</div>`;
    return;
  }

  target.innerHTML = `
    <div class="usage-list">
      ${logs
        .map(
          (log) => {
            const typeLabel = log.type === "image" ? "صورة" : "مشروع فيديو";
            const statusLabel = log.outputUrl ? "مكتمل" : "قيد المعالجة";
            const statusClass = log.outputUrl ? "status-pill--active" : "status-pill--pending";

            return `
            <article class="usage-item">
              <div>
                <strong>${escapeHtml(typeLabel)}</strong>
                <p>${escapeHtml(log.promptText || "بدون وصف محفوظ")}</p>
              </div>
              <div class="usage-item__meta">
                <span>${formatDate(log.createdAt, true)}</span>
                <span class="status-pill ${statusClass}">${statusLabel}</span>
              </div>
            </article>
          `;
          }
        )
        .join("")}
    </div>
  `;
}

async function initLoginPage() {
  const form = document.querySelector("#loginForm");
  const message = document.querySelector("[data-form-message]");

  if (!form) {
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');

    try {
      const values = formToObject(form);

      if (!isValidEmail(values.email)) {
        throw new Error("أدخل بريدًا إلكترونيًا صحيحًا.");
      }

      if (!String(values.password || "").trim()) {
        throw new Error("أدخل كلمة المرور للمتابعة.");
      }
      setButtonBusy(button, true, "جاري تسجيل الدخول...");
      setMessage(message, "");
      const payload = await requestJson("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(values),
      });
      setMessage(message, payload.message, "success");
      setStoredToken(payload.token);
      let redirect = payload.redirectTo || "/student.html";

      if (payload?.user?.role === "admin") {
        redirect = "/admin";
      }

      try {
        const me = await requestJson("/api/me", { method: "GET" });
        if (me?.user?.role === "admin") {
          redirect = "/admin";
        }
      } catch (error) {
        // Keep default redirect when session isn't ready yet.
      }

      showToast(payload.message || "تم تسجيل الدخول بنجاح 🎉");
      window.setTimeout(() => {
        window.location.href = redirect;
      }, 800);
    } catch (error) {
      setMessage(message, error.message, "error");
      showToast(error.message, "error");
    } finally {
      setButtonBusy(button, false);
    }
  });
}

async function initRegisterPage() {
  const form = document.querySelector("#registerForm");
  const message = document.querySelector("[data-form-message]");

  if (!form) {
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');

    try {
      const values = formToObject(form);
      const passwordError = getPasswordValidationError(values.password);

      if (!String(values.fullName || "").trim() || String(values.fullName || "").trim().length < 2) {
        throw new Error("أدخل اسمًا واضحًا لا يقل عن حرفين.");
      }

      if (!isValidEmail(values.email)) {
        throw new Error("أدخل بريدًا إلكترونيًا صحيحًا.");
      }

      if (passwordError) {
        throw new Error(passwordError);
      }

      if (values.password !== values.confirmPassword) {
        throw new Error("تأكيد كلمة المرور غير مطابق.");
      }
      setButtonBusy(button, true, "جاري إنشاء الحساب...");
      setMessage(message, "");
      const payload = await requestJson("/api/auth/register", {
        method: "POST",
        body: JSON.stringify(values),
      });
      setMessage(message, payload.message, "success");
      setStoredToken(payload.token);
      showToast(payload.message || "تم إنشاء الحساب بنجاح 🎉");
      window.setTimeout(() => {
        window.location.href = payload.redirectTo || "/student.html";
      }, 1200);
    } catch (error) {
      setMessage(message, error.message, "error");
      showToast(error.message, "error");
    } finally {
      setButtonBusy(button, false);
    }
  });
}

async function initForgotPasswordPage() {
  const form = document.querySelector("#forgotPasswordForm");
  const message = document.querySelector("[data-form-message]");

  if (!form) {
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');

    try {
      const values = formToObject(form);

      if (!isValidEmail(values.email)) {
        throw new Error("أدخل بريدًا إلكترونيًا صحيحًا لإرسال رابط الاستعادة.");
      }
      setButtonBusy(button, true, "جاري الإرسال...");
      setMessage(message, "");
      const payload = await requestJson("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify(values),
      });
      setMessage(message, payload.message, "success");
      form.reset();
    } catch (error) {
      setMessage(message, error.message, "error");
    } finally {
      setButtonBusy(button, false);
    }
  });
}

async function initActivatePage(user) {
  const form = document.querySelector("#activationForm");
  const message = document.querySelector("[data-form-message]");
  const emailField = document.querySelector("#activateEmail");

  if (emailField && user?.email) {
    emailField.value = user.email;
  }

  if (!form) {
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');

    try {
      setButtonBusy(button, true, "جاري التفعيل...");
      setMessage(message, "");
      const codeField = form.elements.namedItem("code");
      const code = String(codeField ? codeField.value : "").trim();

      if (!code) {
        throw new Error("أدخل كود التفعيل أولًا.");
      }
      const payload = await requestJson("/api/activate", {
        method: "POST",
        body: JSON.stringify({
          code,
        }),
      });
      setMessage(message, payload.message, "success");
      window.setTimeout(() => {
        window.location.href = "/student.html";
      }, 800);
    } catch (error) {
      setMessage(message, error.message, "error");
    } finally {
      setButtonBusy(button, false);
    }
  });
}

async function initDashboardPage() {
  const summaryTarget = document.querySelector("[data-dashboard-summary]");
  const usageTarget = document.querySelector("[data-dashboard-usage]");
  const welcomeTarget = document.querySelector("[data-dashboard-name]");
  const avatarTarget = document.querySelector("[data-dashboard-avatar]");
  const subscriptionTarget = document.querySelector("[data-dashboard-subscription]");
  const planTarget = document.querySelector("[data-dashboard-plan]");
  const activationForm = document.querySelector("#dashboardActivationForm");
  const activationMessage = document.querySelector("[data-dashboard-activate-message]");

  const loadDashboard = async () => {
    const payload = await requestJson("/api/dashboard", { method: "GET" });
    const dashboard = payload.dashboard;
    const subscription = dashboard.subscription;

    if (welcomeTarget) {
      welcomeTarget.textContent = dashboard.user.fullName;
    }

    if (avatarTarget) {
      const fallback = dashboard.user.fullName || dashboard.user.email || "U";
      avatarTarget.textContent = fallback.trim().charAt(0);
    }

    if (subscriptionTarget) {
      if (subscription) {
        const endDate = subscription.endAt ? new Date(subscription.endAt) : null;
        const daysLeft = endDate
          ? Math.max(Math.ceil((endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)), 0)
          : null;
        const daysLabel = daysLeft !== null ? `${daysLeft} يوم` : "غير محدد";

        subscriptionTarget.textContent = `باقتك الحالية: ${subscription.packageName} — المتبقي: ${
          subscription.imageBalance ?? 0
        } صورة / ${subscription.videoBalance ?? 0} فيديو — ينتهي الاشتراك بعد: ${daysLabel}`;
      } else {
        subscriptionTarget.textContent = "لا توجد باقة مفعلة حتى الآن. فعّل كودك للبدء.";
      }
    }

    if (summaryTarget) {
      summaryTarget.innerHTML = `
        <article class="info-card">
          <span>الرصيد الحالي</span>
          <strong>${escapeHtml(subscription?.imageBalance ?? 0)} صورة / ${
        subscription?.videoBalance ?? 0
      } فيديو</strong>
          <small>آخر تحديث فوري داخل حسابك</small>
        </article>
        <article class="info-card">
          <span>الصور المتبقية</span>
          <strong>${escapeHtml(subscription?.imageBalance ?? 0)}</strong>
          <small>استهلاكك الإجمالي: ${escapeHtml(dashboard.usageTotals.imagesUsed)}</small>
        </article>
        <article class="info-card">
          <span>الفيديوهات المتبقية</span>
          <strong>${escapeHtml(subscription?.videoBalance ?? 0)}</strong>
          <small>استهلاكك الإجمالي: ${escapeHtml(dashboard.usageTotals.videosUsed)}</small>
        </article>
        <article class="info-card">
          <span>انتهاء الباقة</span>
          <strong>${formatDate(subscription?.endAt)}</strong>
          <small>المدة القصوى: ${escapeHtml(subscription?.videoMaxDurationSeconds ?? 0)} ثانية</small>
        </article>
      `;
    }

    if (planTarget) {
      planTarget.innerHTML = subscription
        ? `
          <div class="info-stack">
            <div><span>اسم الباقة</span><strong>${escapeHtml(subscription.packageName)}</strong></div>
            <div><span>المتبقي</span><strong>${escapeHtml(
              subscription.imageBalance ?? 0
            )} صورة / ${escapeHtml(subscription.videoBalance ?? 0)} فيديو</strong></div>
            <div><span>أقصى مدة للفيديو</span><strong>${escapeHtml(
              subscription.videoMaxDurationSeconds ?? 0
            )} ثانية</strong></div>
            <div><span>تاريخ الانتهاء</span><strong>${formatDate(subscription.endAt)}</strong></div>
          </div>
        `
        : `<div class="empty-state">لا توجد باقة مفعلة حاليًا.</div>`;
    }

    renderUsageList(usageTarget, dashboard.recentUsage || []);
  };

  try {
    await loadDashboard();
  } catch (error) {
    renderLoadError(summaryTarget, "تعذر تحميل لوحة التحكم.", error);
    renderLoadError(
      usageTarget,
      "تعذر تحميل سجل الاستخدام.",
      error,
      "تأكد من جاهزية الباكند ثم أعد تحديث الصفحة."
    );
  }

  if (activationForm) {
    activationForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = activationForm.querySelector('button[type="submit"]');

      try {
        const codeField = activationForm.elements.namedItem("code");
        const code = String(codeField ? codeField.value : "").trim();

        if (!code) {
          throw new Error("أدخل كود التفعيل أولًا.");
        }

        setButtonBusy(button, true, "جاري التفعيل...");
        setMessage(activationMessage, "");
        const payload = await requestJson("/api/activate", {
          method: "POST",
          body: JSON.stringify({ code }),
        });
        setMessage(activationMessage, payload.message, "success");
        activationForm.reset();
        await loadDashboard();
      } catch (error) {
        setMessage(activationMessage, error.message, "error");
      } finally {
        setButtonBusy(button, false);
      }
    });
  }
}

async function initProfilePage() {
  const accountTarget = document.querySelector("[data-profile-account]");
  const subscriptionTarget = document.querySelector("[data-profile-subscription]");
  const usageTarget = document.querySelector("[data-profile-usage]");
  const profileForm = document.querySelector("#profileForm");
  const passwordForm = document.querySelector("#passwordForm");
  const profileMessage = document.querySelector("[data-profile-message]");
  const passwordMessage = document.querySelector("[data-password-message]");

  try {
    const payload = await requestJson("/api/profile", { method: "GET" });
    const profile = payload.profile;
    const subscription = profile.subscription;

    if (profileForm) {
      const fullNameField = profileForm.elements.namedItem("fullName");

      if (fullNameField) {
        fullNameField.value = profile.user.fullName || "";
      }
    }

    if (accountTarget) {
      accountTarget.innerHTML = `
        <div class="info-stack">
          <div><span>الاسم</span><strong>${escapeHtml(profile.user.fullName)}</strong></div>
          <div><span>البريد الإلكتروني</span><strong>${escapeHtml(profile.user.email)}</strong></div>
          <div><span>تاريخ التسجيل</span><strong>${formatDate(profile.user.createdAt)}</strong></div>
          <div><span>حالة الحساب</span><strong>${escapeHtml(profile.user.status)}</strong></div>
        </div>
      `;
    }

    if (subscriptionTarget) {
      subscriptionTarget.innerHTML = `
        <div class="info-stack">
          <div><span>الباقة</span><strong>${escapeHtml(subscription?.packageName || "لا توجد باقة")}</strong></div>
          <div><span>تاريخ البداية</span><strong>${formatDate(subscription?.startAt)}</strong></div>
          <div><span>تاريخ النهاية</span><strong>${formatDate(subscription?.endAt)}</strong></div>
          <div><span>الصور المتبقية</span><strong>${escapeHtml(subscription?.imageBalance ?? 0)}</strong></div>
          <div><span>مشاريع الفيديو المتبقية</span><strong>${escapeHtml(subscription?.videoBalance ?? 0)}</strong></div>
          <div><span>أقصى مدة المشروع</span><strong>${escapeHtml(subscription?.videoMaxDurationSeconds ?? 0)} ثانية</strong></div>
          <div><span>التجديد</span><strong>${subscription?.renewalEnabled ? "مفعل" : "غير مفعل"}</strong></div>
        </div>
      `;
    }

    renderUsageList(usageTarget, profile.recentUsage || []);
  } catch (error) {
    renderLoadError(accountTarget, "تعذر تحميل الملف الشخصي.", error);
    renderLoadError(subscriptionTarget, "تعذر تحميل بيانات الاشتراك.", error);
    renderLoadError(usageTarget, "تعذر تحميل سجل الاستخدام.", error);
  }

  if (profileForm) {
    profileForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = profileForm.querySelector('button[type="submit"]');

      try {
        const values = formToObject(profileForm);

        if (!String(values.fullName || "").trim() || String(values.fullName || "").trim().length < 2) {
          throw new Error("أدخل اسمًا واضحًا لا يقل عن حرفين.");
        }
        setButtonBusy(button, true, "جاري الحفظ...");
        setMessage(profileMessage, "");
        const payload = await requestJson("/api/profile", {
          method: "PATCH",
          body: JSON.stringify(values),
        });
        setMessage(profileMessage, payload.message, "success");
      } catch (error) {
        setMessage(profileMessage, error.message, "error");
      } finally {
        setButtonBusy(button, false);
      }
    });
  }

  if (passwordForm) {
    passwordForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = passwordForm.querySelector('button[type="submit"]');

      try {
        const values = formToObject(passwordForm);
        const passwordError = getPasswordValidationError(values.newPassword);

        if (!String(values.currentPassword || "").trim()) {
          throw new Error("أدخل كلمة المرور الحالية أولًا.");
        }

        if (passwordError) {
          throw new Error(passwordError);
        }

        if (values.newPassword !== values.confirmPassword) {
          throw new Error("تأكيد كلمة المرور غير مطابق.");
        }
        setButtonBusy(button, true, "جاري التحديث...");
        setMessage(passwordMessage, "");
        const payload = await requestJson("/api/profile/password", {
          method: "POST",
          body: JSON.stringify(values),
        });
        setMessage(passwordMessage, payload.message, "success");
        passwordForm.reset();
        passwordForm.querySelectorAll(".password-input input").forEach((input) => {
          input.type = "password";
        });
        setupPasswordToggles();
      } catch (error) {
        setMessage(passwordMessage, error.message, "error");
      } finally {
        setButtonBusy(button, false);
      }
    });
  }
}

async function initAdminOverview() {
  const target = document.querySelector("[data-admin-summary]");

  try {
    const payload = await requestJson("/api/admin/summary", { method: "GET" });
    const summary = payload.summary;
    const dailyAverage = summary.requestsLast7Days
      ? Math.ceil(summary.requestsLast7Days / 7)
      : 0;

    if (target) {
      target.innerHTML = `
        <article class="info-card"><span>عدد المستخدمين</span><strong>${summary.totalUsers}</strong></article>
        <article class="info-card"><span>عدد المشتركين</span><strong>${summary.activeSubscriptions}</strong></article>
        <article class="info-card"><span>الإيرادات</span><strong>—</strong></article>
        <article class="info-card"><span>متوسط الطلبات اليومية</span><strong>${dailyAverage}</strong></article>
        <article class="info-card"><span>الأكواد النشطة</span><strong>${summary.activeCodes}</strong></article>
      `;
    }
  } catch (error) {
    renderLoadError(target, "تعذر تحميل ملخص لوحة الأدمن.", error);
  }
}

function renderUsersTable(target, users) {
  target.innerHTML = `
    <div class="table-shell">
      <table class="data-table">
        <thead>
          <tr>
            <th>المستخدم</th>
            <th>الباقة</th>
            <th>الحالة</th>
            <th>الصلاحية</th>
            <th>التحكم</th>
          </tr>
        </thead>
        <tbody>
          ${users
            .map(
              (user) => {
                const toggleStatus = user.status === "active" ? "suspended" : "active";
                const toggleLabel = user.status === "active" ? "حظر" : "تفعيل";
                const statusLabel = user.status === "active" ? "نشط" : "موقوف";
                const statusClass =
                  user.status === "active" ? "status-pill--active" : "status-pill--suspended";

                return `
                <tr data-user-row="${user.id}">
                  <td>
                    <strong>${escapeHtml(user.fullName)}</strong>
                    <span>${escapeHtml(user.email)}</span>
                  </td>
                  <td>${escapeHtml(user.currentPackage || "لا توجد")}</td>
                  <td>
                    <span class="status-pill ${statusClass}" data-status-pill>${statusLabel}</span>
                  </td>
                  <td>${formatDate(user.subscriptionEndAt)}</td>
                  <td>
                    <select data-user-status>
                      <option value="active" ${user.status === "active" ? "selected" : ""}>نشط</option>
                      <option value="suspended" ${user.status === "suspended" ? "selected" : ""}>موقوف</option>
                    </select>
                    <select data-user-role>
                      <option value="user" ${user.role === "user" ? "selected" : ""}>User</option>
                      <option value="admin" ${user.role === "admin" ? "selected" : ""}>Admin</option>
                    </select>
                    <button class="btn btn-secondary btn-sm" type="button" data-user-toggle="${toggleStatus}" data-user-id="${user.id}">${toggleLabel}</button>
                    <button class="btn btn-secondary btn-sm" type="button" data-user-save="${user.id}">حفظ</button>
                  </td>
                </tr>
              `;
              }
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

async function initAdminUsersPage() {
  const form = document.querySelector("#adminUsersSearch");
  const target = document.querySelector("[data-admin-users]");
  const message = document.querySelector("[data-admin-users-message]");

  const updateStatusPill = (row, status) => {
    const pill = row?.querySelector("[data-status-pill]");
    if (!pill) {
      return;
    }
    pill.textContent = status === "active" ? "نشط" : "موقوف";
    pill.classList.toggle("status-pill--active", status === "active");
    pill.classList.toggle("status-pill--suspended", status === "suspended");
  };

  const loadUsers = async (search = "") => {
    const payload = await requestJson(`/api/admin/users?search=${encodeURIComponent(search)}`, {
      method: "GET",
    });
    renderUsersTable(target, payload.users || []);
  };

  await loadUsers();

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const searchField = form.elements.namedItem("search");
    await loadUsers(searchField ? searchField.value : "");
  });

  target?.addEventListener("click", async (event) => {
    const toggle = event.target.closest("[data-user-toggle]");

    if (toggle) {
      const row = toggle.closest("[data-user-row]");
      const id = Number(toggle.dataset.userId);
      const nextStatus = toggle.dataset.userToggle;

      try {
        setButtonBusy(toggle, true, "جاري...");
        await requestJson("/api/admin/users", {
          method: "PATCH",
          body: JSON.stringify({
            id,
            status: nextStatus,
            role: row.querySelector("[data-user-role]").value,
          }),
        });
        row.querySelector("[data-user-status]").value = nextStatus;
        updateStatusPill(row, nextStatus);
        toggle.dataset.userToggle = nextStatus === "active" ? "suspended" : "active";
        toggle.textContent = nextStatus === "active" ? "حظر" : "تفعيل";
        setMessage(message, "تم تحديث حالة المستخدم.", "success");
      } catch (error) {
        setMessage(message, error.message, "error");
      } finally {
        setButtonBusy(toggle, false);
      }

      return;
    }

    const button = event.target.closest("[data-user-save]");

    if (!button) {
      return;
    }

    const row = button.closest("[data-user-row]");
    const id = Number(button.dataset.userSave);

    try {
      setButtonBusy(button, true, "جاري الحفظ...");
      await requestJson("/api/admin/users", {
        method: "PATCH",
        body: JSON.stringify({
          id,
          status: row.querySelector("[data-user-status]").value,
          role: row.querySelector("[data-user-role]").value,
        }),
      });
      updateStatusPill(row, row.querySelector("[data-user-status]").value);
      setMessage(message, "تم تحديث المستخدم.", "success");
    } catch (error) {
      setMessage(message, error.message, "error");
    } finally {
      setButtonBusy(button, false);
    }
  });
}

function renderCodesTable(target, codes) {
  target.innerHTML = `
    <div class="table-shell">
      <table class="data-table">
        <thead>
          <tr>
            <th>الكود</th>
            <th>الباقة</th>
            <th>رصيد الصور</th>
            <th>رصيد الفيديو</th>
            <th>مدة الفيديو</th>
            <th>الصلاحية</th>
            <th>الإيميل المخصص</th>
            <th>الحالة</th>
            <th>التحكم</th>
          </tr>
        </thead>
        <tbody>
          ${codes
            .map(
              (code) => `
                <tr>
                  <td><strong>${escapeHtml(code.code)}</strong></td>
                  <td>${escapeHtml(code.planName)}</td>
                  <td>${code.imageQuota} صورة</td>
                  <td>${code.videoQuota} مشروع فيديو</td>
                  <td>${code.videoMaxDurationSeconds} ثانية</td>
                  <td>${code.validityDays} يوم</td>
                  <td>${escapeHtml(code.assignedEmail || "عام")}</td>
                  <td>${code.isActive ? "نشط" : "معطل"} - ${code.redeemedCount}/${code.maxRedemptions}</td>
                  <td><button class="btn btn-secondary btn-sm" type="button" data-code-edit="${code.id}">تعديل</button></td>
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function fillCodeForm(form, record) {
  form.elements.namedItem("id").value = record?.id || "";
  form.elements.namedItem("code").value = record?.code || "";
  form.elements.namedItem("planName").value = record?.planName || "";
  form.elements.namedItem("imageQuota").value = record?.imageQuota ?? 0;
  form.elements.namedItem("videoQuota").value = record?.videoQuota ?? 0;
  form.elements.namedItem("videoMaxDurationSeconds").value =
    record?.videoMaxDurationSeconds ?? 5;
  form.elements.namedItem("validityDays").value = record?.validityDays ?? 30;
  form.elements.namedItem("renewalEnabled").checked = Boolean(record?.renewalEnabled);
  form.elements.namedItem("renewalEveryDays").value = record?.renewalEveryDays ?? "";
  form.elements.namedItem("renewalMode").value = record?.renewalMode || "topup";
  form.elements.namedItem("renewalImageQuota").value = record?.renewalImageQuota ?? 0;
  form.elements.namedItem("renewalVideoQuota").value = record?.renewalVideoQuota ?? 0;
  form.elements.namedItem("maxRedemptions").value = record?.maxRedemptions ?? 1;
  form.elements.namedItem("isActive").checked = record ? Boolean(record.isActive) : true;
  form.elements.namedItem("assignedEmail").value = record?.assignedEmail || "";
}

async function initAdminCodesPage() {
  const form = document.querySelector("#adminCodeForm");
  const searchForm = document.querySelector("#adminCodesSearch");
  const target = document.querySelector("[data-admin-codes]");
  const message = document.querySelector("[data-admin-codes-message]");

  const loadCodes = async (search = "") => {
    const payload = await requestJson(`/api/admin/codes?search=${encodeURIComponent(search)}`, {
      method: "GET",
    });
    state.codeRecords = payload.codes || [];
    renderCodesTable(target, state.codeRecords);
  };

  await loadCodes();
  fillCodeForm(form, null);

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    const values = formToObject(form);

    try {
      setButtonBusy(button, true, values.id ? "جاري التحديث..." : "جاري الإنشاء...");
      await requestJson("/api/admin/codes", {
        method: values.id ? "PATCH" : "POST",
        body: JSON.stringify(values),
      });
      setMessage(message, values.id ? "تم تحديث الكود." : "تم إنشاء الكود.", "success");
      fillCodeForm(form, null);
      const searchField = searchForm?.elements.namedItem("search");
      await loadCodes(searchField ? searchField.value : "");
    } catch (error) {
      setMessage(message, error.message, "error");
    } finally {
      setButtonBusy(button, false);
    }
  });

  searchForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const searchField = searchForm.elements.namedItem("search");
    await loadCodes(searchField ? searchField.value : "");
  });

  document.querySelector("[data-code-reset]")?.addEventListener("click", () => {
    fillCodeForm(form, null);
    setMessage(message, "");
  });

  target?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-code-edit]");

    if (!button) {
      return;
    }

    const record = state.codeRecords.find((item) => item.id === Number(button.dataset.codeEdit));

    if (record) {
      fillCodeForm(form, record);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  });
}

function renderSubscriptionsTable(target, subscriptions) {
  target.innerHTML = `
    <div class="table-shell">
      <table class="data-table">
        <thead>
          <tr>
            <th>المستخدم</th>
            <th>الباقة</th>
            <th>الرصيد</th>
            <th>النهاية</th>
            <th>الحالة</th>
            <th>التحكم</th>
          </tr>
        </thead>
        <tbody>
          ${subscriptions
            .map(
              (subscription) => `
                <tr>
                  <td>
                    <strong>${escapeHtml(subscription.fullName)}</strong>
                    <span>${escapeHtml(subscription.email)}</span>
                  </td>
                  <td>${escapeHtml(subscription.packageName)}<br><small>${escapeHtml(subscription.code || "بدون كود")}</small></td>
                  <td>${subscription.imageBalance} / ${subscription.videoBalance}</td>
                  <td>${formatDate(subscription.endAt)}</td>
                  <td>${escapeHtml(subscription.status)}</td>
                  <td><button class="btn btn-secondary btn-sm" type="button" data-subscription-edit="${subscription.id}">تعديل</button></td>
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function fillSubscriptionForm(form, record) {
  form.elements.namedItem("id").value = record?.id || "";
  form.elements.namedItem("status").value = record?.status || "active";
  form.elements.namedItem("imageBalance").value = record?.imageBalance ?? 0;
  form.elements.namedItem("videoBalance").value = record?.videoBalance ?? 0;
  form.elements.namedItem("endAt").value = record?.endAt
    ? new Date(record.endAt).toISOString().slice(0, 16)
    : "";
}

async function initAdminSubscriptionsPage() {
  const form = document.querySelector("#adminSubscriptionForm");
  const searchForm = document.querySelector("#adminSubscriptionsSearch");
  const target = document.querySelector("[data-admin-subscriptions]");
  const message = document.querySelector("[data-admin-subscriptions-message]");

  const loadSubscriptions = async (search = "") => {
    const payload = await requestJson(
      `/api/admin/subscriptions?search=${encodeURIComponent(search)}`,
      { method: "GET" }
    );
    state.subscriptionRecords = payload.subscriptions || [];
    renderSubscriptionsTable(target, state.subscriptionRecords);
  };

  await loadSubscriptions();
  fillSubscriptionForm(form, null);

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');

    try {
      setButtonBusy(button, true, "جاري الحفظ...");
      await requestJson("/api/admin/subscriptions", {
        method: "PATCH",
        body: JSON.stringify(formToObject(form)),
      });
      setMessage(message, "تم تحديث الاشتراك.", "success");
      const searchField = searchForm?.elements.namedItem("search");
      await loadSubscriptions(searchField ? searchField.value : "");
      fillSubscriptionForm(form, null);
    } catch (error) {
      setMessage(message, error.message, "error");
    } finally {
      setButtonBusy(button, false);
    }
  });

  searchForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const searchField = searchForm.elements.namedItem("search");
    await loadSubscriptions(searchField ? searchField.value : "");
  });

  target?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-subscription-edit]");

    if (!button) {
      return;
    }

    const record = state.subscriptionRecords.find(
      (item) => item.id === Number(button.dataset.subscriptionEdit)
    );

    if (record) {
      fillSubscriptionForm(form, record);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  });
}

async function initAdminSettingsPage() {
  const form = document.querySelector("#adminSettingsForm");
  const message = document.querySelector("[data-admin-settings-message]");

  if (!form) {
    return;
  }

  try {
    const payload = await requestJson("/api/admin/settings", { method: "GET" });
    form.elements.namedItem("storeUrl").value =
      payload.settings.store_url || state.siteSettings.storeUrl;
    form.elements.namedItem("supportWhatsapp").value =
      payload.settings.support_whatsapp || state.siteSettings.supportWhatsapp;
    form.elements.namedItem("supportWhatsappMessage").value =
      payload.settings.support_whatsapp_message || state.siteSettings.supportWhatsappMessage;
  } catch (error) {
    setMessage(message, error.message, "error");
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');

    try {
      setButtonBusy(button, true, "جاري الحفظ...");
      const payload = await requestJson("/api/admin/settings", {
        method: "POST",
        body: JSON.stringify(formToObject(form)),
      });
      setMessage(message, payload.message, "success");
    } catch (error) {
      setMessage(message, error.message, "error");
    } finally {
      setButtonBusy(button, false);
    }
  });
}

async function initPage(user) {
  switch (document.body.dataset.page) {
    case "login":
      return initLoginPage();
    case "register":
      return initRegisterPage();
    case "forgot-password":
      return initForgotPasswordPage();
    case "activate":
      return initActivatePage(user);
    case "dashboard":
      return initDashboardPage();
    case "student":
      return initDashboardPage();
    case "profile":
      return initProfilePage();
    case "admin":
      return initAdminOverview();
    case "admin-users":
      return initAdminUsersPage();
    case "admin-codes":
      return initAdminCodesPage();
    case "admin-subscriptions":
      return initAdminSubscriptionsPage();
    case "admin-settings":
      return initAdminSettingsPage();
    default:
      return null;
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  setupPasswordToggles();
  setupLogoutButtons();
  await loadPublicSettings();
  applyPublicSettings();
  const user = await enforceRoute();

  if (document.body.dataset.requiresAuth === "true" && !user) {
    return;
  }

  if (document.body.dataset.requiresAdmin === "true" && (!user || user.role !== "admin")) {
    return;
  }

  await initPage(user);
});
