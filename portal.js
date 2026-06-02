window.__portalLoaded = true;

const defaultSiteSettings = {
  storeUrl: "https://advproai.com",
  supportWhatsapp: "966556915980",
  supportWhatsappMessage: "السلام عليكم أبغى الاشتراك في Advanced Pro",
};

const appConfig = {
  apiBaseUrl:
    window.AdvancedProConfig?.apiBaseUrl || "",
};

const REQUEST_TIMEOUT_MS = 16000;

const state = {
  currentUser: undefined,
  siteSettings: { ...defaultSiteSettings },
  codeRecords: [],
  subscriptionRecords: [],
};

const AUTH_TOKEN_KEY = "advancedpro_token";
const LOGOUT_FLAG_KEY = "advancedpro_force_logout";
const ACCESS_CODE_STORAGE_KEY = "advancedpro_access_code";

function isForcedLogout() {
  try {
    return window.localStorage.getItem(LOGOUT_FLAG_KEY) === "1";
  } catch (error) {
    return false;
  }
}

function setForcedLogout(value) {
  try {
    if (value) {
      window.localStorage.setItem(LOGOUT_FLAG_KEY, "1");
    } else {
      window.localStorage.removeItem(LOGOUT_FLAG_KEY);
    }
  } catch (error) {
    // ignore
  }
}

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

