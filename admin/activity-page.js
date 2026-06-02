(function () {
  const API_BASE_URL = window.AdvancedProConfig?.apiBaseUrl || "";
  const nf = new Intl.NumberFormat("ar-SA");
  const $ = (selector) => document.querySelector(selector);

  let activities = [];
  let filteredActivities = [];
  let currentPage = 1;
  const pageSize = 8;

  const moduleLabels = {
    login: "دخول",
    customers: "عملاء",
    keys: "مفاتيح",
    plans: "باقات",
    projects: "مشاريع",
    settings: "إعدادات",
    export: "تصدير",
    system: "النظام",
  };

  const actionLabels = {
    login: "تسجيل دخول",
    logout: "تسجيل خروج",
    "customer-created": "إنشاء عميل جديد",
    "customer-updated": "تعديل عميل",
    "customer-deleted": "حذف عميل",
    "key-created": "إنشاء مفتاح",
    "key-activated": "تفعيل مفتاح",
    "key-disabled": "تعطيل مفتاح",
    "plan-updated": "تعديل باقة",
    "project-deleted": "حذف مشروع",
    "image-created": "إنشاء صورة",
    "video-created": "إنشاء فيديو",
    "settings-updated": "تعديل إعدادات",
    "data-exported": "تصدير بيانات",
  };

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
    if (!response.ok) throw new Error(payload.message || "تعذر تحميل سجل النشاط.");
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

      const menuButton = event.target.closest("[data-activity-menu]");
      if (menuButton) {
        event.stopPropagation();
        toggleMenu(menuButton);
        return;
      }

      const action = event.target.closest("[data-activity-action]");
      if (action) {
        event.preventDefault();
        handleRowAction(action.dataset.activityAction, action.dataset.activityId);
        closeMenus();
        return;
      }

      const pageButton = event.target.closest("[data-activity-page]");
      if (pageButton) {
        currentPage = Number(pageButton.dataset.activityPage || 1);
        renderTable();
        return;
      }

      const closeDrawer = event.target.closest("[data-activity-drawer-close]");
      if (closeDrawer || event.target.matches("[data-activity-drawer]")) {
        closeActivityDrawer();
        return;
      }

      closeMenus();
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

  function normalizeActivity(item, index = 0) {
    const createdAt = item.createdAt || item.created_at || new Date().toISOString();
    const action = item.action || item.type || "system";
    const module = item.module || inferModule(action);
    const userName = item.userName || item.user || item.customer || "النظام";
    const status = item.status || "success";

    return {
      id: String(item.id || `activity-${index + 1}`),
      userId: item.userId || item.user_id || null,
      userType: item.userType || item.user_type || "admin",
      userName,
      userEmail: item.userEmail || item.email || "admin@advancedpro.com",
      action,
      actionLabel: item.actionLabel || item.title || actionLabels[action] || "نشاط",
      module,
      moduleLabel: item.moduleLabel || moduleLabels[module] || module,
      description: item.description || item.details || "تم تنفيذ العملية داخل النظام.",
      details: item.details || item.description || "تم تنفيذ العملية داخل النظام.",
      status,
      statusLabel: status === "failed" ? "فشل" : status === "warning" ? "تحذير" : "نجاح",
      ipAddress: item.ipAddress || item.ip_address || "192.168.1.10",
      userAgent: item.userAgent || item.user_agent || navigator.userAgent || "unknown",
      browser: item.browser || detectBrowser(item.userAgent || navigator.userAgent),
      os: item.os || detectOs(item.userAgent || navigator.userAgent),
      route: item.route || routeForModule(module, action),
      metadata: item.metadata || {},
      createdAt,
    };
  }

  function inferModule(action) {
    if (String(action).includes("key")) return "keys";
    if (String(action).includes("customer")) return "customers";
    if (String(action).includes("plan")) return "plans";
    if (String(action).includes("project") || String(action).includes("image") || String(action).includes("video")) return "projects";
    if (String(action).includes("setting")) return "settings";
    if (String(action).includes("export")) return "export";
    if (String(action).includes("login") || String(action).includes("logout")) return "login";
    return "system";
  }

  function routeForModule(module, action) {
    if (module === "keys" && action === "key-created") return "/admin/keys/create";
    if (module === "keys") return "/admin/keys";
    if (module === "customers") return "/admin/customers";
    if (module === "plans") return "/admin/plans";
    if (module === "projects") return "/dashboard";
    if (module === "settings") return "/admin/settings";
    if (module === "export") return "/admin/reports";
    return "/admin/dashboard";
  }

  function detectBrowser(agent = "") {
    if (agent.includes("Edg")) return "Microsoft Edge";
    if (agent.includes("Chrome")) return "Chrome";
    if (agent.includes("Firefox")) return "Firefox";
    if (agent.includes("Safari")) return "Safari";
    return "غير معروف";
  }

  function detectOs(agent = "") {
    if (agent.includes("Windows")) return "Windows";
    if (agent.includes("Mac")) return "macOS";
    if (agent.includes("Android")) return "Android";
    if (agent.includes("iPhone")) return "iOS";
    if (agent.includes("Linux")) return "Linux";
    return "غير معروف";
  }

  function fallbackActivities(stats) {
    const now = Date.now();
    const fromRecent = (stats.recentActivity || []).map((item, index) =>
      normalizeActivity(
        {
          id: item.id,
          action: item.type,
          title: item.title,
          description: item.description,
          module: inferModule(item.type),
          status: "success",
          createdAt: item.createdAt || new Date(now - index * 45 * 60 * 1000).toISOString(),
          ipAddress: `192.168.1.${10 + index}`,
        },
        index
      )
    );

    if (fromRecent.length) return fromRecent;

    return [
      ["login", "تم تسجيل الدخول بنجاح", "أحمد القحطاني", "login", "success"],
      ["customer-created", "إنشاء عميل جديد", "سارة علي", "customers", "success"],
      ["plan-updated", "تعديل باقة إبداع", "محمد المطيري", "plans", "warning"],
      ["project-deleted", "حذف مشروع", "نورة خالد", "projects", "failed"],
      ["key-activated", "تفعيل مفتاح APRO-7X2L-9K8M-3Z1P", "عبدالعزيز فيصل", "keys", "success"],
      ["key-created", "إنشاء مفتاح جديد", "ريم بنت ماجد", "keys", "success"],
      ["data-exported", "تصدير تقرير العملاء", "يوسف سالم", "export", "success"],
      ["settings-updated", "تعديل إعدادات النظام", "أحمد القحطاني", "settings", "warning"],
    ].map(([action, description, userName, module, status], index) =>
      normalizeActivity(
        {
          id: `demo-${index + 1}`,
          action,
          description,
          userName,
          module,
          status,
          createdAt: new Date(now - index * 38 * 60 * 1000).toISOString(),
          ipAddress: `192.168.1.${10 + index}`,
        },
        index
      )
    );
  }

  function renderStats() {
    const target = $("[data-activity-stats]");
    if (!target) return;
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const total = activities.length;
    const today = activities.filter((item) => now - new Date(item.createdAt).getTime() <= day).length;
    const last7 = activities.filter((item) => now - new Date(item.createdAt).getTime() <= 7 * day).length;
    const last30 = activities.filter((item) => now - new Date(item.createdAt).getTime() <= 30 * day).length;
    const uniqueUsers = new Set(activities.map((item) => item.userName)).size;

    const cards = [
      ["إجمالي الأحداث", total, "حدث", "⌁", "#8B5CF6"],
      ["المستخدمين النشطين", uniqueUsers, "مستخدم", "♙", "#12B76A"],
      ["اليوم", today, "حدث", "▤", "#F59E0B"],
      ["آخر 7 أيام", last7, "حدث", "◷", "#2F80FF"],
      ["آخر 30 يوم", last30, "حدث", "▣", "#5B35F5"],
    ];

    target.innerHTML = cards
      .map(
        ([title, value, sub, icon, color]) => `
          <article class="admin-activity-stat">
            <span style="--activity-color:${color}">${icon}</span>
            <div>
              <small>${title}</small>
              <strong>${nf.format(value)}</strong>
              <em>${sub}</em>
            </div>
          </article>
        `
      )
      .join("");
  }

  function renderFilters() {
    const userSelect = $("[data-activity-user]");
    if (!userSelect) return;
    const current = userSelect.value || "all";
    const users = Array.from(new Set(activities.map((item) => item.userName))).sort();
    userSelect.innerHTML = `<option value="all">جميع المستخدمين</option>${users
      .map((user) => `<option value="${escapeHtml(user)}">${escapeHtml(user)}</option>`)
      .join("")}`;
    userSelect.value = users.includes(current) ? current : "all";
  }

  function applyFilters() {
    const search = String($("[data-activity-search]")?.value || "").trim().toLowerCase();
    const user = $("[data-activity-user]")?.value || "all";
    const type = $("[data-activity-type]")?.value || "all";
    const status = $("[data-activity-status]")?.value || "all";

    filteredActivities = activities.filter((item) => {
      const haystack = `${item.actionLabel} ${item.userName} ${item.userEmail} ${item.moduleLabel} ${item.description} ${item.ipAddress}`.toLowerCase();
      if (search && !haystack.includes(search)) return false;
      if (user !== "all" && item.userName !== user) return false;
      if (type !== "all" && item.module !== type) return false;
      if (status !== "all" && item.status !== status) return false;
      return true;
    });

    currentPage = 1;
    renderTable();
  }

  function statusBadge(item) {
    return `<span class="admin-activity-status admin-activity-status--${escapeHtml(item.status)}">${escapeHtml(item.statusLabel)}</span>`;
  }

  function actionBadge(item) {
    return `<span class="admin-activity-action admin-activity-action--${escapeHtml(item.module)}"><i></i>${escapeHtml(item.actionLabel)}</span>`;
  }

  function moduleCell(item) {
    return `<span class="admin-activity-module">${escapeHtml(item.moduleLabel)} <b>${moduleIcon(item.module)}</b></span>`;
  }

  function moduleIcon(module) {
    return {
      login: "⚙",
      customers: "♙",
      keys: "⚿",
      plans: "◇",
      projects: "□",
      settings: "⚙",
      export: "⇩",
      system: "◌",
    }[module] || "◌";
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "غير محدد";
    return date.toLocaleString("ar-SA", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function relativeDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "غير محدد";
    const diff = Date.now() - date.getTime();
    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;
    if (diff < hour) return `منذ ${Math.max(1, Math.round(diff / minute))} دقائق`;
    if (diff < day) return `منذ ${Math.round(diff / hour)} ساعة`;
    return `منذ ${Math.round(diff / day)} يوم`;
  }

  function renderTable() {
    const target = $("[data-activity-table]");
    if (!target) return;
    const totalPages = Math.max(1, Math.ceil(filteredActivities.length / pageSize));
    currentPage = Math.min(currentPage, totalPages);
    const start = (currentPage - 1) * pageSize;
    const rows = filteredActivities.slice(start, start + pageSize);

    if (!rows.length) {
      target.innerHTML = `<div class="admin-v2-empty">لا توجد أنشطة مطابقة للفلاتر الحالية.</div>`;
      return;
    }

    target.innerHTML = `
      <div class="admin-activity-table-wrap">
        <table class="admin-activity-table">
          <thead>
            <tr>
              <th>النشاط</th>
              <th>المستخدم</th>
              <th>النوع</th>
              <th>التفاصيل</th>
              <th>الوقت</th>
              <th>الحالة</th>
              <th>عنوان IP</th>
              <th>الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((item) => renderRow(item)).join("")}
          </tbody>
        </table>
      </div>
      <div class="admin-activity-pagination">
        <span>عرض ${nf.format(start + 1)} إلى ${nf.format(start + rows.length)} من ${nf.format(filteredActivities.length)} حدث</span>
        <div>
          ${Array.from({ length: Math.min(totalPages, 5) }, (_, index) => {
            const page = index + 1;
            return `<button class="${page === currentPage ? "is-active" : ""}" type="button" data-activity-page="${page}">${nf.format(page)}</button>`;
          }).join("")}
        </div>
      </div>
    `;
  }

  function renderRow(item) {
    return `
      <tr>
        <td>${actionBadge(item)}</td>
        <td>
          <div class="admin-activity-user">
            <span>${escapeHtml(item.userName.charAt(0) || "A")}</span>
            <div>
              <strong>${escapeHtml(item.userName)}</strong>
              <small>${escapeHtml(item.userEmail)}</small>
            </div>
          </div>
        </td>
        <td>${moduleCell(item)}</td>
        <td>${escapeHtml(item.description)}</td>
        <td><strong>${relativeDate(item.createdAt)}</strong><small>${formatDate(item.createdAt)}</small></td>
        <td>${statusBadge(item)}</td>
        <td dir="ltr">${escapeHtml(item.ipAddress)}</td>
        <td>
          <div class="admin-activity-menu">
            <button type="button" data-activity-menu aria-label="إجراءات النشاط">⋮</button>
            <div class="admin-activity-dropdown">
              <a href="#" data-activity-action="details" data-activity-id="${escapeHtml(item.id)}">👁 عرض التفاصيل</a>
              <a href="#" data-activity-action="copy-ip" data-activity-id="${escapeHtml(item.id)}">📋 نسخ عنوان IP</a>
              <a href="#" data-activity-action="copy-id" data-activity-id="${escapeHtml(item.id)}"># نسخ معرف العملية</a>
              <a href="#" data-activity-action="user" data-activity-id="${escapeHtml(item.id)}">♙ عرض المستخدم</a>
              <a href="#" data-activity-action="full-log" data-activity-id="${escapeHtml(item.id)}">▤ عرض السجل الكامل</a>
              <a href="#" data-activity-action="export-one" data-activity-id="${escapeHtml(item.id)}">⇩ تصدير هذا الحدث</a>
            </div>
          </div>
        </td>
      </tr>
    `;
  }

  function toggleMenu(button) {
    const menu = button.closest(".admin-activity-menu");
    const isOpen = menu?.classList.contains("is-open");
    closeMenus();
    if (!isOpen) menu?.classList.add("is-open");
  }

  function closeMenus() {
    document.querySelectorAll(".admin-activity-menu.is-open").forEach((menu) => menu.classList.remove("is-open"));
  }

  function findActivity(id) {
    return activities.find((item) => item.id === id);
  }

  async function copyText(value) {
    try {
      await navigator.clipboard.writeText(value);
    } catch (_error) {
      const input = document.createElement("textarea");
      input.value = value;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      input.remove();
    }
  }

  function handleRowAction(action, id) {
    const item = findActivity(id);
    if (!item) return;

    if (action === "details") {
      openActivityDrawer(item);
      return;
    }
    if (action === "copy-ip") {
      copyText(item.ipAddress);
      return;
    }
    if (action === "copy-id") {
      copyText(item.id);
      return;
    }
    if (action === "user") {
      const base = item.userType === "admin" ? "/admin/admins" : "/admin/customers";
      window.location.href = `${base}/${encodeURIComponent(item.userId || item.id)}`;
      return;
    }
    if (action === "full-log") {
      window.location.href = `/admin/activity/${encodeURIComponent(item.id)}`;
      return;
    }
    if (action === "export-one") {
      downloadJson(item, `activity-${item.id}.json`);
    }
  }

  function openActivityDrawer(item) {
    const drawer = $("[data-activity-drawer]");
    const content = $("[data-activity-drawer-content]");
    if (!drawer || !content) return;
    content.innerHTML = `
      <h2 id="activityDrawerTitle">تفاصيل النشاط</h2>
      <div class="admin-activity-detail">
        ${detailRow("معرف العملية", item.id)}
        ${detailRow("اسم المستخدم", item.userName)}
        ${detailRow("البريد", item.userEmail)}
        ${detailRow("نوع النشاط", item.actionLabel)}
        ${detailRow("الوصف الكامل", item.details)}
        ${detailRow("التاريخ والوقت", formatDate(item.createdAt))}
        ${detailRow("عنوان IP", item.ipAddress, "ltr")}
        ${detailRow("المتصفح", item.browser)}
        ${detailRow("نظام التشغيل", item.os)}
        ${detailRow("المسار", item.route, "ltr")}
      </div>
    `;
    drawer.hidden = false;
  }

  function detailRow(label, value, direction = "rtl") {
    return `<div><span>${label}</span><strong dir="${direction}">${escapeHtml(value)}</strong></div>`;
  }

  function closeActivityDrawer() {
    const drawer = $("[data-activity-drawer]");
    if (drawer) drawer.hidden = true;
  }

  function downloadJson(item, filename) {
    const blob = new Blob([JSON.stringify(item, null, 2)], { type: "application/json;charset=utf-8" });
    downloadBlob(blob, filename);
  }

  function downloadCsv() {
    const headers = ["id", "action", "user", "module", "description", "status", "ip", "createdAt"];
    const rows = filteredActivities.map((item) => [
      item.id,
      item.actionLabel,
      item.userName,
      item.moduleLabel,
      item.description,
      item.statusLabel,
      item.ipAddress,
      item.createdAt,
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    downloadBlob(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }), "advanced-pro-activity.csv");
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function bindFilters() {
    $("[data-activity-search]")?.addEventListener("input", applyFilters);
    $("[data-activity-user]")?.addEventListener("change", applyFilters);
    $("[data-activity-type]")?.addEventListener("change", applyFilters);
    $("[data-activity-status]")?.addEventListener("change", applyFilters);
    $("[data-export-activity]")?.addEventListener("click", downloadCsv);
  }

  async function loadActivities() {
    try {
      const payload = await requestJson("/api/admin/activity");
      return (payload.activities || []).map(normalizeActivity);
    } catch (error) {
      console.warn("Activity endpoint unavailable, using stats fallback:", error);
      const stats = await requestJson("/api/admin/stats").catch(() => ({}));
      return fallbackActivities(stats);
    }
  }

  async function init() {
    bindShell();
    bindFilters();

    const session = await requestJson("/api/admin/session").catch(() => null);
    if (!session?.admin) {
      window.location.href = loginPath();
      return;
    }
    renderProfile(session.admin);

    activities = await loadActivities();
    filteredActivities = activities.slice();
    renderFilters();
    renderStats();
    renderTable();
  }

  init().catch((error) => {
    const target = $("[data-activity-table]");
    if (target) target.innerHTML = `<div class="admin-v2-error">${escapeHtml(error.message || "تعذر تحميل سجل النشاط.")}</div>`;
  });
})();
