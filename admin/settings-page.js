(function () {
  const API_BASE_URL = window.AdvancedProConfig?.apiBaseUrl || "";
  const $ = (selector) => document.querySelector(selector);

  let activeTab = "general";
  let publicSettings = {};
  let currentAdmin = null;

  const tabs = [
    { id: "general", label: "عام", icon: "⚙" },
    { id: "profile", label: "الملف الشخصي", icon: "♙" },
    { id: "company", label: "الشركة", icon: "▦" },
    { id: "keys", label: "المفاتيح", icon: "⚿" },
    { id: "notifications", label: "الإشعارات", icon: "◌" },
    { id: "security", label: "الأمان", icon: "🛡" },
    { id: "backup", label: "النسخ الاحتياطي", icon: "☁" },
    { id: "api", label: "API", icon: "</>" },
  ];

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function loginPath() {
    const configured = String(window.AdvancedProConfig?.adminSecretPath || "advanced-pro-control").replace(/^\/+|\/+$/g, "");
    return `/${configured || "advanced-pro-control"}`;
  }

  async function requestJson(path, options = {}) {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      credentials: "include",
      ...options,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || "تعذر تنفيذ الطلب.");
    return payload;
  }

  async function logout() {
    try {
      await requestJson("/api/admin/logout", { method: "POST" });
    } catch (error) {
      console.warn("Admin logout failed:", error);
    } finally {
      window.location.href = loginPath();
    }
  }

  function bindShell() {
    const sidebar = $("#adminSidebar");

    document.addEventListener("click", (event) => {
      const toggle = event.target.closest("[data-admin-drawer-toggle]");
      if (toggle) {
        sidebar?.classList.toggle("is-open");
        return;
      }

      const logoutButton = event.target.closest("[data-logout]");
      if (logoutButton) {
        event.preventDefault();
        logout();
        return;
      }

      const tabButton = event.target.closest("[data-settings-tab]");
      if (tabButton) {
        activeTab = tabButton.dataset.settingsTab || "general";
        renderSideNav();
        renderPanel();
        return;
      }

      const modalClose = event.target.closest("[data-settings-modal-close]");
      if (modalClose || event.target.matches("[data-settings-modal]")) {
        closeModal();
        return;
      }

      const modalAction = event.target.closest("[data-settings-modal-action]");
      if (modalAction) {
        openModal(modalAction.dataset.settingsModalAction);
      }
    });
  }

  function renderProfile(admin) {
    const target = $("[data-admin-profile]");
    if (!target || !admin) return;
    const name = admin.name || admin.email || "الأدمن";
    target.innerHTML = `
      <span class="admin-v2-avatar">${escapeHtml(name.trim().charAt(0) || "A")}</span>
      <div>
        <strong>مرحبًا، ${escapeHtml(name)}</strong>
        <small>${escapeHtml(admin.role || "Owner")}</small>
      </div>
    `;
  }

  function renderSideNav() {
    document.querySelectorAll("[data-settings-tab]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.settingsTab === activeTab);
    });
  }

  function field(label, control, hint = "") {
    return `
      <label class="admin-settings-field">
        <span>${label}</span>
        ${control}
        ${hint ? `<small>${hint}</small>` : ""}
      </label>
    `;
  }

  function switchControl(name, checked = true) {
    return `
      <label class="admin-settings-switch">
        <input name="${name}" type="checkbox" ${checked ? "checked" : ""} />
        <span></span>
      </label>
    `;
  }

  function row(title, hint, name, checked = true) {
    return `
      <div class="admin-settings-row">
        <div>
          <strong>${title}</strong>
          <small>${hint}</small>
        </div>
        ${switchControl(name, checked)}
      </div>
    `;
  }

  function card(title, subtitle, body, extraClass = "") {
    return `
      <article class="admin-settings-card ${extraClass}">
        <div class="admin-settings-card__head">
          <div>
            <h2>${title}</h2>
            ${subtitle ? `<p>${subtitle}</p>` : ""}
          </div>
        </div>
        <div class="admin-settings-card__body">${body}</div>
      </article>
    `;
  }

  function submitBar(label) {
    return `
      <div class="admin-settings-submit">
        <p data-settings-message hidden></p>
        <button class="admin-settings-primary" type="submit">${label}</button>
      </div>
    `;
  }

  function uploadBox(initial, buttonText, hint = "PNG, JPG, SVG حتى 2MB") {
    return `
      <div class="admin-settings-upload">
        <strong>${initial}</strong>
        <div>
          <button type="button">${buttonText}</button>
          <small>${hint}</small>
        </div>
      </div>
    `;
  }

  function generalPanel() {
    return `
      <div class="admin-settings-section-head">
        <span>⚙</span>
        <div>
          <h2>إعدادات عامة</h2>
          <p>إعدادات أساسية تتحكم في عمل النظام.</p>
        </div>
      </div>
      <form data-settings-form="general" class="admin-settings-grid">
        ${card(
          "معلومات النظام",
          "",
          `
            ${field("اسم المنصة", `<input name="platformName" value="Advanced Pro" />`)}
            ${field("وصف المنصة", `<textarea name="platformDescription" rows="3">منصة متقدمة لإدارة المفاتيح والمشاريع</textarea>`)}
            ${field("شعار المنصة", uploadBox("A+", "تغيير الشعار"))}
          `
        )}
        ${card(
          "المنطقة واللغة",
          "",
          `
            ${field("اللغة الافتراضية", `<select name="language"><option>العربية</option></select>`)}
            ${field("المنطقة الزمنية", `<select name="timezone"><option>الرياض GMT+3</option></select>`)}
            ${field("تنسيق التاريخ", `<select name="dateFormat"><option>YYYY/MM/DD</option></select>`)}
          `
        )}
        ${submitBar("حفظ التغييرات")}
      </form>
    `;
  }

  function profilePanel() {
    const name = currentAdmin?.name || "Advanced Pro Owner";
    const email = currentAdmin?.email || "owner@advancedpro.com";
    return `
      <div class="admin-settings-section-head">
        <span>♙</span>
        <div>
          <h2>الملف الشخصي</h2>
          <p>بيانات حساب الأدمن وكلمة المرور.</p>
        </div>
      </div>
      <form data-settings-form="profile" class="admin-settings-grid">
        ${card(
          "بيانات الحساب",
          "",
          `
            ${field("الصورة الشخصية", uploadBox(escapeHtml(name.charAt(0) || "A"), "رفع صورة"))}
            ${field("الاسم", `<input name="name" value="${escapeHtml(name)}" />`)}
            ${field("البريد الإلكتروني", `<input name="email" dir="ltr" value="${escapeHtml(email)}" />`)}
            ${field("كلمة المرور الجديدة", `<input name="password" type="password" autocomplete="new-password" />`)}
            ${field("تأكيد كلمة المرور", `<input name="confirmPassword" type="password" autocomplete="new-password" />`)}
          `
        )}
        ${submitBar("تحديث الملف الشخصي")}
      </form>
    `;
  }

  function companyPanel() {
    return `
      <div class="admin-settings-section-head">
        <span>▦</span>
        <div>
          <h2>الشركة</h2>
          <p>بيانات الشركة التي تظهر في النظام والفواتير.</p>
        </div>
      </div>
      <form data-settings-form="company" class="admin-settings-grid">
        ${card(
          "بيانات الشركة",
          "",
          `
            ${field("اسم الشركة", `<input name="companyName" value="Advanced Pro" />`)}
            ${field("البريد", `<input name="companyEmail" dir="ltr" value="info@advancedpro.com" />`)}
            ${field("رقم الهاتف", `<input name="supportWhatsapp" dir="ltr" value="${escapeHtml(publicSettings.support_whatsapp || "+966")}" />`)}
            ${field("الموقع الإلكتروني", `<input name="storeUrl" dir="ltr" value="${escapeHtml(publicSettings.store_url || "")}" />`)}
            ${field("العنوان", `<textarea name="address" rows="3">الرياض، المملكة العربية السعودية</textarea>`)}
            ${field("الشعار", uploadBox("A+", "رفع شعار"))}
          `
        )}
        ${submitBar("حفظ بيانات الشركة")}
      </form>
    `;
  }

  function keysPanel() {
    return `
      <div class="admin-settings-section-head">
        <span>⚿</span>
        <div>
          <h2>المفاتيح</h2>
          <p>إعدادات توليد المفاتيح وصلاحيتها.</p>
        </div>
      </div>
      <form data-settings-form="keys" class="admin-settings-grid">
        ${card(
          "إعدادات المفاتيح",
          "",
          `
            <div class="admin-settings-two">
              ${field("بادئة الأكواد", `<input name="codePrefix" value="APRO" />`)}
              ${field("طول الكود", `<input name="codeLength" type="number" value="16" min="8" max="32" />`)}
            </div>
            ${row("توليد أكواد فريدة فقط", "منع تكرار الأكواد في قاعدة البيانات.", "uniqueCodes", true)}
            ${row("انتهاء الصلاحية التلقائي", "تغيير حالة المفتاح عند انتهاء الصلاحية.", "autoExpiry", true)}
            ${row("السماح بتعديل الأكواد يدويًا", "إتاحة التعديل اليدوي للأدمن عند الحاجة.", "manualCodeEdit", false)}
          `
        )}
        ${submitBar("حفظ إعدادات المفاتيح")}
      </form>
    `;
  }

  function notificationsPanel() {
    return `
      <div class="admin-settings-section-head">
        <span>◌</span>
        <div>
          <h2>الإشعارات</h2>
          <p>تحكم في تنبيهات البريد ولوحة التحكم.</p>
        </div>
      </div>
      <form data-settings-form="notifications" class="admin-settings-grid">
        ${card(
          "إعدادات الإشعارات",
          "",
          `
            ${row("إشعارات البريد", "إرسال إشعارات مهمة إلى البريد.", "emailNotifications", true)}
            ${row("إشعارات داخل لوحة التحكم", "إظهار التنبيهات داخل اللوحة.", "dashboardNotifications", true)}
            ${row("إشعارات انتهاء الصلاحية", "تنبيه الأدمن قبل انتهاء المفتاح.", "expiryNotifications", true)}
            ${field("عدد الأيام قبل انتهاء المفتاح", `<input name="expiryDays" type="number" value="7" min="1" />`)}
          `
        )}
        ${submitBar("حفظ الإعدادات")}
      </form>
    `;
  }

  function securityPanel() {
    return `
      <div class="admin-settings-section-head">
        <span>🛡</span>
        <div>
          <h2>الأمان</h2>
          <p>إعدادات الحماية وجلسات الدخول.</p>
        </div>
      </div>
      <form data-settings-form="security" class="admin-settings-grid">
        ${card(
          "إعدادات الأمان",
          "",
          `
            ${row("تفعيل المصادقة الثنائية 2FA", "إضافة طبقة حماية إضافية لحسابات الأدمن.", "twoFactor", false)}
            ${row("تسجيل جميع العمليات", "حفظ سجل كامل لكل إجراء داخل اللوحة.", "auditLog", true)}
            ${field("مهلة الجلسة", `<select name="sessionTimeout"><option>30 دقيقة</option><option>60 دقيقة</option><option>120 دقيقة</option></select>`)}
            <button class="admin-settings-danger" type="button" data-settings-modal-action="logoutAll">تسجيل الخروج من جميع الأجهزة</button>
          `
        )}
      </form>
    `;
  }

  function backupPanel() {
    return `
      <div class="admin-settings-section-head">
        <span>☁</span>
        <div>
          <h2>النسخ الاحتياطي</h2>
          <p>إدارة النسخ الاحتياطية واستعادة البيانات.</p>
        </div>
      </div>
      <div class="admin-settings-grid">
        ${card(
          "حالة النسخ",
          "",
          `
            <div class="admin-settings-metrics">
              <div><span>آخر نسخة احتياطية</span><strong>اليوم 08:30 م</strong></div>
              <div><span>عدد النسخ</span><strong>12</strong></div>
              <div><span>حجم النسخ</span><strong>248 MB</strong></div>
            </div>
            <div class="admin-settings-actions">
              <button type="button" data-settings-modal-action="createBackup">إنشاء نسخة احتياطية</button>
              <button type="button" data-settings-modal-action="downloadBackup">تحميل نسخة</button>
              <button type="button" data-settings-modal-action="restoreBackup">استعادة نسخة</button>
              <button class="is-danger" type="button" data-settings-modal-action="deleteBackup">حذف نسخة</button>
            </div>
          `
        )}
      </div>
    `;
  }

  function apiPanel() {
    return `
      <div class="admin-settings-section-head">
        <span>&lt;/&gt;</span>
        <div>
          <h2>API</h2>
          <p>إدارة مفاتيح مزودي الذكاء الاصطناعي بدون كشف المفاتيح كاملة.</p>
        </div>
      </div>
      <div class="admin-settings-grid">
        ${card(
          "مزودات الذكاء الاصطناعي",
          "",
          `
            <div class="admin-settings-api-key">
              <div>
                <strong>Gemini API</strong>
                <span dir="ltr">***************ABCD</span>
              </div>
              <em>متصل</em>
            </div>
            <div class="admin-settings-actions">
              <button type="button" data-settings-modal-action="updateApi">تحديث المفتاح</button>
              <button type="button" data-settings-modal-action="testApi">اختبار الاتصال</button>
              <button class="is-danger" type="button" data-settings-modal-action="deleteApi">حذف المفتاح</button>
              <button type="button" data-settings-modal-action="addProvider">إضافة مزود جديد</button>
            </div>
          `
        )}
      </div>
    `;
  }

  const panels = {
    general: generalPanel,
    profile: profilePanel,
    company: companyPanel,
    keys: keysPanel,
    notifications: notificationsPanel,
    security: securityPanel,
    backup: backupPanel,
    api: apiPanel,
  };

  function renderPanel() {
    const target = $("[data-settings-panel]");
    if (!target) return;
    target.innerHTML = panels[activeTab]?.() || generalPanel();
    bindForms();
  }

  function showMessage(form, type, text) {
    const message = form.querySelector("[data-settings-message]");
    if (!message) return;
    message.hidden = false;
    message.dataset.type = type;
    message.textContent = text;
  }

  function bindForms() {
    document.querySelectorAll("[data-settings-form]").forEach((form) => {
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const submit = form.querySelector("button[type='submit']");
        const message = form.querySelector("[data-settings-message]");
        if (message) message.hidden = true;
        if (submit) submit.disabled = true;

        try {
          if (form.dataset.settingsForm === "company") {
            await requestJson("/api/admin/settings", {
              method: "POST",
              body: JSON.stringify({
                storeUrl: form.storeUrl?.value || publicSettings.store_url || "",
                supportWhatsapp: form.supportWhatsapp?.value || publicSettings.support_whatsapp || "",
                supportWhatsappMessage: publicSettings.support_whatsapp_message || "",
              }),
            });
          }
          showMessage(form, "success", "تم حفظ الإعدادات بنجاح.");
        } catch (error) {
          showMessage(form, "error", error.message || "تعذر حفظ الإعدادات.");
        } finally {
          if (submit) submit.disabled = false;
        }
      });
    });
  }

  function closeModal() {
    const modal = $("[data-settings-modal]");
    if (modal) modal.hidden = true;
  }

  function openModal(action) {
    const modal = $("[data-settings-modal]");
    const content = $("[data-settings-modal-content]");
    if (!modal || !content) return;

    const templates = {
      updateApi: {
        title: "تحديث المفتاح",
        body: `${field("المفتاح الجديد", `<input dir="ltr" type="password" placeholder="أدخل المفتاح الجديد" />`)}<button class="admin-settings-primary" type="button" data-settings-modal-close>حفظ المفتاح</button>`,
      },
      testApi: {
        title: "اختبار الاتصال",
        body: `<p class="admin-settings-success">تم الاتصال بنجاح</p>`,
      },
      deleteApi: {
        title: "حذف المفتاح",
        body: `<p>هل تريد حذف هذا المفتاح؟</p><button class="admin-settings-danger" type="button" data-settings-modal-close>حذف المفتاح</button>`,
      },
      addProvider: {
        title: "إضافة مزود جديد",
        body: `${field("اسم المزود", `<input />`)}${field("نوع المزود", `<input />`)}${field("API Key", `<input dir="ltr" type="password" />`)}<button class="admin-settings-primary" type="button" data-settings-modal-close>حفظ</button>`,
      },
      logoutAll: {
        title: "إنهاء جميع الجلسات النشطة",
        body: `<p>هل تريد إنهاء جميع الجلسات النشطة؟</p><div class="admin-settings-modal-actions"><button class="admin-settings-danger" type="button" data-settings-modal-close>تأكيد</button><button type="button" data-settings-modal-close>إلغاء</button></div>`,
      },
      createBackup: {
        title: "إنشاء نسخة احتياطية",
        body: `<p class="admin-settings-success">تم إنشاء نسخة احتياطية جديدة من قاعدة البيانات.</p>`,
      },
      downloadBackup: {
        title: "تحميل نسخة",
        body: `<p>تم تجهيز ملف النسخة الاحتياطية للتنزيل.</p><button class="admin-settings-primary" type="button" data-download-demo>تنزيل الملف</button>`,
      },
      restoreBackup: {
        title: "استعادة نسخة",
        body: `${field("رفع ملف Backup", `<input type="file" />`)}<button class="admin-settings-primary" type="button" data-settings-modal-close>استعادة</button>`,
      },
      deleteBackup: {
        title: "حذف نسخة",
        body: `<p>هل تريد حذف النسخة الاحتياطية؟</p><button class="admin-settings-danger" type="button" data-settings-modal-close>حذف</button>`,
      },
    };

    const template = templates[action] || { title: "إجراء", body: "<p>جاهز.</p>" };
    content.innerHTML = `
      <h2 id="settingsModalTitle">${template.title}</h2>
      <div class="admin-settings-modal__body">${template.body}</div>
    `;
    modal.hidden = false;

    const download = content.querySelector("[data-download-demo]");
    if (download) {
      download.addEventListener("click", () => {
        const blob = new Blob(["Advanced Pro backup placeholder"], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = "advanced-pro-backup.txt";
        anchor.click();
        URL.revokeObjectURL(url);
      });
    }
  }

  async function init() {
    bindShell();
    const session = await requestJson("/api/admin/session").catch(() => null);
    if (!session?.admin) {
      window.location.href = loginPath();
      return;
    }

    currentAdmin = session.admin;
    renderProfile(currentAdmin);

    const settingsPayload = await requestJson("/api/admin/settings").catch(() => ({ settings: {} }));
    publicSettings = settingsPayload.settings || {};

    renderSideNav();
    renderPanel();
  }

  init().catch((error) => {
    const target = $("[data-settings-panel]");
    if (target) target.innerHTML = `<div class="admin-v2-error">${escapeHtml(error.message || "تعذر تحميل الإعدادات.")}</div>`;
  });
})();