function formatRemainingDuration(value) {
  if (!value) {
    return "غير محدد";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "غير محدد";
  }

  const diff = date.getTime() - Date.now();
  if (diff <= 0) {
    return "منتهي";
  }

  const totalHours = Math.ceil(diff / (1000 * 60 * 60));
  if (totalHours < 24) {
    return `${totalHours} ساعة`;
  }

  const totalDays = Math.ceil(totalHours / 24);
  return `${totalDays} يوم`;
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
    if (payload.requestId) {
      console.error("API request failed", {
        url: resolvedUrl,
        status: response.status,
        requestId: payload.requestId,
        code: payload.code || null,
        message: payload.message,
      });
      payload.message = `${payload.message || getHttpErrorMessage(response.status)} (رقم الطلب: ${payload.requestId})`;
    }
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

function persistAccessCodeSnapshot(accessCode) {
  try {
    if (accessCode) {
      window.localStorage.setItem(
        ACCESS_CODE_STORAGE_KEY,
        JSON.stringify(accessCode)
      );
    } else {
      window.localStorage.removeItem(ACCESS_CODE_STORAGE_KEY);
    }
  } catch (error) {
    // Ignore storage failures.
  }
}

function readAccessCodeSnapshot() {
  try {
    const raw = window.localStorage.getItem(ACCESS_CODE_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

function buildSubscriptionFromAccessCode(accessCode) {
  if (!accessCode) {
    return null;
  }

  return {
    packageName: accessCode.ownerName || `كود ${accessCode.code}`,
    code: accessCode.code,
    status: accessCode.statusKey === "expired" ? "expired" : "active",
    imageBalance: Number(accessCode.imageAvailable ?? 0),
    videoBalance: Number(accessCode.videoAvailable ?? 0),
    videoMaxDurationSeconds: 60,
    startAt: accessCode.activatedAt || accessCode.createdAt || null,
    endAt: accessCode.expiresAt || null,
    imageLimit: Number(accessCode.imageLimit ?? 0),
    videoLimit: Number(accessCode.videoLimit ?? 0),
    imageUsed: Number(accessCode.imageUsed ?? 0),
    videoUsed: Number(accessCode.videoUsed ?? 0),
    isRenewable: Boolean(accessCode.isRenewable),
    renewalType: accessCode.renewalType || null,
    renewalLabel: accessCode.renewalLabel || "",
    email: accessCode.email || null,
    ownerName: accessCode.ownerName || null,
    accessTypeLabel: accessCode.accessTypeLabel || "عام",
  };
}

function renderAccessCodeStatus(target, accessCode, subscription) {
  if (!target) {
    return;
  }

  const currentCode = accessCode || readAccessCodeSnapshot();
  const currentSubscription =
    subscription || buildSubscriptionFromAccessCode(currentCode);

  if (!currentCode || !currentSubscription) {
    target.innerHTML =
      '<div class="empty-state">لم يتم تفعيل كود بعد. فعّل الكود لفتح الشات ومعرفة الرصيد.</div>';
    return;
  }

  target.innerHTML = `
    <div class="info-stack">
      <div><span>الباقة / الكود</span><strong>${escapeHtml(currentSubscription.packageName || currentCode.ownerName || currentCode.code)}</strong></div>
      <div><span>حالة الكود</span><strong>${escapeHtml(currentCode.statusLabel || "صالح")}</strong></div>
      <div><span>الرصيد الحالي</span><strong>${escapeHtml(currentCode.imageAvailable ?? currentSubscription.imageBalance ?? 0)} صورة / ${escapeHtml(currentCode.videoAvailable ?? currentSubscription.videoBalance ?? 0)} فيديو</strong></div>
      <div><span>عدد الصور المستخدمة</span><strong>${escapeHtml(currentCode.imageUsed ?? currentSubscription.imageUsed ?? 0)}</strong></div>
      <div><span>عدد الفيديوهات المستخدمة</span><strong>${escapeHtml(currentCode.videoUsed ?? currentSubscription.videoUsed ?? 0)}</strong></div>
      <div><span>هل الكود متجدد</span><strong>${currentSubscription.isRenewable ? "نعم" : "لا"}${currentSubscription.renewalLabel ? ` - ${escapeHtml(currentSubscription.renewalLabel)}` : ""}</strong></div>
      <div><span>تاريخ الانتهاء</span><strong>${formatDate(currentSubscription.endAt)}</strong></div>
      <div><span>المتبقي للانتهاء</span><strong>${formatRemainingDuration(currentSubscription.endAt)}</strong></div>
      <div><span>البريد المرتبط</span><strong>${escapeHtml(currentSubscription.email || "غير مرتبط")}</strong></div>
      <div><span>حالة الشات</span><strong>${escapeHtml(currentCode.chatStatus || "مفتوح")}</strong></div>
    </div>
  `;
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

  if (isForcedLogout()) {
    state.currentUser = null;
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

async function getCurrentAdmin() {
  try {
    const payload = await requestJson("/api/admin/session", {
      method: "GET",
    });
    return payload.admin || null;
  } catch (error) {
    return null;
  }
}

function getAdminLoginPath() {
  const configured = String(
    window.AdvancedProConfig?.adminSecretPath || "advanced-pro-control"
  ).replace(/^\/+|\/+$/g, "");
  return `/${configured || "advanced-pro-control"}`;
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

async function performLogout() {
  try {
    await requestJson("/api/admin/logout", {
      method: "POST",
    });
  } catch (error) {
    // ignore
  }

  try {
    await requestJson("/api/auth/logout", {
      method: "POST",
    });
  } catch (error) {
    // ignore
  } finally {
    setForcedLogout(true);
    setStoredToken(null);
    persistAccessCodeSnapshot(null);
    try {
      document.cookie = "token=; Path=/; Max-Age=0; SameSite=None; Secure";
      document.cookie = "token=; Path=/; Max-Age=0; SameSite=Lax";
      document.cookie = "admin_session=; Path=/; Max-Age=0; SameSite=Lax";
    } catch (error) {
      // ignore
    }
    window.location.href = "/";
  }
}

window.performLogout = performLogout;

function setupLogoutButtons() {
  if (document.body.dataset.logoutBound === "true") {
    return;
  }

  document.body.dataset.logoutBound = "true";

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-logout]");
    if (!button) {
      return;
    }
    event.preventDefault();
    performLogout();
  });
}

async function enforceRoute() {
  const page = document.body.dataset.page || "";
  const needsAuth = document.body.dataset.requiresAuth === "true";
  const needsAdmin = document.body.dataset.requiresAdmin === "true";
  const guestOnly = document.body.dataset.guestOnly === "true";

  if (needsAdmin) {
    const admin = await getCurrentAdmin();
    if (!admin) {
      window.location.href = getAdminLoginPath();
      return null;
    }
    return {
      id: admin.id,
      fullName: admin.name,
      email: admin.email,
      role: admin.role || "admin",
    };
  }

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

  return user;
}

function getWorkStatusMeta(status = "", hasResult = false) {
  const normalized = String(status || "");
  if (normalized === "completed" || (hasResult && !normalized)) {
    return { label: "مكتمل", className: "status-pill--active" };
  }
  if (normalized === "failed") {
    return { label: "فشل", className: "status-pill--suspended" };
  }
  return { label: "قيد المعالجة", className: "status-pill--pending" };
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
            const statusMeta = getWorkStatusMeta(log.status, Boolean(log.resultUrl || log.outputUrl));
            const statusLabel = statusMeta.label;
            const statusClass = statusMeta.className;
            const promptText = log.prompt || log.promptText || "بدون وصف محفوظ";
            const createdAt = log.createdAt || log.created_at;
            const resultUrl = log.resultUrl || log.outputUrl;

            return `
            <article class="usage-item" data-work-type="${log.type}" data-work-status="${log.status || ""}">
              <div>
                <strong>${escapeHtml(typeLabel)}</strong>
                <p>${escapeHtml(promptText)}</p>
                ${
                  resultUrl
                    ? `
                      <div class="table-actions">
                        <a class="btn btn-ghost btn-sm" href="${escapeHtml(
                          resultUrl
                        )}" target="_blank" rel="noopener">عرض النتيجة</a>
                        <button class="btn btn-outline btn-sm" type="button" data-work-download="${log.id}">
                          تحميل عبر السيرفر
                        </button>
                      </div>
                    `
                    : ""
                }
                ${
                  log.status === "failed"
                    ? `<button class="btn btn-outline btn-sm" type="button" data-work-retry="${log.id}">إعادة المحاولة</button>`
                    : ""
                }
              </div>
              <div class="usage-item__meta">
                <span>${formatDate(createdAt, true)}</span>
                <span class="status-pill ${statusClass}">${statusLabel}</span>
              </div>
            </article>
          `;
          }
        )
        .join("")}
    </div>
  `;

  target.querySelectorAll(".table-actions a").forEach((link) => {
    const wrapper = link.parentElement;
    const id = wrapper?.querySelector("[data-work-download]")?.dataset.workDownload || "";
    const button = document.createElement("button");
    button.type = "button";
    button.className = link.className;
    button.textContent = link.textContent;
    if (id) {
      button.dataset.workDownload = id;
      button.dataset.downloadMode = "open";
    }
    link.replaceWith(button);
  });
}

function getFilenameFromDisposition(value) {
  if (!value) {
    return "";
  }

  const match =
    /filename\*=UTF-8''([^;]+)|filename=\"?([^\";]+)\"?/i.exec(value);
  const filename = match ? match[1] || match[2] : "";
  try {
    return decodeURIComponent(filename);
  } catch (error) {
    return filename;
  }
}

async function initLoginPage() {
  const form = document.querySelector("#loginForm");
  const message = document.querySelector("[data-form-message]");

  if (!form) {
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
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
      setForcedLogout(false);
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
    event.stopImmediatePropagation();
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
      setForcedLogout(false);
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
      if (payload.email) {
        try {
          window.sessionStorage.setItem("advancedpro_reset_email", payload.email);
        } catch (error) {
          // ignore
        }
      }
      window.setTimeout(() => {
        window.location.href = payload.redirectTo || "/reset-password.html";
      }, 900);
    } catch (error) {
      setMessage(message, "الكود الخاص بك خاطئ أو لا يعمل", "error");
    } finally {
      setButtonBusy(button, false);
    }
  });
}

async function initResetPasswordPage() {
  const form = document.querySelector("#resetPasswordForm");
  const message = document.querySelector("[data-form-message]");

  if (!form) {
    return;
  }

  try {
    const savedEmail = window.sessionStorage.getItem("advancedpro_reset_email");
    if (savedEmail && form.email) {
      form.email.value = savedEmail;
    }
  } catch (error) {
    // ignore
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');

    try {
      const values = formToObject(form);

      if (!isValidEmail(values.email)) {
        throw new Error("أدخل بريدًا إلكترونيًا صحيحًا.");
      }

      const passwordError = getPasswordValidationError(values.password);
      if (passwordError) {
        throw new Error(passwordError);
      }

      if (values.password !== values.confirmPassword) {
        throw new Error("تأكيد كلمة المرور غير مطابق.");
      }

      if (!values.code || String(values.code).length < 6) {
        throw new Error("أدخل رمز التحقق المرسل إلى بريدك.");
      }

      setButtonBusy(button, true, "جارٍ التحديث...");
      setMessage(message, "");

      const payload = await requestJson("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({
          email: values.email,
          code: values.code,
          password: values.password,
        }),
      });

      setMessage(message, payload.message, "success");
      showToast(payload.message || "تم تغيير كلمة المرور بنجاح.");
      window.setTimeout(() => {
        window.location.href = payload.redirectTo || "/login";
      }, 1200);
    } catch (error) {
      setMessage(message, error.message, "error");
      showToast(error.message, "error");
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
      const payload = await requestJson("/api/user/code/activate", {
        method: "POST",
        body: JSON.stringify({
          code,
        }),
      });
      if (payload.accessCode || payload.codeInfo) {
        persistAccessCodeSnapshot(payload.accessCode || payload.codeInfo);
      }
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
  const dedicatedCodeGate = Boolean(window.__advancedProDedicatedCodeGate);
  const dedicatedCreateChat = Boolean(window.__advancedProDedicatedCreateChat);
  const summaryTarget = document.querySelector("[data-dashboard-summary]");
  const usageTarget = document.querySelector("[data-dashboard-usage]");
  const welcomeTarget = document.querySelector("[data-dashboard-name]");
  const avatarTarget = document.querySelector("[data-dashboard-avatar]");
  const subscriptionTarget = document.querySelector("[data-dashboard-subscription]");
  const codeStatusTarget = document.querySelector("[data-dashboard-code-status]");
  const planTarget = document.querySelector("[data-dashboard-plan]");
  const activationForm = document.querySelector("#dashboardActivationForm");
  const activationMessage = document.querySelector("[data-dashboard-activate-message]");
  const createMessage = document.querySelector("[data-create-message]");
  const createGate = document.querySelector("[data-create-gate]");
  const createChatStream = document.querySelector("[data-create-chat-stream]");
  const createModeNote = document.querySelector("[data-create-mode-note]");
  const imageForm = document.querySelector("#imageCreateForm");
  const videoForm = document.querySelector("#videoCreateForm");
  const tabButtons = document.querySelectorAll("[data-create-tab]");
  const panels = document.querySelectorAll("[data-create-panel]");
  const filterBar = document.querySelector("[data-work-filters]");
  const createLock = document.querySelector("[data-create-lock]");
  const unlockForm = document.querySelector("#createUnlockForm");
  const unlockMessage = document.querySelector("[data-create-unlock-message]");
  const unlockStatusTarget = document.querySelector("[data-create-unlock-status]");

  let activeTab = "image";
  let cachedSubscription = null;
  let currentWorks = [];
  let pollTimer = null;
  let pollAttempts = 0;
  let createChatBooted = false;
  const MAX_POLL_ATTEMPTS = 15;
  const POLL_INTERVAL_MS = 8000;
  const CREATE_VIDEO_POLL_ATTEMPTS = 12;
  const CREATE_VIDEO_POLL_INTERVAL_MS = 6000;

  const countCreateWords = (value) =>
    String(value || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean).length;

  const resolveCurrentSubscription = () =>
    cachedSubscription || buildSubscriptionFromAccessCode(readAccessCodeSnapshot());

  const triggerCreateCounterRefresh = () => {
    [
      imageForm?.elements?.namedItem("prompt"),
      videoForm?.elements?.namedItem("title"),
      videoForm?.elements?.namedItem("summary"),
      ...Array.from(document.querySelectorAll("[data-video-scenes] textarea")),
    ]
      .filter(Boolean)
      .forEach((field) => field.dispatchEvent(new Event("input", { bubbles: true })));
  };

  const setPanelState = (panel, enabled) => {
    if (!panel) {
      return;
    }
    panel.classList.toggle("create-disabled", !enabled);
    panel.querySelectorAll("input, textarea, select, button").forEach((input) => {
      input.disabled = !enabled;
    });
  };

  const updateGateMessage = () => {
    if (!createGate && !createMessage) {
      return;
    }

    const subscription = resolveCurrentSubscription();
    const now = new Date();
    const expired =
      subscription?.endAt && new Date(subscription.endAt).getTime() < now.getTime();
    const isActive = subscription && subscription.status === "active" && !expired;
    const imageAllowed = isActive && Number(subscription.imageBalance || 0) > 0;
    const videoAllowed = isActive && Number(subscription.videoBalance || 0) > 0;

    let gateText = "";
    if (!isActive) {
      gateText = "فعّل كودك أولًا للبدء في إنشاء الأعمال.";
    } else if (activeTab === "image" && !imageAllowed) {
      gateText = "رصيد الصور انتهى، فعّل كودًا جديدًا أو حدّث باقتك.";
    } else if (activeTab === "video" && !videoAllowed) {
      gateText = "رصيد الفيديو انتهى، فعّل كودًا جديدًا أو حدّث باقتك.";
    }

    if (createGate) {
      if (gateText) {
        createGate.hidden = false;
        createGate.className = "status-message is-error";
        createGate.textContent = gateText;
      } else {
        createGate.hidden = true;
        createGate.textContent = "";
      }
    }

    if (createMessage && gateText) {
      setMessage(createMessage, gateText, "error");
    }

    if (createLock) {
      createLock.hidden = Boolean(isActive);
    }
  };

  const setupTabs = () => {
    if (!tabButtons.length) {
      return;
    }

    tabButtons.forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        const tab = button.dataset.createTab;
        if (!tab) {
          return;
        }
        activeTab = tab;
        tabButtons.forEach((btn) => btn.classList.toggle("is-active", btn === button));
        panels.forEach((panel) => {
          panel.classList.toggle("is-active", panel.dataset.createPanel === tab);
        });
        updateCreateModeNote();
        updateGateMessage();
      });
    });
  };

  const ensureCreateChatIntro = () => {
    if (!createChatStream || createChatBooted) {
      return;
    }

    createChatBooted = true;
    appendCreateChatBubble({
      role: "assistant",
      state: "info",
      label: "المساعد الذكي",
      title: "جاهز للإنشاء",
      body:
        "بدّل بسهولة بين صورة ومقطع. في وضع الصورة يكفي وصف واحد فقط، وفي وضع المقطع سنجهز لك المدة والسيناريوهات داخل نفس الواجهة.",
      meta: ["كل شيء يتم هنا بدون تحديث الصفحة"],
    });
  };

  const updateCreateModeNote = () => {
    if (!createModeNote) {
      return;
    }

    const durationField = videoForm?.elements?.namedItem("durationSeconds");
    const duration = Number(durationField?.value || 60);

    if (activeTab === "video") {
      createModeNote.innerHTML =
        duration === 60
          ? "وضع <strong>المقطع</strong> مفعّل. اكتب وصفًا عامًا ثم أكمل <strong>6 سيناريوهات</strong>، كل سيناريو يمثل 10 ثوانٍ."
          : "وضع <strong>المقطع</strong> مفعّل. اختر المدة ثم اكتب وصفًا عامًا واضحًا وبعدها ابدأ الإنشاء مباشرة.";
      return;
    }

    createModeNote.innerHTML =
      "وضع <strong>الصورة</strong> مفعّل. اكتب وصفًا واضحًا ومباشرًا ثم اضغط <strong>بدء الإنشاء</strong>.";
  };

  const scrollCreateChatToBottom = () => {
    if (!createChatStream) {
      return;
    }

    createChatStream.scrollTo({
      top: createChatStream.scrollHeight,
      behavior: "smooth",
    });
  };

  const renderCreateChatBubble = (
    bubble,
    {
      role = "assistant",
      state = "info",
      label = role === "assistant" ? "المساعد الذكي" : "طلبك",
      title = "",
      body = "",
      meta = [],
      mediaUrl = "",
      mediaType = "",
      actions = [],
      loading = false,
    } = {}
  ) => {
    if (!bubble) {
      return;
    }

    const safeMeta = Array.isArray(meta) ? meta.filter(Boolean) : [meta].filter(Boolean);
    const safeActions = Array.isArray(actions) ? actions.filter(Boolean) : [];

    const mediaMarkup = mediaUrl
      ? mediaType === "video"
        ? `
          <div class="create-chat-bubble__media">
            <video controls preload="metadata" src="${escapeHtml(mediaUrl)}"></video>
          </div>
        `
        : `
          <div class="create-chat-bubble__media">
            <img src="${escapeHtml(mediaUrl)}" alt="${escapeHtml(title || "النتيجة")}" loading="lazy" />
          </div>
        `
      : "";

    const metaMarkup = safeMeta.length
      ? `<div class="create-chat-bubble__meta">${safeMeta
          .map((item) => `<span>${escapeHtml(item)}</span>`)
          .join("")}</div>`
      : "";

    const actionsMarkup = safeActions.length
      ? `<div class="create-chat-bubble__actions">${safeActions
          .map(
            (action) =>
              `<a class="create-chat-link" href="${escapeHtml(action.href || "#")}" ${
                action.external ? 'target="_blank" rel="noopener noreferrer"' : ""
              }>${escapeHtml(action.label || "فتح")}</a>`
          )
          .join("")}</div>`
      : "";

    const loaderMarkup = loading
      ? `
        <div class="chat-loader" aria-hidden="true">
          <span class="chat-loader__dot"></span>
          <span class="chat-loader__dot"></span>
          <span class="chat-loader__dot"></span>
        </div>
      `
      : "";

    const stateLabels = {
      info: "معلومة",
      pending: "بانتظار الإعداد",
      processing: "جارٍ المعالجة",
      success: "تم الإنشاء",
      error: "فشل الإنشاء",
    };

    bubble.className = `create-chat-bubble create-chat-bubble--${role} create-chat-bubble--${state}`;
    bubble.innerHTML = `
      <div class="create-chat-bubble__top">
        <span class="create-chat-bubble__label">${escapeHtml(label)}</span>
        <span class="create-chat-bubble__state">${escapeHtml(stateLabels[state] || stateLabels.info)}</span>
      </div>
      ${title ? `<h3 class="create-chat-bubble__title">${escapeHtml(title)}</h3>` : ""}
      ${body ? `<p class="create-chat-bubble__body">${escapeHtml(body)}</p>` : ""}
      ${loaderMarkup}
      ${metaMarkup}
      ${mediaMarkup}
      ${actionsMarkup}
    `;
  };

  const appendCreateChatBubble = (config = {}) => {
    if (!createChatStream) {
      return null;
    }

    ensureCreateChatIntro();
    const bubble = document.createElement("article");
    renderCreateChatBubble(bubble, config);
    createChatStream.appendChild(bubble);
    scrollCreateChatToBottom();
    return bubble;
  };

  const updateCreateChatBubble = (bubble, config = {}) => {
    renderCreateChatBubble(bubble, config);
    scrollCreateChatToBottom();
  };

  const pollVideoGeneration = async ({ generationId, bubble, promptSummary = "" }) => {
    if (!generationId || !bubble) {
      return;
    }

    for (let attempt = 1; attempt <= CREATE_VIDEO_POLL_ATTEMPTS; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, CREATE_VIDEO_POLL_INTERVAL_MS));

      try {
        const payload = await requestJson(`/api/ai/video/${generationId}`, {
          method: "GET",
        });

        if (payload.resultUrl) {
          await loadDashboard();
          updateCreateChatBubble(bubble, {
            role: "assistant",
            state: "success",
            label: "المساعد الذكي",
            title: "تم إنشاء المقطع",
            body: "المقطع أصبح جاهزًا الآن، وتم تحديث الرصيد وسجل أعمالك مباشرة.",
            meta: [
              promptSummary ? `الوصف: ${promptSummary}` : "",
              `المعرف: #${generationId}`,
              `الرصيد الحالي: ${cachedSubscription?.imageBalance ?? 0} صورة / ${
                cachedSubscription?.videoBalance ?? 0
              } مقطع`,
            ],
            mediaUrl: payload.resultUrl,
            mediaType: "video",
            actions: [
              {
                label: "فتح النتيجة",
                href: payload.resultUrl,
                external: true,
              },
            ],
          });
          return;
        }

        updateCreateChatBubble(bubble, {
          role: "assistant",
          state: "processing",
          label: "المساعد الذكي",
          title: "جارٍ معالجة المقطع",
          body: "نرتب المشاهد ونحسن الإخراج لك الآن. انتظر قليلًا حتى يكتمل الطلب.",
          meta: [`محاولة التحديث ${attempt} من ${CREATE_VIDEO_POLL_ATTEMPTS}`],
          loading: true,
        });
      } catch (error) {
        if (attempt === CREATE_VIDEO_POLL_ATTEMPTS) {
          updateCreateChatBubble(bubble, {
            role: "assistant",
            state: "error",
            label: "المساعد الذكي",
            title: "تعذر تحديث حالة المقطع",
            body: error.message || "لم نتمكن من متابعة حالة المقطع الآن.",
          });
          return;
        }
      }
    }

    updateCreateChatBubble(bubble, {
      role: "assistant",
      state: "processing",
      label: "المساعد الذكي",
      title: "المقطع ما زال تحت المعالجة",
      body: "استلمنا الطلب بالكامل، لكن تجهيز المقطع يحتاج وقتًا أطول قليلًا. ستجده أيضًا في سجل أعمالك عند اكتماله.",
      meta: [`المعرف: #${generationId}`],
      loading: true,
    });
  };

  const buildVideoPrompt = (values) => {
    const title = String(values.title || "").trim();
    const summary = String(values.summary || "").trim();
    const duration = Number(values.durationSeconds || 60);
    const scenes =
      duration === 60
        ? [values.scene1, values.scene2, values.scene3, values.scene4, values.scene5, values.scene6]
            .map((scene) => String(scene || "").trim())
            .filter(Boolean)
        : [];

    const scenesText = scenes
      .map((scene, index) => `المشهد ${index + 1}: ${scene}`)
      .join("\n");

    return {
      duration,
      prompt: `
عنوان: ${title || "فيديو جديد"}
وصف عام: ${summary}
المدة: ${duration} ثانية
${scenesText ? `المشاهد:\n${scenesText}` : ""}
      `.trim(),
      scenes,
    };
  };

  const scheduleWorkPolling = () => {
    const hasPending = currentWorks.some(
      (work) => !work.resultUrl && work.status !== "completed" && work.status !== "failed"
    );

    if (!hasPending) {
      pollAttempts = 0;
      if (pollTimer) {
        window.clearTimeout(pollTimer);
        pollTimer = null;
      }
      return;
    }

    if (pollTimer || pollAttempts >= MAX_POLL_ATTEMPTS) {
      return;
    }

    pollAttempts += 1;
    pollTimer = window.setTimeout(async () => {
      pollTimer = null;
      try {
        await loadDashboard();
      } catch (error) {
        // ignore polling errors
      }
    }, POLL_INTERVAL_MS);
  };

  const loadDashboard = async () => {
    const payload = await requestJson("/api/dashboard", { method: "GET" });
    const dashboard = payload.dashboard;
    const storedAccessCode = readAccessCodeSnapshot();
    const accessCode = dashboard.accessCode || storedAccessCode || null;
    const subscription =
      dashboard.subscription || buildSubscriptionFromAccessCode(accessCode);

    if (dashboard.accessCode) {
      persistAccessCodeSnapshot(dashboard.accessCode);
    } else if (!subscription) {
      persistAccessCodeSnapshot(null);
    }

    if (welcomeTarget) {
      const name = dashboard.user.fullName || "بك";
      welcomeTarget.textContent = `${name} 👋`;
    }

    if (avatarTarget) {
      const fallback = dashboard.user.fullName || dashboard.user.email || "U";
      avatarTarget.textContent = fallback.trim().charAt(0);
    }

    if (subscriptionTarget) {
      if (subscription) {
        const endDate = subscription.endAt ? new Date(subscription.endAt) : null;
        const startDate = subscription.startAt ? new Date(subscription.startAt) : null;
        const daysLeft = endDate
          ? Math.max(Math.ceil((endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)), 0)
          : null;
        const daysLabel = daysLeft !== null ? `${daysLeft} يوم` : "غير محدد";
        const codeLabel = subscription.code ? `الكود: ${subscription.code}` : "بدون كود";

        subscriptionTarget.textContent = `باقتك الحالية: ${subscription.packageName} — ${codeLabel} — المتبقي: ${
          subscription.imageBalance ?? 0
        } صورة / ${subscription.videoBalance ?? 0} فيديو — يبدأ: ${formatDate(
          startDate
        )} — ينتهي بعد: ${daysLabel}`;
      } else {
        subscriptionTarget.textContent = "لا توجد باقة مفعلة حتى الآن. فعّل كودك للبدء.";
      }
    }

    if (summaryTarget) {
      const stats = dashboard.stats || {
        totalWorks:
          Number(dashboard.usageTotals.imagesUsed || 0) +
          Number(dashboard.usageTotals.videosUsed || 0),
        totalImages: Number(dashboard.usageTotals.imagesUsed || 0),
        totalVideos: Number(dashboard.usageTotals.videosUsed || 0),
        newWorks: 0,
      };

      summaryTarget.innerHTML = `
        <article class="info-card">
          <span>إجمالي الأعمال</span>
          <strong>${escapeHtml(stats.totalWorks ?? 0)}</strong>
          <small>الأعمال الجديدة هذا الأسبوع: ${escapeHtml(stats.newWorks ?? 0)}</small>
        </article>
        <article class="info-card">
          <span>الصور المنشأة</span>
          <strong>${escapeHtml(subscription?.imageBalance ?? 0)}</strong>
          <small>المتبقي الآن: ${escapeHtml(subscription?.imageBalance ?? 0)}</small>
        </article>
        <article class="info-card">
          <span>الفيديوهات المنشأة</span>
          <strong>${escapeHtml(subscription?.videoBalance ?? 0)}</strong>
          <small>المتبقي الآن: ${escapeHtml(subscription?.videoBalance ?? 0)}</small>
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

    if (planTarget && subscription) {
      const extraStack = document.createElement("div");
      extraStack.className = "info-stack";
      extraStack.innerHTML = `
        <div><span>حالة الكود</span><strong>${escapeHtml(accessCode?.statusLabel || subscription.status || "نشط")}</strong></div>
        <div><span>الاستخدام الحالي</span><strong>${escapeHtml(subscription.imageUsed ?? 0)} صورة / ${escapeHtml(subscription.videoUsed ?? 0)} فيديو</strong></div>
        <div><span>هل الكود متجدد</span><strong>${subscription.isRenewable ? "نعم" : "لا"}${subscription.renewalLabel ? ` - ${escapeHtml(subscription.renewalLabel)}` : ""}</strong></div>
        <div><span>البريد المرتبط</span><strong>${escapeHtml(subscription.email || "غير مرتبط")}</strong></div>
        <div><span>نوع الوصول</span><strong>${escapeHtml(subscription.accessTypeLabel || "عام")}</strong></div>
      `;
      planTarget.appendChild(extraStack);
    }

    renderAccessCodeStatus(codeStatusTarget, accessCode, subscription);
    renderAccessCodeStatus(unlockStatusTarget, accessCode, subscription);

    const recentWorks = dashboard.recentWorks || dashboard.recentUsage || [];
    currentWorks = recentWorks;
    renderUsageList(usageTarget, recentWorks);

    cachedSubscription = subscription;
    const now = new Date();
    const expired =
      subscription?.endAt && new Date(subscription.endAt).getTime() < now.getTime();
    const isActive = subscription && subscription.status === "active" && !expired;
    const imageAllowed = isActive && Number(subscription?.imageBalance || 0) > 0;
    const videoAllowed = isActive && Number(subscription?.videoBalance || 0) > 0;

    const imagePanel = document.querySelector('[data-create-panel="image"]');
    const videoPanel = document.querySelector('[data-create-panel="video"]');

    if (!dedicatedCreateChat) {
      setPanelState(imagePanel, imageAllowed);
      setPanelState(videoPanel, videoAllowed);
      updateCreateModeNote();
      updateGateMessage();
    }
    scheduleWorkPolling();
  };

  const syncCreateExperienceFromState = () => {
    const subscription = resolveCurrentSubscription();
    const now = new Date();
    const expired =
      subscription?.endAt && new Date(subscription.endAt).getTime() < now.getTime();
    const isActive = subscription && subscription.status === "active" && !expired;
    const imageAllowed = isActive && Number(subscription?.imageBalance || 0) > 0;
    const videoAllowed = isActive && Number(subscription?.videoBalance || 0) > 0;
    const imagePanel = document.querySelector('[data-create-panel="image"]');
    const videoPanel = document.querySelector('[data-create-panel="video"]');

    if (!dedicatedCreateChat) {
      setPanelState(imagePanel, imageAllowed);
      setPanelState(videoPanel, videoAllowed);
      updateCreateModeNote();
      updateGateMessage();
      triggerCreateCounterRefresh();
    }
  };

  const handleCodeActivationSubmit = async ({
    event,
    form,
    messageTarget,
    successTarget = null,
  }) => {
    event.preventDefault();
    event.stopImmediatePropagation();

    const button = form.querySelector('button[type="submit"]');

    try {
      const values = formToObject(form);
      const code = String(values.code || "").trim();

      if (!code) {
        throw new Error("أدخل كود التفعيل أولًا.");
      }

      setButtonBusy(button, true, "جاري التفعيل...");
      setMessage(messageTarget, "");

      const payload = await requestJson("/api/user/code/activate", {
        method: "POST",
        body: JSON.stringify({ code }),
      });

      const activatedCode = payload.accessCode || payload.codeInfo || null;
      if (activatedCode) {
        persistAccessCodeSnapshot(activatedCode);
        cachedSubscription = buildSubscriptionFromAccessCode(activatedCode);
        renderAccessCodeStatus(codeStatusTarget, activatedCode, cachedSubscription);
        renderAccessCodeStatus(unlockStatusTarget, activatedCode, cachedSubscription);
      }

      const statusLabel = activatedCode?.statusLabel || "صالح";
      setMessage(messageTarget, `تم الإدخال بنجاح - الحالة: ${statusLabel}`, "success");
      form.reset();

      try {
        await loadDashboard();
      } catch (dashboardError) {
        if (cachedSubscription) {
          const imagePanel = document.querySelector('[data-create-panel="image"]');
          const videoPanel = document.querySelector('[data-create-panel="video"]');
          setPanelState(imagePanel, Number(cachedSubscription.imageBalance || 0) > 0);
          setPanelState(videoPanel, Number(cachedSubscription.videoBalance || 0) > 0);
          updateGateMessage();
        }
      }

      if (successTarget && cachedSubscription) {
        setMessage(
          successTarget,
          `تم التحقق من الكود بنجاح. رصيدك: ${cachedSubscription.imageBalance ?? 0} صورة / ${
            cachedSubscription.videoBalance ?? 0
          } فيديو`,
          "success"
        );
      }

      showToast(payload.message || "تم تفعيل الكود بنجاح");
    } catch (error) {
      setMessage(messageTarget, error.message, "error");
      if (successTarget) {
        setMessage(successTarget, "", "info");
      }
    } finally {
      setButtonBusy(button, false);
    }
  };

  if (!dedicatedCodeGate && activationForm && activationForm.dataset.bound !== "true") {
    activationForm.dataset.bound = "true";
    activationForm.addEventListener("submit", async (event) => {
      await handleCodeActivationSubmit({
        event,
        form: activationForm,
        messageTarget: activationMessage,
      });
    });
  }

  if (!dedicatedCodeGate && unlockForm && unlockForm.dataset.bound !== "true") {
    unlockForm.dataset.bound = "true";
    unlockForm.addEventListener("submit", async (event) => {
      await handleCodeActivationSubmit({
        event,
        form: unlockForm,
        messageTarget: unlockMessage,
        successTarget: createMessage,
      });
    });
  }

  renderAccessCodeStatus(codeStatusTarget, readAccessCodeSnapshot(), cachedSubscription);
  renderAccessCodeStatus(unlockStatusTarget, readAccessCodeSnapshot(), cachedSubscription);

  document.addEventListener("advancedpro:access-code-state", (event) => {
    const accessCode = event.detail?.state || null;
    cachedSubscription = buildSubscriptionFromAccessCode(accessCode);
    if (!dedicatedCreateChat) {
      syncCreateExperienceFromState();
    }
  });

  document.addEventListener("advancedpro:request-dashboard-refresh", () => {
    loadDashboard().catch(() => {
      // ignore ad-hoc refresh failures
    });
  });

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

  if (!dedicatedCodeGate && activationForm && activationForm.dataset.bound !== "true") {
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
        const payload = await requestJson("/api/user/code/activate", {
          method: "POST",
          body: JSON.stringify({ code }),
        });
        setMessage(activationMessage, payload.message, "success");
        activationForm.reset();
        await loadDashboard();
        showToast(payload.message || "تم تفعيل الكود بنجاح");
      } catch (error) {
        setMessage(activationMessage, error.message, "error");
      } finally {
        setButtonBusy(button, false);
      }
    });
  }

  if (!dedicatedCodeGate && unlockForm && unlockForm.dataset.bound !== "true") {
    unlockForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = unlockForm.querySelector('button[type="submit"]');

      try {
        const values = formToObject(unlockForm);
        const code = String(values.code || "").trim();
        if (!code) {
          throw new Error("أدخل كود التفعيل أولًا.");
        }

        setButtonBusy(button, true, "جارٍ التفعيل...");
        setMessage(unlockMessage, "");
        const payload = await requestJson("/api/user/code/activate", {
          method: "POST",
          body: JSON.stringify({ code }),
        });
        setMessage(unlockMessage, payload.message, "success");
        unlockForm.reset();
        await loadDashboard();
        if (cachedSubscription) {
          setMessage(
            createMessage,
            `تم التفعيل بنجاح. رصيدك الحالي: ${cachedSubscription.imageBalance ?? 0} صورة / ${
              cachedSubscription.videoBalance ?? 0
            } فيديو`,
            "success"
          );
        }
      } catch (error) {
        setMessage(unlockMessage, error.message, "error");
      } finally {
        setButtonBusy(button, false);
      }
    });
  }

  if (filterBar) {
    filterBar.addEventListener("click", (event) => {
      const button = event.target.closest("[data-work-filter]");
      if (!button) {
        return;
      }
      const filter = button.dataset.workFilter || "all";
      filterBar.querySelectorAll("button").forEach((btn) => {
        btn.classList.toggle("is-active", btn === button);
      });

      const items = usageTarget?.querySelectorAll(".usage-item");
      items?.forEach((item) => {
        const type = item.dataset.workType;
        item.classList.toggle(
          "is-hidden",
          filter !== "all" && type && type !== filter
        );
      });
    });
  }

  if (usageTarget) {
    usageTarget.addEventListener("click", async (event) => {
      const retryButton = event.target.closest("[data-work-retry]");
      const downloadButton = event.target.closest("[data-work-download]");

      if (downloadButton) {
        const id = Number(downloadButton.dataset.workDownload);
        const mode = downloadButton.dataset.downloadMode || "file";
        const record = currentWorks.find((item) => item.id === id);
        if (!record || !record.resultUrl) {
          setMessage(createMessage, "لا يوجد ملف جاهز للتحميل.", "error");
          return;
        }

        try {
          setButtonBusy(downloadButton, true, "جارٍ التحميل...");
          setMessage(createMessage, "");

          const token = getStoredToken();
          const response = await fetch(`${appConfig.apiBaseUrl}/api/download/${id}`, {
            method: "GET",
            headers: {
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
          });

          if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            throw new Error(payload.message || "تعذر تنزيل الملف.");
          }

          const blob = await response.blob();
          const disposition = response.headers.get("content-disposition");
          const filename =
            getFilenameFromDisposition(disposition) ||
            `advancedpro-${record.type}-${id}`;
          const blobUrl = window.URL.createObjectURL(blob);

          if (mode === "open") {
            const preview = window.open(blobUrl, "_blank", "noopener,noreferrer");
            if (!preview) {
              throw new Error("تعذر فتح المعاينة. فعّل النوافذ المنبثقة ثم أعد المحاولة.");
            }
            window.setTimeout(() => {
              window.URL.revokeObjectURL(blobUrl);
            }, 2000);
          } else {
            const link = document.createElement("a");
            link.href = blobUrl;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.setTimeout(() => {
              window.URL.revokeObjectURL(blobUrl);
            }, 1000);
          }
        } catch (error) {
          setMessage(createMessage, error.message, "error");
        } finally {
          setButtonBusy(downloadButton, false);
        }

        return;
      }
      if (!retryButton) {
        return;
      }

      const id = Number(retryButton.dataset.workRetry);
      const record = currentWorks.find((item) => item.id === id);
      if (!record) {
        return;
      }

      try {
        setButtonBusy(retryButton, true, "جارٍ الإعادة...");
        setMessage(createMessage, "");

        const promptText = record.prompt || record.promptText || "";
        if (!promptText) {
          throw new Error("لا يوجد وصف محفوظ لإعادة المحاولة.");
        }

        if (record.type === "image") {
          await requestJson("/api/ai/image", {
            method: "POST",
            body: JSON.stringify({ prompt: promptText }),
          });
        } else {
          await requestJson("/api/ai/video", {
            method: "POST",
            body: JSON.stringify({
              prompt: promptText,
              durationSeconds: cachedSubscription?.videoMaxDurationSeconds || 60,
            }),
          });
        }

        showToast("تمت إعادة الإرسال بنجاح.");
        await loadDashboard();
      } catch (error) {
        setMessage(createMessage, error.message, "error");
      } finally {
        setButtonBusy(retryButton, false);
      }
    });
  }

  if (!dedicatedCreateChat) {
    setupTabs();
    ensureCreateChatIntro();
    updateCreateModeNote();
  }

  if (!dedicatedCreateChat && imageForm) {
    imageForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = imageForm.querySelector('button[type="submit"]');
      let progressBubble = null;
      let processingTimer = null;

      try {
        if (!cachedSubscription) {
          cachedSubscription = resolveCurrentSubscription();
        }

        if (!cachedSubscription) {
          throw new Error("فعّل كودك أولًا للبدء في الإنشاء.");
        }

        const values = formToObject(imageForm);
        const prompt = String(values.prompt || "").trim();
        if (!prompt) {
          throw new Error("أدخل وصفًا واضحًا للصورة قبل الإرسال.");
        }

        appendCreateChatBubble({
          role: "user",
          state: "info",
          label: "أنت",
          title: "طلب صورة",
          body: prompt,
          meta: [`${countCreateWords(prompt)} كلمة`],
        });

        setButtonBusy(button, true, "جارٍ الإنشاء...");
        setMessage(createMessage, "");
        progressBubble = appendCreateChatBubble({
          role: "assistant",
          state: "pending",
          label: "المساعد الذكي",
          title: "بانتظار الإعداد",
          body: "انتظر 10 ثوانٍ لنجهز لك أفضل نتيجة ✨",
          loading: true,
        });
        processingTimer = window.setTimeout(() => {
          updateCreateChatBubble(progressBubble, {
            role: "assistant",
            state: "processing",
            label: "المساعد الذكي",
            title: "جارٍ معالجة الصورة",
            body: "جارٍ إعداد طلبك وتحسين النتيجة لك، انتظر قليلًا...",
            loading: true,
          });
        }, 700);

        const payload = await requestJson("/api/ai/image", {
          method: "POST",
          body: JSON.stringify({ prompt }),
        });

        if (processingTimer) {
          window.clearTimeout(processingTimer);
        }
        setMessage(createMessage, payload.message || "تم إنشاء الصورة.", "success");
        showToast(payload.message || "تم إنشاء الصورة.");
        imageForm.reset();
        triggerCreateCounterRefresh();
        await loadDashboard();
        updateCreateChatBubble(progressBubble, {
          role: "assistant",
          state: "success",
          label: "المساعد الذكي",
          title: "تم إنشاء الصورة",
          body: "الصورة أصبحت جاهزة، وتم تحديث الرصيد وسجل أعمالك مباشرة.",
          meta: [
            payload.generationId ? `المعرف: #${payload.generationId}` : "",
            `الرصيد الحالي: ${cachedSubscription?.imageBalance ?? 0} صورة / ${
              cachedSubscription?.videoBalance ?? 0
            } مقطع`,
          ],
          mediaUrl: payload.resultUrl || "",
          mediaType: "image",
          actions: payload.resultUrl
            ? [
                {
                  label: "فتح الصورة",
                  href: payload.resultUrl,
                  external: true,
                },
              ]
            : [],
        });
      } catch (error) {
        if (processingTimer) {
          window.clearTimeout(processingTimer);
        }
        if (progressBubble) {
          updateCreateChatBubble(progressBubble, {
            role: "assistant",
            state: "error",
            label: "المساعد الذكي",
            title: "فشل إنشاء الصورة",
            body: error.message,
          });
        }
        setMessage(createMessage, error.message, "error");
      } finally {
        setButtonBusy(button, false);
      }
    });
  }

  if (!dedicatedCreateChat && videoForm) {
    const durationField = videoForm.elements.namedItem("durationSeconds");
    const scenesWrapper =
      document.querySelector("[data-video-scenes-wrap]") ||
      document.querySelector("[data-video-scenes]");
    const toggleScenes = () => {
      if (!scenesWrapper) {
        return;
      }
      const duration = Number(durationField?.value || 60);
      scenesWrapper.style.display = duration === 60 ? "grid" : "none";
      updateCreateModeNote();
    };

    if (durationField) {
      durationField.addEventListener("change", toggleScenes);
      toggleScenes();
    }

    videoForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = videoForm.querySelector('button[type="submit"]');
      let progressBubble = null;
      let processingTimer = null;

      try {
        if (!cachedSubscription) {
          cachedSubscription = resolveCurrentSubscription();
        }

        if (!cachedSubscription) {
          throw new Error("فعّل كودك أولًا للبدء في الإنشاء.");
        }

        const values = formToObject(videoForm);
        const summary = String(values.summary || "").trim();
        if (!summary) {
          throw new Error("أدخل وصفًا عامًا للفيديو قبل الإرسال.");
        }

        const { prompt, duration, scenes } = buildVideoPrompt(values);
        if (Number(duration) === 60 && scenes.length < 6) {
          throw new Error("الرجاء تعبئة جميع المشاهد الستة للفيديو 60 ثانية.");
        }

        appendCreateChatBubble({
          role: "user",
          state: "info",
          label: "أنت",
          title: "طلب مقطع",
          body: summary,
          meta: [
            `المدة: ${duration} ثانية`,
            `${countCreateWords(`${values.title || ""} ${summary} ${scenes.join(" ")}`)} كلمة`,
            Number(duration) === 60 ? `${scenes.length} / 6 سيناريوهات` : "مقطع قصير",
          ],
        });

        setButtonBusy(button, true, "جارٍ الإنشاء...");
        setMessage(createMessage, "");
        progressBubble = appendCreateChatBubble({
          role: "assistant",
          state: "pending",
          label: "المساعد الذكي",
          title: "بانتظار الإعداد",
          body: "استلمنا تفاصيل المقطع. نرتب السيناريو والمشاهد لك الآن...",
          loading: true,
        });
        processingTimer = window.setTimeout(() => {
          updateCreateChatBubble(progressBubble, {
            role: "assistant",
            state: "processing",
            label: "المساعد الذكي",
            title: "جارٍ معالجة المقطع",
            body: "المقطع يحتاج وقتًا أطول قليلًا. نراجع المشاهد ونبدأ الإخراج الآن...",
            loading: true,
          });
        }, 700);

        const payload = await requestJson("/api/ai/video", {
          method: "POST",
          body: JSON.stringify({
            prompt,
            durationSeconds: duration,
          }),
        });

        if (processingTimer) {
          window.clearTimeout(processingTimer);
        }
        setMessage(
          createMessage,
          payload.message || "تم إرسال المقطع للمعالجة.",
          "success"
        );
        showToast(payload.message || "جاري تجهيز المقطع.");
        videoForm.reset();
        triggerCreateCounterRefresh();
        await loadDashboard();
        updateCreateChatBubble(progressBubble, {
          role: "assistant",
          state: payload.status === "completed" ? "success" : "processing",
          label: "المساعد الذكي",
          title: payload.status === "completed" ? "تم إنشاء المقطع" : "جارٍ معالجة المقطع",
          body:
            payload.status === "completed"
              ? "المقطع أصبح جاهزًا وتم تحديث الرصيد وسجل أعمالك."
              : "تم استلام طلبك بنجاح. المقطع الآن قيد المعالجة، وسأتابع حالته لك هنا.",
          meta: [
            payload.generationId ? `المعرف: #${payload.generationId}` : "",
            `الرصيد الحالي: ${cachedSubscription?.imageBalance ?? 0} صورة / ${
              cachedSubscription?.videoBalance ?? 0
            } مقطع`,
          ],
          loading: payload.status !== "completed",
        });
        if (payload.generationId && payload.status !== "completed") {
          pollVideoGeneration({
            generationId: payload.generationId,
            bubble: progressBubble,
            promptSummary: summary,
          }).catch(() => {
            // ignore polling errors here
          });
        }
      } catch (error) {
        if (processingTimer) {
          window.clearTimeout(processingTimer);
        }
        if (progressBubble) {
          updateCreateChatBubble(progressBubble, {
            role: "assistant",
            state: "error",
            label: "المساعد الذكي",
            title: "فشل إنشاء المقطع",
            body: error.message,
          });
        }
        setMessage(createMessage, error.message, "error");
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

function getActivationCodeStatus(code) {
  if (!code?.isActive) {
    return { key: "disabled", label: "معطل" };
  }
  if (code?.isUsed) {
    return { key: "used", label: "مستخدم" };
  }
  return { key: "available", label: "متاح" };
}

function renderCodesTable(target, codes) {
  target.innerHTML = `
    <div class="table-shell">
      <table class="data-table">
        <thead>
          <tr>
            <th>الكود</th>
            <th>الرصيد</th>
            <th>الحالة</th>
            <th>الاستخدام</th>
            <th>تاريخ الإنشاء</th>
            <th>الإجراء</th>
          </tr>
        </thead>
        <tbody>
          ${codes
            .map((code) => {
              const status = getActivationCodeStatus(code);
              return `
                <tr>
                  <td><strong>${escapeHtml(code.code)}</strong></td>
                  <td>${Number(code.balance || 0)}</td>
                  <td>
                    <span class="status-pill status-pill--${status.key}">
                      ${status.label}
                    </span>
                  </td>
                  <td>${code.isUsed ? "مستخدم" : "غير مستخدم"}</td>
                  <td>${code.createdAt ? formatDate(code.createdAt, true) : "—"}</td>
                  <td>
                    <div class="table-actions">
                      <button class="btn btn-ghost btn-sm" type="button" data-activation-code-copy="${code.id}">نسخ</button>
                    </div>
                  </td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

async function initAdminCreatePage() {
  const form = document.querySelector("#adminCreateForm");
  const message = document.querySelector("[data-admin-create-message]");
  const resetButton = document.querySelector("[data-admin-reset]");
  const autoToggle = form?.elements.namedItem("autoPassword");
  const passwordFields = document.querySelectorAll(".password-field");

  const togglePasswordFields = () => {
    const useAuto = autoToggle?.checked !== false;
    passwordFields.forEach((field) => {
      field.hidden = useAuto;
    });
  };

  if (autoToggle) {
    autoToggle.addEventListener("change", togglePasswordFields);
    togglePasswordFields();
  }

  resetButton?.addEventListener("click", () => {
    form?.reset();
    togglePasswordFields();
    setMessage(message, "");
  });

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

      if (!autoToggle?.checked) {
        const passwordError = getPasswordValidationError(values.password);
        if (passwordError) {
          throw new Error(passwordError);
        }
        if (values.password !== values.confirmPassword) {
          throw new Error("تأكيد كلمة المرور غير مطابق.");
        }
      }

      setButtonBusy(button, true, "جارٍ الإنشاء...");
      setMessage(message, "");

      const payload = await requestJson("/api/admin/admins", {
        method: "POST",
        body: JSON.stringify({
          fullName: values.fullName,
          email: values.email,
          password: autoToggle?.checked ? undefined : values.password,
        }),
      });

      const passwordNote = payload.credentials?.password
        ? `كلمة المرور: ${payload.credentials.password}`
        : "تم استخدام كلمة المرور التي أدخلتها.";

      setMessage(
        message,
        `تم إنشاء الأدمن بنجاح. البريد: ${payload.user?.email}. ${passwordNote}`,
        "success"
      );
      form.reset();
      togglePasswordFields();
    } catch (error) {
      setMessage(message, error.message, "error");
    } finally {
      setButtonBusy(button, false);
    }
  });
}

