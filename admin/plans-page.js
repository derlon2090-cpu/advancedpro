(function () {
  const API_BASE_URL = window.AdvancedProConfig?.apiBaseUrl || "";
  const nf = new Intl.NumberFormat("ar-SA");
  const $ = (selector) => document.querySelector(selector);

  let plans = [];
  let keys = [];

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

      const actionButton = event.target.closest("[data-plan-actions]");
      document.querySelectorAll(".admin-plan-menu.is-open").forEach((menu) => {
        if (!actionButton || menu !== actionButton.nextElementSibling) menu.classList.remove("is-open");
      });
      if (actionButton) {
        actionButton.nextElementSibling?.classList.toggle("is-open");
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

  function subscribersForPlan(plan) {
    const planName = String(plan.name || "").trim();
    return keys.filter((key) => String(key.planName || "").trim() === planName).length;
  }

  function renderStats() {
    const target = $("[data-plan-stats]");
    if (!target) return;
    const total = plans.length;
    const active = plans.filter((plan) => plan.isActive !== false).length;
    const disabled = Math.max(0, total - active);
    const customers = keys.filter((key) => key.customerName || key.customerEmail).length;
    const cards = [
      ["إجمالي الباقات", total, "باقة", "◈", "#5B35F5"],
      ["الباقات النشطة", active, "نشطة", "✓", "#12B76A"],
      ["الباقات المعطلة", disabled, "معطلة", "Ⅱ", "#F97316"],
      ["إجمالي العملاء المشتركين", customers, "عميل", "▥", "#8B5CF6"],
    ];
    target.innerHTML = cards
      .map(
        ([label, value, caption, icon, color]) => `
          <article class="admin-plan-stat">
            <span style="--plan-stat-color:${color}">${icon}</span>
            <div>
              <small>${label}</small>
              <strong>${nf.format(Number(value || 0))}</strong>
              <em>${caption}</em>
            </div>
          </article>
        `
      )
      .join("");
  }

  function filteredPlans() {
    const search = String($("[data-plan-search]")?.value || "").trim().toLowerCase();
    const status = String($("[data-plan-status]")?.value || "all");
    return plans.filter((plan) => {
      const active = plan.isActive !== false;
      const matchesSearch =
        !search ||
        String(plan.name || "").toLowerCase().includes(search) ||
        String(plan.description || "").toLowerCase().includes(search);
      const matchesStatus = status === "all" || (status === "active" ? active : !active);
      return matchesSearch && matchesStatus;
    });
  }

  function renderTable() {
    const target = $("[data-plans-table]");
    if (!target) return;
    const rows = filteredPlans();
    if (!rows.length) {
      target.innerHTML = `<div class="admin-v2-empty">لا توجد باقات مطابقة.</div>`;
      return;
    }

    target.innerHTML = `
      <div class="admin-v2-table-wrap">
        <table class="admin-v2-table admin-plan-table">
          <thead>
            <tr>
              <th>اسم الباقة</th>
              <th>الوصف</th>
              <th>حد الصور</th>
              <th>حد الفيديوهات</th>
              <th>مدة الصلاحية</th>
              <th>السعر</th>
              <th>الحالة</th>
              <th>الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            ${rows
              .map((plan, index) => {
                const active = plan.isActive !== false;
                return `
                  <tr>
                    <td>
                      <div class="admin-plan-name">
                        <span>${["↗", "★", "◇", "♕"][index % 4]}</span>
                        <div>
                          <strong>${escapeHtml(plan.name)}</strong>
                          <small>${nf.format(subscribersForPlan(plan))} عميل</small>
                        </div>
                      </div>
                    </td>
                    <td>${escapeHtml(plan.description || "باقة مرنة لإدارة الرصيد")}</td>
                    <td>${nf.format(Number(plan.imagesLimit || 0))} صورة</td>
                    <td>${nf.format(Number(plan.videosLimit || 0))} فيديو</td>
                    <td>${nf.format(Number(plan.validityDays || 0))} يوم</td>
                    <td>${nf.format(Number(plan.price || 0))} ر.س</td>
                    <td><span class="admin-plan-status ${active ? "is-active" : "is-disabled"}">${active ? "نشطة" : "معطلة"}</span></td>
                    <td>
                      <div class="admin-plan-actions">
                        <button type="button" data-plan-actions aria-label="إجراءات الباقة">⋮</button>
                        <div class="admin-plan-menu">
                          <button type="button">تعديل</button>
                          <button type="button">نسخ الباقة</button>
                          <button type="button">${active ? "تعطيل" : "تفعيل"}</button>
                          <button type="button" class="is-danger">حذف</button>
                        </div>
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

  function exportPlans() {
    const csv = [
      ["name", "description", "images", "videos", "validityDays", "price", "status"],
      ...filteredPlans().map((plan) => [
        plan.name,
        plan.description || "",
        plan.imagesLimit,
        plan.videosLimit,
        plan.validityDays,
        plan.price,
        plan.isActive !== false ? "active" : "disabled",
      ]),
    ]
      .map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "advancedpro-plans.csv";
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

    const [plansPayload, keysPayload] = await Promise.all([
      requestJson("/api/admin/plans"),
      requestJson("/api/admin/keys").catch(() => ({ keys: [] })),
    ]);
    plans = plansPayload.plans || [];
    keys = keysPayload.keys || [];
    renderStats();
    renderTable();

    $("[data-plan-search]")?.addEventListener("input", renderTable);
    $("[data-plan-status]")?.addEventListener("change", renderTable);
    $("[data-export-plans]")?.addEventListener("click", exportPlans);
  }

  init().catch((error) => {
    const target = $("[data-plans-table]");
    if (target) target.innerHTML = `<div class="admin-v2-error">${escapeHtml(error.message)}</div>`;
  });
})();
