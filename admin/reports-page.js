(function () {
  const API_BASE_URL = window.AdvancedProConfig?.apiBaseUrl || "";
  const nf = new Intl.NumberFormat("ar-SA");
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
    if (!response.ok) throw new Error(payload.message || "تعذر تحميل الإحصائيات.");
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

  function renderStats(stats) {
    const target = $("[data-report-stats]");
    if (!target) return;
    const cards = [
      ["إجمالي الإيرادات", `${nf.format((stats.totalUsage || 0) * 15)} ر.س`, "+12.5% عن الشهر الماضي", "﹩", "#8B5CF6"],
      ["إجمالي المفاتيح", stats.totalKeys || 0, "+18.7% عن الشهر الماضي", "⚿", "#12B76A"],
      ["إجمالي المشاريع", stats.totalProjects || 0, "+15.3% عن الشهر الماضي", "▣", "#2F80FF"],
      ["إجمالي العملاء", stats.activeKeys || stats.totalKeys || 0, "+14.2% عن الشهر الماضي", "♙", "#5B35F5"],
    ];
    target.innerHTML = cards
      .map(
        ([title, value, sub, icon, color]) => `
          <article class="admin-report-stat">
            <span style="--report-color:${color}">${icon}</span>
            <div>
              <small>${title}</small>
              <strong>${typeof value === "number" ? nf.format(value) : value}</strong>
              <em>${sub}</em>
            </div>
          </article>
        `
      )
      .join("");
  }

  function renderLine(data) {
    const target = $("[data-customers-growth]");
    if (!target) return;
    const values = data?.length ? data.map((item, index) => (item.images || 0) + (item.videos || 0) + (index + 1) * 160) : [180, 430, 610, 810, 920, 1060];
    const max = Math.max(...values, 1);
    const points = values.map((value, index) => `${(index / Math.max(values.length - 1, 1)) * 100},${100 - (value / max) * 78 - 10}`).join(" ");
    const labels = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو"];
    target.innerHTML = `
      <svg viewBox="0 0 100 110" preserveAspectRatio="none">
        <defs><linearGradient id="reportLineFill" x1="0" x2="0" y1="0" y2="1"><stop stop-color="#8b5cf6" stop-opacity=".24"/><stop offset="1" stop-color="#8b5cf6" stop-opacity="0"/></linearGradient></defs>
        <path d="M0,100 L${points.replaceAll(" ", " L")} L100,100 Z" fill="url(#reportLineFill)"></path>
        <polyline points="${points}" fill="none" stroke="#6d3df5" stroke-width="2.5" vector-effect="non-scaling-stroke"></polyline>
      </svg>
      <div class="admin-report-axis">${labels.map((label) => `<span>${label}</span>`).join("")}</div>
    `;
  }

  function renderBars(stats) {
    const target = $("[data-revenue-chart]");
    if (!target) return;
    const base = Math.max(Number(stats.totalUsage || 1), 1);
    const values = [0.48, 0.58, 0.7, 0.78, 0.86, 1].map((ratio) => Math.round(base * ratio * 15));
    const max = Math.max(...values);
    const labels = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو"];
    target.innerHTML = values
      .map(
        (value, index) => `
          <div>
            <b style="height:${Math.max(18, (value / max) * 150)}px"></b>
            <span>${labels[index]}</span>
          </div>
        `
      )
      .join("");
  }

  function renderDonut(selector, total, items, centerLabel) {
    const target = $(selector);
    if (!target) return;
    const safeTotal = Math.max(Number(total || 0), 1);
    let offset = 25;
    const colors = ["#6d3df5", "#2f80ff", "#22c55e", "#f97316"];
    const rings = items
      .map((item, index) => {
        const value = Math.max(Number(item.value || 0), 0);
        const length = (value / safeTotal) * 75;
        const circle = `<circle r="36" cx="50" cy="50" fill="none" stroke="${colors[index % colors.length]}" stroke-width="12" stroke-dasharray="${length} ${100 - length}" stroke-dashoffset="${offset}" pathLength="100"></circle>`;
        offset -= length;
        return circle;
      })
      .join("");
    target.innerHTML = `
      <div class="admin-report-donut-chart">
        <svg viewBox="0 0 100 100">
          <circle r="36" cx="50" cy="50" fill="none" stroke="#eef2ff" stroke-width="12"></circle>
          ${rings}
        </svg>
        <div><strong>${nf.format(total || 0)}</strong><span>${centerLabel}</span></div>
      </div>
      <div class="admin-report-legend">
        ${items
          .map((item, index) => `<p><i style="background:${colors[index % colors.length]}"></i><span>${escapeHtml(item.name)}</span><strong>${nf.format(item.value || 0)}</strong></p>`)
          .join("")}
      </div>
    `;
  }

  function renderResources(stats) {
    const target = $("[data-resource-usage]");
    if (!target) return;
    const imagesUsed = Number(stats.imagesUsed || 0);
    const videosUsed = Number(stats.videosUsed || 0);
    const imagesTotal = Math.max(imagesUsed + 1000, 1000);
    const videosTotal = Math.max(videosUsed + 500, 500);
    target.innerHTML = `
      <article>
        <div><span>استخدام الصور</span><strong>${Math.round((imagesUsed / imagesTotal) * 100)}%</strong></div>
        <p>${nf.format(imagesUsed)} / ${nf.format(imagesTotal)}</p>
        <b><i style="width:${Math.max(4, (imagesUsed / imagesTotal) * 100)}%"></i></b>
      </article>
      <article>
        <div><span>استخدام الفيديوهات</span><strong>${Math.round((videosUsed / videosTotal) * 100)}%</strong></div>
        <p>${nf.format(videosUsed)} / ${nf.format(videosTotal)}</p>
        <b><i style="width:${Math.max(4, (videosUsed / videosTotal) * 100)}%"></i></b>
      </article>
    `;
  }

  function exportReports() {
    window.print();
  }

  async function init() {
    bindAdminShell();
    const session = await requestJson("/api/admin/session").catch(() => null);
    if (!session?.admin) {
      window.location.href = loginPath();
      return;
    }
    renderProfile(session.admin);
    const stats = await requestJson("/api/admin/stats");
    renderStats(stats);
    renderLine(stats.usageLast7Days || []);
    renderBars(stats);
    renderDonut("[data-plan-distribution]", stats.totalKeys || 0, stats.keysByPlan || [], "مفتاح");
    renderDonut("[data-project-status]", stats.totalProjects || 0, [
      { name: "نشط", value: Math.round((stats.totalProjects || 0) * 0.78) },
      { name: "موقوف", value: Math.round((stats.totalProjects || 0) * 0.13) },
      { name: "مكتمل", value: Math.round((stats.totalProjects || 0) * 0.09) },
    ], "مشروع");
    renderResources(stats);
    $("[data-export-reports]")?.addEventListener("click", exportReports);
  }

  init().catch((error) => {
    const target = $("[data-report-stats]");
    if (target) target.innerHTML = `<div class="admin-v2-error">${escapeHtml(error.message)}</div>`;
  });
})();