function fillActivationCodeForm(form, record) {
  if (!form) {
    return;
  }

  const codeField = form.elements.namedItem("code");
  if (codeField) {
    codeField.value = record?.code || "";
  }

  const balanceField = form.elements.namedItem("balance");
  if (balanceField) {
    balanceField.value = record?.balance ?? 0;
  }

  const isActiveField = form.elements.namedItem("isActive");
  if (isActiveField) {
    isActiveField.checked = record ? Boolean(record.isActive) : true;
  }
}

const fillCodeForm = fillActivationCodeForm;

async function initAdminAvailableCodesPage() {
  const searchForm = document.querySelector("#adminAvailableCodesSearch");
  const target = document.querySelector("[data-admin-available-codes]");
  const message = document.querySelector("[data-admin-available-codes-message]");

  if (!target) {
    return;
  }

  const loadCodes = async (search = "", statusFilter = "available") => {
    const payload = await requestJson(
      `/api/admin/codes/list?search=${encodeURIComponent(search)}`,
      { method: "GET" }
    );
    let records = payload.codes || [];
    if (statusFilter && statusFilter !== "all") {
      records = records.filter((code) => getActivationCodeStatus(code).key === statusFilter);
    }
    state.codeRecords = records;
    renderCodesTable(target, records);
  };

  try {
    await loadCodes("", "available");
  } catch (error) {
    setMessage(message, error.message, "error");
  }

  searchForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const searchField = searchForm.elements.namedItem("search");
    const statusField = searchForm.elements.namedItem("status");
    try {
      await loadCodes(
        searchField ? searchField.value : "",
        statusField ? statusField.value : "available"
      );
    } catch (error) {
      setMessage(message, error.message, "error");
    }
  });

  target?.addEventListener("click", async (event) => {
    const copyButton = event.target.closest("[data-activation-code-copy]");
    if (!copyButton) {
      return;
    }
    const record = state.codeRecords.find(
      (item) => item.id === Number(copyButton.dataset.activationCodeCopy)
    );
    if (record?.code) {
      navigator.clipboard?.writeText(record.code);
      setMessage(message, "تم نسخ الكود.", "success");
    }
  });
}

