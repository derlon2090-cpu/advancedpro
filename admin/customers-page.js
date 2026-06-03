(function () {
  const API_BASE_URL = window.AdvancedProConfig?.apiBaseUrl || "";
  const nf = new Intl.NumberFormat("ar-SA");
  const $ = (selector) => document.querySelector(selector);

  let customers = [];

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function loginPath() {
    const configured = String(window.AdvancedProConfig?.adminSecretPath || "advanced-pro-control").replace(
      /^\/+|\/+$/g,
      ""
    );
    return `/${configured || "advanced-pro-control"}`;
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
        return;
      }

      const action = event.target.closest("[data-customer-actions]");
      document.querySelectorAll(".admin-customer-menu.is-open").forEach((menu) => {
        if (!action || menu !== action.nextElementSibling) menu.classList.remove("is-open");
      });
      if (action) action.nextElementSibling?.classList.toggle("is-open");

      const modalButton = event.target.closest("[data-customer-modal-action]");
      if (modalButton) {
        openActionModal(modalButton.dataset.customerModalAction, modalButton.dataset.customerId);
      }

      const close = event.target.closest("[data-close-customer-modal]");
      if (close) $("[data-customer-modal]").hidden = true;
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

  function planBadge(planName) {
    const name = String(planName || "انطلاقة");
    const icon = name.includes("احتراف") ? "👑" : name.includes("تميز") ? "💎" : name.includes("إبداع") ? "⭐" : "🚀";
    return `<span class="admin-customer-plan">${icon} ${escapeHtml(name)}</span>`;
  }

  function statusLabel(status) {
    if (status === "disabled") return "معطل";
    if (status === "expired") return "منتهي";
    return "نشط";
  }

  function relativeTime(value) {
    if (!value) return "منذ أسبوع";
    const diff = Date.now() - new Date(value).getTime();
    const minutes = Math.max(1, Math.floor(diff / 60000));
    if (minutes < 60) return `منذ ${minutes} دقائق`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `منذ ${hours} ساعة`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `منذ ${days} يوم`;
    return "منذ أسبوع";
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
      const groupId = `${name}::${email}`;
      const current = grouped.get(groupId) || {
        name,
        email,
        keys: [],
        joinedAt: key.createdAt,
        lastActivity: key.activatedAt || key.createdAt,
      };
      current.keys.push(key);
      if (key.createdAt && new Date(key.createdAt) < new Date(current.joinedAt)) current.joinedAt = key.createdAt;
      const activity = key.activatedAt || key.createdAt;
      if (activity && new Date(activity) > new Date(current.lastActivity)) current.lastActivity = activity;
      grouped.set(groupId, current);
    });

    return Array.from(grouped.values()).map((customer, index) => {
      const latestKey = customer.keys
        .slice()
        .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())[0];
      const active = customer.keys.some((key) => key.status === "active" || key.status === "unused");
      const disabled = customer.keys.every((key) => key.status === "disabled");
      const expired = !disabled && customer.keys.every((key) => key.status === "expired");
      const status = disabled ? "disabled" : expired ? "expired" : active ? "active" : "expired";
      return {
        ...customer,
        id: String(1001 + index),
        avatar: customer.name.trim().charAt(0) || "ع",
        planName: latestKey?.planName || "انطلاقة",
        status,
        imagesUsed: customer.keys.reduce((sum, key) => sum + Number(key.imagesUsed || 0), 0),
        videosUsed: customer.keys.reduce((sum, key) => sum + Number(key.videosUsed || 0), 0),
        imagesRemaining: customer.keys.reduce((sum, key) => sum + Number(key.imagesRemaining || 0), 0),
        videosRemaining: customer.keys.reduce((sum, key) => sum + Number(key.videosRemaining || 0), 0),
      };
    });
  }

  function filteredCustomers() {
    const search = String($("[data-customer-search]")?.value || "").trim().toLowerCase();
    const status = String($("[data-customer-status]")?.value || "all");
    return customers.filter((customer) => {
      const matchesSearch =
        !search ||
        customer.name.toLowerCase().includes(search) ||
        customer.email.toLowerCase().includes(search) ||
        customer.id.includes(search);
      const matchesStatus = status === "all" || customer.status === status;
      return matchesSearch && matchesStatus;
    });
  }

  function renderStats() {
    const target = $("[data-customer-stats]");
    if (!target) return;
    const total = customers.length;
    const active = customers.filter((customer) => customer.status === "active").length;
    const inactive = Math.max(0, total - active);
    const ratio = total ? Math.round((active / total) * 100) : 0;
    const cards = [
      ["إجمالي العملاء", total, "عميل", "♙", "#5B35F5"],
      ["العملاء النشطين", active, "عميل", "♙✓", "#12B76A"],
      ["العملاء غير النشطين", inactive, "عميل", "◷", "#F59E0B"],
      ["نسبة العملاء النشطين", `${ratio}%`, "من إجمالي العملاء", "◔", "#8B5CF6"],
    ];
    target.innerHTML = cards
      .map(
        ([label, value, caption, icon, color]) => `
          <article class="admin-customer-stat">
            <span style="--customer-stat-color:${color}">${icon}</span>
            <div>
              <small>${label}</small>
              <strong>${typeof value === "number" ? nf.format(value) : value}</strong>
              <em>${caption}</em>
            </div>
          </article>
        `
      )
      .join("");
  }

  function actionMenu(customer) {
    const email = escapeHtml(customer.email);
    return `
      <div class="admin-customer-actions">
        <button type="button" data-customer-actions aria-label="إجراءات العميل">⋮</button>
        <div class="admin-customer-menu">
          <a href="/admin/customers/${customer.id}">👁 عرض الملف</a>
          <button type="button" data-customer-modal-action="edit" data-customer-id="${customer.id}">✏️ تعديل العميل</button>
          <button type="button" data-customer-modal-action="keys" data-customer-id="${customer.id}">🔑 عرض المفاتيح</button>
          <a href="/admin/keys/create?customer=${encodeURIComponent(customer.name)}">➕ إنشاء مفتاح جديد</a>
          <button type="button" data-customer-modal-action="extend" data-customer-id="${customer.id}">📅 تمديد الصلاحية</button>
          <button type="button" data-customer-modal-action="balance" data-customer-id="${customer.id}">📊 تعديل الرصيد</button>
          <button type="button" data-customer-modal-action="plan" data-customer-id="${customer.id}">💎 تغيير الباقة</button>
          <button type="button" data-customer-modal-action="disable" data-customer-id="${customer.id}">⛔ تعطيل العميل</button>
          <button type="button" onclick="navigator.clipboard?.writeText('${email}')">📋 نسخ البريد</button>
          <button type="button" class="is-danger" data-customer-modal-action="delete" data-customer-id="${customer.id}">🗑 حذف العميل</button>
        </div>
      </div>
    `;
  }

  function renderTable() {
    const target = $("[data-admin-customers-table]");
    if (!target) return;
    const rows = filteredCustomers();
    if (!rows.length) {
      target.innerHTML = `<div class="admin-v2-empty">لا يوجد عملاء مطابقون.</div>`;
      return;
    }

    target.innerHTML = `
      <div class="admin-v2-table-wrap">
        <table class="admin-v2-table admin-customer-table">
          <thead>
            <tr>
              <th>العميل</th>
              <th>الباقة الحالية</th>
              <th>حالة الاشتراك</th>
              <th>تاريخ الانضمام</th>
              <th>آخر نشاط</th>
              <th>الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            ${rows
              .map(
                (customer) => `
                  <tr>
                    <td>
                      <div class="admin-customer-person">
                        <span>${escapeHtml(customer.avatar)}</span>
                        <div>
                          <strong>${escapeHtml(customer.name)}</strong>
                          <small>#${escapeHtml(customer.id)}</small>
                        </div>
                      </div>
                    </td>
                    <td>${planBadge(customer.planName)}</td>
                    <td><span class="admin-customer-status is-${customer.status}">${statusLabel(customer.status)}</span></td>
                    <td>${formatDate(customer.joinedAt)}</td>
                    <td><span class="admin-customer-activity">${relativeTime(customer.lastActivity)}</span></td>
                    <td>${actionMenu(customer)}</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function openActionModal(action, customerId) {
    const customer = customers.find((item) => item.id === customerId);
    if (!customer) return;
    const modal = $("[data-customer-modal]");
    const content = $("[data-customer-modal-content]");
    if (!modal || !content) return;
    const titleMap = {
      edit: "تعديل العميل",
      keys: "جميع مفاتيح العميل",
      extend: "تمديد الصلاحية",
      balance: "تعديل الرصيد",
      plan: "تغيير الباقة",
      disable: "تعطيل العميل",
      delete: "حذف العميل",
    };
    const bodyMap = {
      keys: `<div class="admin-v2-table-wrap"><table class="admin-v2-table"><thead><tr><th>الكود</th><th>الباقة</th><th>الانتهاء</th><th>الحالة</th></tr></thead><tbody>${customer.keys
        .map(
          (key) =>
            `<tr><td>${escapeHtml(key.code)}</td><td>${escapeHtml(key.planName)}</td><td>${formatDate(key.expiresAt)}</td><td>${escapeHtml(key.statusLabel || key.status)}</td></tr>`
        )
        .join("")}</tbody></table></div>`,
      extend: `<label>عدد الأيام<input type="number" value="30" /></label><div class="admin-customer-chips"><button>30</button><button>90</button><button>180</button><button>365</button></div>`,
      balance: `<label>حد الصور<input type="number" value="${customer.imagesRemaining}" /></label><label>حد الفيديو<input type="number" value="${customer.videosRemaining}" /></label>`,
      plan: `<div class="admin-customer-chips"><button>🚀 انطلاقة</button><button>⭐ إبداع</button><button>💎 تميز</button><button>👑 احترافية</button></div>`,
      disable: `<p>هل تريد تعطيل العميل؟</p><button class="admin-customer-danger">تعطيل</button>`,
      delete: `<p>سيتم حذف العميل وجميع مفاتيحه.</p><button class="admin-customer-danger">حذف نهائي</button>`,
      edit: `<label>اسم العميل<input type="text" value="${escapeHtml(customer.name)}" /></label><label>البريد<input type="email" value="${escapeHtml(customer.email)}" /></label>`,
    };
    content.innerHTML = `
      <h2>${titleMap[action] || "إجراء العميل"}</h2>
      <p>${escapeHtml(customer.name)} - #${escapeHtml(customer.id)}</p>
      <div class="admin-customer-modal-body">${bodyMap[action] || ""}</div>
      <div class="admin-key-modal-actions">
        <button type="button">حفظ</button>
        <button type="button" data-close-customer-modal>إلغاء</button>
      </div>
    `;
    modal.hidden = false;
  }

  function exportCustomers() {
    const csv = [
      ["id", "name", "email", "plan", "status", "joinedAt", "lastActivity"],
      ...filteredCustomers().map((customer) => [
        customer.id,
        customer.name,
        customer.email,
        customer.planName,
        customer.status,
        customer.joinedAt,
        customer.lastActivity,
      ]),
    ]
      .map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "advancedpro-customers.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function init() {
    bindAdminShell();
    const session = await requestJson("/api/admin/session").catch(() => null);
    if (!session?.admin) {
      window.location.href = loginPath();
      return;
    }
    renderProfile(session.admin);

    const payload = await requestJson("/api/admin/keys");
    customers = buildCustomers(payload.keys || []);
    renderStats();
    renderTable();
    $("[data-customer-search]")?.addEventListener("input", renderTable);
    $("[data-customer-status]")?.addEventListener("change", renderTable);
    $("[data-export-customers]")?.addEventListener("click", exportCustomers);
  }

  init().catch((error) => {
    const target = $("[data-admin-customers-table]");
    if (target) target.innerHTML = `<div class="admin-v2-error">${escapeHtml(error.message)}</div>`;
  });
})();
