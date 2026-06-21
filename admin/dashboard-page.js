(function () {
  const API_BASE_URL = window.AdvancedProConfig?.apiBaseUrl || "";
  const nf = new Intl.NumberFormat("ar-SA");
  const $ = (selector) => document.querySelector(selector);

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
      cache: "no-store",
      ...options,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || "تعذر تحميل بيانات لوحة الأدمن.");
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
    const name = admin.name || admin.fullName || admin.email || "الأدمن";
    const role = admin.role || "Owner";
    target.innerHTML = `
      <span class="admin-v2-avatar">${escapeHtml(name.trim().charAt(0) || "A")}</span>
      <div>
        <strong>مرحبًا، ${escapeHtml(name)}</strong>
        <small>${escapeHtml(role)}</small>
      </div>
    `;
  }

  function formatDate(value) {
    if (!value) return "غير محدد";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "غير محدد";
    return new Intl.DateTimeFormat("ar-SA", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(date);
  }

  function statusInfo(status) {
    const normalized = String(status || "unused").toLowerCase();
    if (normalized === "active") return { label: "نشط", className: "is-active" };
    if (normalized === "expired") return { label: "منتهي", className: "is-expired" };
    if (normalized === "disabled") return { label: "معطل", className: "is-disabled" };
    return { label: "غير مستخدم", className: "is-unused" };
  }

  function renderStats(stats) {
    const target = $("[data-admin-dashboard-stats]");
    if (!target) return;
    const cards = [
      ["إجمالي المفاتيح", stats.totalKeys || 0, "+12% عن الشهر الماضي", "⚿", ""],
      ["المفاتيح النشطة", stats.activeKeys || 0, "+8% عن الشهر الماضي", "✓", ""],
      ["المفاتيح غير المستخدمة", stats.unusedKeys || 0, "-4% عن الشهر الماضي", "⌛", ""],
      ["المفاتيح المنتهية", stats.expiredKeys || 0, "+5% عن الشهر الماضي", "⏱", ""],
      ["إجمالي XP المستخدم", stats.xpUsed || stats.totalUsage || 0, "رصيد التوليد المستهلك", "〽", "is-featured"],
    ];

    target.innerHTML = cards
      .map(
        ([title, value, sub, icon, featured], index) => `
          <article class="admin-v2-stat ${featured}">
            <span class="admin-v2-stat__icon">${icon}</span>
            <small>${escapeHtml(title)}</small>
            <strong>${nf.format(Number(value || 0))}</strong>
            <em class="${index === 2 ? "is-down" : "is-up"}">${escapeHtml(sub)}</em>
          </article>
        `
      )
      .join("");
  }

  function renderDonut(stats) {
    const target = $("[data-admin-plan-donut]");
    if (!target) return;
    const items = Array.isArray(stats.keysByPlan) && stats.keysByPlan.length
      ? stats.keysByPlan
      : [
          { name: "باقة انطلاقة", value: stats.unusedKeys || 0 },
          { name: "باقة إبداع", value: stats.activeKeys || 0 },
          { name: "باقة تميز", value: stats.expiredKeys || 0 },
        ];
    const total = Math.max(items.reduce((sum, item) => sum + Number(item.value || 0), 0), 1);
    const colors = ["#6d3df5", "#2f80ff", "#22c55e", "#f97316", "#ec4899"];
    let offset = 25;
    const rings = items
      .map((item, index) => {
        const value = Math.max(Number(item.value || 0), 0);
        const length = (value / total) * 75;
        const circle = `<circle r="36" cx="50" cy="50" fill="none" stroke="${
          colors[index % colors.length]
        }" stroke-width="12" stroke-dasharray="${length} ${100 - length}" stroke-dashoffset="${offset}" pathLength="100"></circle>`;
        offset -= length;
        return circle;
      })
      .join("");

    target.innerHTML = `
      <div class="admin-v2-donut__chart">
        <svg viewBox="0 0 100 100">
          <circle r="36" cx="50" cy="50" fill="none" stroke="#eef2ff" stroke-width="12"></circle>
          ${rings}
        </svg>
        <div>
          <strong>${nf.format(total)}</strong>
          <span>إجمالي</span>
        </div>
      </div>
      <div class="admin-v2-donut__legend">
        ${items
          .map(
            (item, index) => `
              <p>
                <i style="background:${colors[index % colors.length]}"></i>
                <span>${escapeHtml(item.name)}</span>
                <strong>${nf.format(Number(item.value || 0))}</strong>
              </p>
            `
          )
          .join("")}
      </div>
    `;
  }

  function renderLine(stats) {
    const target = $("[data-admin-usage-chart]");
    if (!target) return;
    const days = Array.isArray(stats.usageLast7Days) && stats.usageLast7Days.length ? stats.usageLast7Days : [];
    const values = days.length
      ? days.map((item) => Number(item.images || 0) + Number(item.videos || 0))
      : [0, 12, 18, 24, 31, 37, 44];
    const max = Math.max(...values, 1);
    const points = values
      .map((value, index) => `${(index / Math.max(values.length - 1, 1)) * 100},${100 - (value / max) * 74 - 12}`)
      .join(" ");
    const labels = days.length ? days.map((item) => item.label || item.day || "") : ["1", "2", "3", "4", "5", "6", "7"];

    target.innerHTML = `
      <svg viewBox="0 0 100 110" preserveAspectRatio="none">
        <defs>
          <linearGradient id="adminDashboardLineFill" x1="0" x2="0" y1="0" y2="1">
            <stop stop-color="#6d3df5" stop-opacity=".22" />
            <stop offset="1" stop-color="#6d3df5" stop-opacity="0" />
          </linearGradient>
        </defs>
        <path d="M0,100 L${points.replaceAll(" ", " L")} L100,100 Z" fill="url(#adminDashboardLineFill)"></path>
        <polyline points="${points}" fill="none" stroke="#6d3df5" stroke-width="2.5" vector-effect="non-scaling-stroke"></polyline>
      </svg>
      <div class="admin-v2-chart-legend">
        <span><i style="background:#6d3df5"></i>الصور والفيديوهات</span>
      </div>
      <div class="admin-report-axis">${labels.map((label) => `<span>${escapeHtml(label)}</span>`).join("")}</div>
    `;
  }

  function renderLatestKeys(keys) {
    const target = $("[data-admin-latest-keys]");
    if (!target) return;
    if (!Array.isArray(keys) || keys.length === 0) {
      target.innerHTML = `<div class="admin-v2-empty">لا توجد مفاتيح مضافة حتى الآن.</div>`;
      return;
    }

    target.innerHTML = `
      <table class="admin-v2-table">
        <thead>
          <tr>
            <th>الكود</th>
            <th>العميل</th>
            <th>الباقة</th>
            <th>تاريخ الانتهاء</th>
            <th>الحالة</th>
            <th>الإجراءات</th>
          </tr>
        </thead>
        <tbody>
          ${keys
            .map((key) => {
              const status = statusInfo(key.status);
              return `
                <tr>
                  <td>${escapeHtml(key.code || "-")}</td>
                  <td>${escapeHtml(key.customer || key.ownerName || "عميل غير محدد")}</td>
                  <td>${escapeHtml(key.plan || key.planName || "باقة")}</td>
                  <td>${formatDate(key.expiresAt)}</td>
                  <td><span class="admin-v2-status ${status.className}">${status.label}</span></td>
                  <td>
                    <div class="admin-v2-row-actions">
                      <button type="button" data-copy-key="${escapeHtml(key.code || "")}">نسخ</button>
                      <a href="/admin/keys">تعديل</a>
                    </div>
                  </td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    `;
  }

  function renderUsage(stats) {
    const target = $("[data-admin-usage-summary]");
    if (!target) return;
    const items = [
      ["XP المستخدم", stats.xpUsed || stats.totalUsage || 0],
      ["عمليات التوليد المكتملة", (stats.imagesUsed || 0) + (stats.videosUsed || 0)],
      ["إجمالي المشاريع", stats.totalProjects || 0],
      ["معدل النجاح", `${stats.successRate ?? 100}%`],
    ];
    target.innerHTML = items
      .map(
        ([label, value]) => `
          <div>
            <span>${escapeHtml(label)}</span>
            <strong>${typeof value === "number" ? nf.format(value) : escapeHtml(value)}</strong>
          </div>
        `
      )
      .join("");
  }

  function renderActivity(items) {
    const target = $("[data-admin-activity]");
    if (!target) return;
    const activities = Array.isArray(items) && items.length
      ? items
      : [
          { action: "تم إنشاء مفتاح جديد", description: "بانتظار أول نشاط" },
          { action: "تم تفعيل مفتاح", description: "سيظهر النشاط الحقيقي هنا" },
        ];

    target.innerHTML = activities
      .slice(0, 6)
      .map(
        (item) => `
          <article>
            <span>•</span>
            <div>
              <strong>${escapeHtml(item.action || item.title || "نشاط")}</strong>
              <small>${escapeHtml(item.description || item.module || "عملية داخل النظام")}</small>
            </div>
          </article>
        `
      )
      .join("");
  }

  function bindCopyButtons() {
    document.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-copy-key]");
      if (!button) return;
      const code = button.dataset.copyKey || "";
      try {
        await navigator.clipboard.writeText(code);
        button.textContent = "تم النسخ";
        setTimeout(() => {
          button.textContent = "نسخ";
        }, 1200);
      } catch (error) {
        button.textContent = "تعذر النسخ";
      }
    });
  }

  async function init() {
    bindAdminShell();
    bindCopyButtons();
    $("[data-export-dashboard]")?.addEventListener("click", () => window.print());

    const session = await requestJson("/api/admin/session").catch(() => null);
    if (!session?.admin) {
      window.location.href = loginPath();
      return;
    }
    renderProfile(session.admin);

    const stats = await requestJson("/api/admin/stats");
    renderStats(stats);
    renderDonut(stats);
    renderLine(stats);
    renderLatestKeys(stats.latestKeys || []);
    renderUsage(stats);
    renderActivity(stats.recentActivity || []);
  }

  init().catch((error) => {
    const target = $("[data-admin-dashboard-stats]");
    if (target) {
      target.innerHTML = `<div class="admin-v2-error">${escapeHtml(error.message)}</div>`;
    }
  });
})();