async function initAdminCodesPage() {
  const form = document.querySelector("#adminCodeForm");
  const searchForm = document.querySelector("#adminCodesSearch");
  const target = document.querySelector("[data-admin-codes]");
  const message = document.querySelector("[data-admin-codes-message]");

  const loadCodes = async (search = "", statusFilter = "all") => {
    const payload = await requestJson(
      `/api/admin/codes/list?search=${encodeURIComponent(search)}`,
      { method: "GET" }
    );
    let records = payload.codes || [];
    if (statusFilter && statusFilter !== "all") {
      records = records.filter((code) => getActivationCodeStatus(code).key === statusFilter);
    }
    state.codeRecords = records;
    renderCodesTable(target, state.codeRecords);
  };

  await loadCodes();
  fillActivationCodeForm(form, null);

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    const values = formToObject(form);

    try {
      setButtonBusy(button, true, values.id ? "جاري التحديث..." : "جاري الإنشاء...");
      const payload = await requestJson("/api/admin/codes", {
        method: values.id ? "PATCH" : "POST",
        body: JSON.stringify(values),
      });
      setMessage(message, values.id ? "تم تحديث الكود." : "تم إنشاء الكود.", "success");
      fillCodeForm(form, null);
      const searchField = searchForm?.elements.namedItem("search");
      const statusField = searchForm?.elements.namedItem("status");
      if (!values.id && searchField && statusField) {
        searchField.value = "";
        statusField.value = "all";
      }

      try {
        await loadCodes(
          searchField ? searchField.value : "",
          statusField ? statusField.value : "all"
        );
      } catch (loadError) {
        if (payload?.code && target) {
          state.codeRecords = [payload.code, ...state.codeRecords];
          renderCodesTable(target, state.codeRecords);
        } else {
          throw loadError;
        }
      }
    } catch (error) {
      setMessage(message, error.message, "error");
    } finally {
      setButtonBusy(button, false);
    }
  });

  searchForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const searchField = searchForm.elements.namedItem("search");
    const statusField = searchForm.elements.namedItem("status");
    await loadCodes(
      searchField ? searchField.value : "",
      statusField ? statusField.value : "all"
    );
  });

  document.querySelector("[data-code-reset]")?.addEventListener("click", () => {
    if (form) {
      fillCodeForm(form, null);
    }
    setMessage(message, "");
  });

  target?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-code-edit]");

    if (!button) {
      const copyButton = event.target.closest("[data-code-copy]");
      if (copyButton) {
        const record = state.codeRecords.find(
          (item) => item.id === Number(copyButton.dataset.codeCopy)
        );
        if (record?.code) {
          navigator.clipboard?.writeText(record.code);
          setMessage(message, "تم نسخ الكود.", "success");
        }
        return;
      }

      const toggleButton = event.target.closest("[data-code-toggle]");
      if (toggleButton) {
        const record = state.codeRecords.find(
          (item) => item.id === Number(toggleButton.dataset.codeToggle)
        );
        if (!record) {
          return;
        }
        try {
          setButtonBusy(toggleButton, true, "جارٍ...");
          await requestJson("/api/admin/codes", {
            method: "PATCH",
            body: JSON.stringify({
              id: record.id,
              code: record.code,
              planName: record.planName,
              imageQuota: record.imageQuota,
              videoQuota: record.videoQuota,
              videoMaxDurationSeconds: record.videoMaxDurationSeconds,
              validityDays: record.validityDays,
              renewalEnabled: record.renewalEnabled,
              renewalEveryDays: record.renewalEveryDays,
              renewalMode: record.renewalMode,
              renewalImageQuota: record.renewalImageQuota,
              renewalVideoQuota: record.renewalVideoQuota,
              maxRedemptions: record.maxRedemptions,
              assignedEmail: record.assignedEmail,
              isActive: !record.isActive,
            }),
          });
          setMessage(message, "تم تحديث حالة الكود.", "success");
          const searchField = searchForm?.elements.namedItem("search");
          const statusField = searchForm?.elements.namedItem("status");
          await loadCodes(
            searchField ? searchField.value : "",
            statusField ? statusField.value : "all"
          );
        } catch (error) {
          setMessage(message, error.message, "error");
        } finally {
          setButtonBusy(toggleButton, false);
        }
        return;
      }

      const deleteButton = event.target.closest("[data-code-delete]");
      if (deleteButton) {
        const record = state.codeRecords.find(
          (item) => item.id === Number(deleteButton.dataset.codeDelete)
        );
        if (!record) {
          return;
        }
        if (!window.confirm("هل تريد حذف هذا الكود نهائيًا؟")) {
          return;
        }
        try {
          setButtonBusy(deleteButton, true, "جارٍ...");
          await requestJson(`/api/admin/codes/${record.id}`, {
            method: "DELETE",
          });
          setMessage(message, "تم حذف الكود.", "success");
          const searchField = searchForm?.elements.namedItem("search");
          const statusField = searchForm?.elements.namedItem("status");
          await loadCodes(
            searchField ? searchField.value : "",
            statusField ? statusField.value : "all"
          );
        } catch (error) {
          setMessage(message, error.message, "error");
        } finally {
          setButtonBusy(deleteButton, false);
        }
        return;
      }

      return;
    }

    const record = state.codeRecords.find((item) => item.id === Number(button.dataset.codeEdit));

    if (record) {
      fillCodeForm(form, record);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  });
}

