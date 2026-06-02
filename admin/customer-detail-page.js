(function () {
  const API_BASE_URL = window.AdvancedProConfig?.apiBaseUrl || "";
  const $ = (selector) => document.querySelector(selector);

  function escapeHtml(value) {
    return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
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
    if (!response.ok) throw new Error(payload.message || "تعذر تحميل البيانات.");
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

  function bindAdminShell() {
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
      }
    });
  }

  function renderProfile(admin) {
    const target = $("[data-admin-profile]");
    if (!target || !admin) return;
    const name = admin.name || admin.email || "الأدمن";
    target.innerHTML = `<span class="admin-v2-avatar">${escapeHtml(name.trim().charAt(0) || "A")}</span><div><strong>مرحبًا، ${escapeHtml(name)}</strong><small>${escapeHtml(admin.role || "Owner")}</small></div>`;
  }

  function formatDate(value) {
    if (!value) return "غير محدد";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "غير محدد";
    return date.toLocaleDateString("ar-SA", { year: "numeric", month: "2-digit", day: "2-digit" });
  }

  function buildCustomers(keys) {
    const grouped = new Map();
    keys.forEach((key) => {
      const name = key.customerName || "عميل بدون اسم";
      const email = key.customerEmail || "بدون بريد";
      const id = `${name}::${email}`;
      const current = grouped.get(id) || { name, email, keys: [], joinedAt: key.createdAt };
      current.keys.push(key);
      if (key.createdAt && new Date(key.createdAt) < new Date(current.joinedAt)) current.joinedAt = key.createdAt;
      grouped.set(id, current);
    });
    return Array.from(grouped.values()).map((customer, index) => ({
      ...customer,
      id: String(1001 + index),
      planName: customer.keys[0]?.planName || "انطلاقة",
      status: customer.keys.some((key) => key.status === "active" || key.status === "unused") ? "نشط" : "منتهي",
      imagesUsed: customer.keys.reduce((sum, key) => sum + Number(key.imagesUsed || 0), 0),
      videosUsed: customer.keys.reduce((sum, key) => sum + Number(key.videosUsed || 0), 0),
      imagesRemaining: customer.keys.reduce((sum, key) => sum + Number(key.imagesRemaining || 0), 0),
      videosRemaining: customer.keys.reduce((sum, key) => sum + Number(key.videosRemaining || 0), 0),
    }));
  }

  function progress(used, remaining) {
    const total = used + remaining;
    const pct = total ? Math.round((used / total) * 100) : 0;
    return `<b><i style="width:${Math.max(pct, 4)}%"></i></b>`;
  }

  function renderCustomer(customer) {
    const target = $("[data-customer-detail]");
    if (!target) return;
    target.innerHTML = `
      <section class="admin-customers-hero">
        <div><span class="admin-customers-icon">${escapeHtml(customer.name.charAt(0))}</span><p>ملف العميل</p><h1>${escapeHtml(customer.name)}</h1><span>#${escapeHtml(customer.id)} - ${escapeHtml(customer.email)}</span></div>
        <a class="admin-customers-create" href="/admin/keys/create?customer=${encodeURIComponent(customer.name)}">＋ إنشاء مفتاح جديد</a>
      </section>
      <section class="admin-customer-detail-grid">
        <article class="admin-customer-detail-card">
          <h2>معلومات العميل</h2>
          <p><span>الاسم</span><strong>${escapeHtml(customer.name)}</strong></p>
          <p><span>البريد</span><strong>${escapeHtml(customer.email)}</strong></p>
          <p><span>تاريخ الانضمام</span><strong>${formatDate(customer.joinedAt)}</strong></p>
          <p><span>الحالة</span><strong>${escapeHtml(customer.status)}</strong></p>
          <p><span>الباقة</span><strong>${escapeHtml(customer.planName)}</strong></p>
        </article>
        <article class="admin-customer-detail-card">
          <h2>الرصيد</h2>
          <p><span>الصور</span><strong>${customer.imagesUsed} مستخدم / ${customer.imagesRemaining} متبقي</strong></p>
          ${progress(customer.imagesUsed, customer.imagesRemaining)}
          <p><span>الفيديوهات</span><strong>${customer.videosUsed} مستخدم / ${customer.videosRemaining} متبقي</strong></p>
          ${progress(customer.videosUsed, customer.videosRemaining)}
        </article>
      </section>
      <section class="admin-customers-panel">
        <div class="admin-v2-table-wrap">
          <table class="admin-v2-table admin-customer-table">
            <thead><tr><th>الكود</th><th>الباقة</th><th>تاريخ الإنشاء</th><th>تاريخ الانتهاء</th><th>الحالة</th><th>الإجراءات</th></tr></thead>
            <tbody>${customer.keys.map((key) => `<tr><td>${escapeHtml(key.code)}</td><td>${escapeHtml(key.planName)}</td><td>${formatDate(key.createdAt)}</td><td>${formatDate(key.expiresAt)}</td><td>${escapeHtml(key.statusLabel || key.status)}</td><td><button class="admin-key-more" type="button">⋮</button></td></tr>`).join("")}</tbody>
          </table>
        </div>
      </section>
    `;
  }

  async function init() {
    bindAdminShell();
    const session = await requestJson("/api/admin/session").catch(() => null);
    if (!session?.admin) {
      window.location.href = loginPath();
      return;
    }
    renderProfile(session.admin);
    const id = new URLSearchParams(window.location.search).get("id") || window.location.pathname.split("/").filter(Boolean).pop();
    const payload = await requestJson("/api/admin/keys");
    const customer = buildCustomers(payload.keys || []).find((item) => item.id === id);
    if (!customer) throw new Error("لم يتم العثور على العميل.");
    renderCustomer(customer);
  }

  init().catch((error) => {
    const target = $("[data-customer-detail]");
    if (target) target.innerHTML = `<div class="admin-v2-error">${escapeHtml(error.message)}</div>`;
  });
})();