async function initAdminCodesPageV2() {
  const form = document.querySelector("#adminCodeForm");
  const searchForm = document.querySelector("#adminCodesSearch");
  const target = document.querySelector("[data-admin-codes]");
  const message = document.querySelector("[data-admin-codes-message]");

  if (!form || !target) {
    return;
  }

  const loadCodes = async (search = "", statusFilter = "all") => {
    const payload = await requestJson(
      `/api/admin/codes/list?search=${encodeURIComponent(search)}`,
      { method: "GET" }
    );
    let records = payload.codes || [];
    if (statusFilter && statusFilter !== "all") {
      records = records.filter((code) => getActivationCodeStatus(code).key === statusFilter);
    }
    state.codeRecords = records;
    renderCodesTable(target, state.codeRecords);
  };

  fillActivationCodeForm(form, null);

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');

    try {
      const values = formToObject(form);
      setButtonBusy(button, true, "جارٍ الحفظ...");
      const payload = await requestJson("/api/admin/codes/create", {
        method: "POST",
        body: JSON.stringify({
          code: values.code?.trim(),
          balance: Number(values.balance),
          isActive: values.isActive !== undefined ? Boolean(values.isActive) : true,
        }),
      });
      setMessage(message, payload.message || "تم حفظ الكود بنجاح.", "success");
      const searchField = searchForm?.elements.namedItem("search");
      const statusField = searchForm?.elements.namedItem("status");
      if (payload.code) {
        state.codeRecords = [
          payload.code,
          ...state.codeRecords.filter((item) => item.id !== payload.code.id),
        ];
        renderCodesTable(target, state.codeRecords);
      }
      if (searchField && statusField) {
        searchField.value = "";
        statusField.value = "all";
      }
      try {
        await loadCodes(
          searchField ? searchField.value : "",
          statusField ? statusField.value : "all"
        );
      } catch (loadError) {
        console.error("Reload codes after create failed:", loadError);
      }
      fillActivationCodeForm(form, null);
    } catch (error) {
      setMessage(message, error.message, "error");
    } finally {
      setButtonBusy(button, false);
    }
  });

  searchForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const searchField = searchForm.elements.namedItem("search");
    const statusField = searchForm.elements.namedItem("status");
    try {
      await loadCodes(
        searchField ? searchField.value : "",
        statusField ? statusField.value : "all"
      );
      setMessage(message, "");
    } catch (error) {
      setMessage(message, error.message, "error");
    }
  });

  document.querySelector("[data-code-reset]")?.addEventListener("click", () => {
    fillActivationCodeForm(form, null);
    setMessage(message, "");
  });

  target?.addEventListener("click", (event) => {
    const copyButton = event.target.closest("[data-activation-code-copy]");
    if (!copyButton) {
      return;
    }
    const record = state.codeRecords.find(
      (item) => item.id === Number(copyButton.dataset.activationCodeCopy)
    );
    if (record?.code) {
      navigator.clipboard?.writeText(record.code);
      setMessage(message, "تم نسخ الكود.", "success");
    }
  });

  try {
    await loadCodes();
    setMessage(message, "");
  } catch (error) {
    setMessage(
      message,
      error.message || "تعذر تحميل قائمة الأكواد، لكن يمكنك محاولة حفظ كود جديد.",
      "error"
    );
  }
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
    case "reset-password":
      return initResetPasswordPage();
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
      return null;
    case "admin-available-codes":
      return null;
    case "admin-create":
      return initAdminCreatePage();
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

  if (
    document.body.dataset.requiresAdmin === "true" &&
    (!user || !["admin", "owner"].includes(user.role))
  ) {
    return;
  }

  await initPage(user);
});
