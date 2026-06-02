(function () {
  const API_BASE_URL = window.AdvancedProConfig?.apiBaseUrl || "";

  const $ = (selector) => document.querySelector(selector);
  const nf = new Intl.NumberFormat("ar-SA");

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  async function requestJson(path) {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.message || "تعذر تحميل بيانات لوحة الأدمن.");
      error.payload = payload;
      throw error;
    }
    return payload;
  }

  function formatDate(value) {
    if (!value) return "غير محدد";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "غير محدد";
    return date.toLocaleDateString("ar-SA", {
      year: "numeric",
      month: "long",
      day: "numeric",
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

  function renderCards(stats) {
    const target = $("[data-admin-dashboard-cards]");
    if (!target) return;
    const items = [
      ["إجمالي المفاتيح", stats.totalKeys, "+12%", "up", "⚿"],
      ["المفاتيح النشطة", stats.activeKeys, "+8%", "up", "♢"],
      ["المفاتيح غير المستخدمة", stats.unusedKeys, "-4%", "down", "⌛"],
      ["المفاتيح المنتهية", stats.expiredKeys, "+5%", "up", "▣"],
      ["إجمالي الاستخدام", stats.totalUsage, "+21%", "up", "⌁"],
    ];

    target.innerHTML = items
      .map(
        ([label, value, change, direction, icon], index) => `
          <article class="admin-v2-stat ${index === 4 ? "is-featured" : ""}">
            <span class="admin-v2-stat__icon">${icon}</span>
            <small>${label}</small>
            <strong>${nf.format(Number(value || 0))}</strong>
            <em class="${direction === "up" ? "is-up" : "is-down"}">${change} عن الشهر الماضي</em>
          </article>
        `
      )
      .join("");
  }

  function renderDonut(stats) {
    const target = $("[data-admin-donut]");
    if (!target) return;
    const colors = ["#5B35F5", "#2F80FF", "#34D399", "#F59E0B"];
    const data = stats.keysByPlan?.length
      ? stats.keysByPlan
      : [
          { name: "باقة انطلاقة", value: 0 },
          { name: "باقة إبداع", value: 0 },
          { name: "باقة تميز", value: 0 },
          { name: "باقة احتراف", value: 0 },
        ];
    const total = data.reduce((sum, item) => sum + Number(item.value || 0), 0);

    let offset = 25;
    const circles = data
      .map((item, index) => {
        const portion = total ? (Number(item.value || 0) / total) * 100 : 0;
        const circle = `<circle r="42" cx="60" cy="60" fill="transparent" stroke="${colors[index % colors.length]}" stroke-width="16" stroke-dasharray="${portion} ${100 - portion}" stroke-dashoffset="${offset}" />`;
        offset -= portion;
        return circle;
      })
      .join("");

    target.innerHTML = `
      <div class="admin-v2-donut__chart">
        <svg viewBox="0 0 120 120" role="img" aria-label="توزيع المفاتيح حسب الباقة">
          <circle r="42" cx="60" cy="60" fill="transparent" stroke="#EEF2FF" stroke-width="16" />
          ${circles}
        </svg>
        <div>
          <strong>${nf.format(total)}</strong>
          <span>إجمالي</span>
        </div>
      </div>
      <div class="admin-v2-donut__legend">
        ${data
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

  function pointsFor(data, field) {
    const values = data.map((item) => Number(item[field] || 0));
    const max = Math.max(...values, 1);
    return values
      .map((value, index) => {
        const x = 38 + index * 86;
        const y = 170 - (value / max) * 118;
        return `${x},${y}`;
      })
      .join(" ");
  }

  function renderLineChart(stats) {
    const target = $("[data-admin-line-chart]");
    if (!target) return;
    const data = stats.usageLast7Days || [];
    if (!data.length) {
      target.innerHTML = `<div class="admin-v2-empty">لا توجد بيانات استخدام حتى الآن.</div>`;
      return;
    }

    target.innerHTML = `
      <svg viewBox="0 0 620 220" role="img" aria-label="نمو الاستخدام خلال آخر 7 أيام">
        <defs>
          <linearGradient id="adminLineFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stop-color="#5B35F5" stop-opacity=".16" />
            <stop offset="100%" stop-color="#5B35F5" stop-opacity="0" />
          </linearGradient>
        </defs>
        <g stroke="#EEF2FF" stroke-width="1">
          <line x1="30" y1="50" x2="600" y2="50" />
          <line x1="30" y1="100" x2="600" y2="100" />
          <line x1="30" y1="150" x2="600" y2="150" />
        </g>
        <polyline points="${pointsFor(data, "images")}" fill="none" stroke="#5B35F5" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
        <polyline points="${pointsFor(data, "videos")}" fill="none" stroke="#2F80FF" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
        ${data
          .map(
            (item, index) => `
              <text x="${38 + index * 86}" y="205" text-anchor="middle" fill="#667085" font-size="12">${escapeHtml(item.label)}</text>
            `
          )
          .join("")}
      </svg>
      <div class="admin-v2-chart-legend">
        <span><i style="background:#5B35F5"></i> الصور</span>
        <span><i style="background:#2F80FF"></i> الفيديوهات</span>
      </div>
    `;
  }

  function statusClass(status) {
    return {
      active: "is-active",
      unused: "is-unused",
      expired: "is-expired",
      disabled: "is-disabled",
    }[status] || "is-unused";
  }

  function renderLatestKeys(stats) {
    const target = $("[data-admin-latest-keys]");
    if (!target) return;
    const keys = stats.latestKeys || [];
    if (!keys.length) {
      target.innerHTML = `<div class="admin-v2-empty">لا توجد مفاتيح مضافة حتى الآن.</div>`;
      return;
    }

    target.innerHTML = `
      <div class="admin-v2-table-wrap">
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
              .map(
                (key) => `
                  <tr>
                    <td><strong>${escapeHtml(key.code)}</strong></td>
                    <td>${escapeHtml(key.customer)}</td>
                    <td>${escapeHtml(key.plan)}</td>
                    <td>${formatDate(key.expiresAt)}</td>
                    <td><span class="admin-v2-status ${statusClass(key.status)}">${escapeHtml(key.statusLabel)}</span></td>
                    <td>
                      <div class="admin-v2-row-actions">
                        <button type="button" data-copy-key="${escapeHtml(key.code)}">نسخ</button>
                        <a href="/admin/keys">تعديل</a>
                        <a href="/admin/keys">تعطيل</a>
                        <a href="/admin/keys">حذف</a>
                      </div>
                    </td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderUsage(stats) {
    const target = $("[data-admin-usage-totals]");
    if (!target) return;
    const items = [
      ["الصور المستخدمة", stats.imagesUsed],
      ["الفيديوهات المستخدمة", stats.videosUsed],
      ["متوسط الصور يوميًا", stats.averageImagesPerDay],
      ["متوسط الفيديوهات يوميًا", stats.averageVideosPerDay],
      ["إجمالي المشاريع", stats.totalProjects],
      ["معدل النجاح", `${stats.successRate}%`],
    ];

    target.innerHTML = items
      .map(
        ([label, value]) => `
          <div>
            <span>${label}</span>
            <strong>${typeof value === "number" ? nf.format(value) : escapeHtml(value)}</strong>
          </div>
        `
      )
      .join("");
  }

  function renderActivity(stats) {
    const target = $("[data-admin-activity]");
    if (!target) return;
    const items = stats.recentActivity || [];
    if (!items.length) {
      target.innerHTML = `<div class="admin-v2-empty">لا يوجد نشاط حديث حتى الآن.</div>`;
      return;
    }

    target.innerHTML = items
      .map(
        (item) => `
          <article>
            <span>${item.type?.includes("video") ? "▣" : item.type?.includes("image") ? "▧" : "⚿"}</span>
            <div>
              <strong>${escapeHtml(item.title)}</strong>
              <small>${escapeHtml(item.description)} · ${formatDate(item.createdAt)}</small>
            </div>
          </article>
        `
      )
      .join("");
  }

  async function init() {
    const sidebar = $("#adminSidebar");
    document.addEventListener("click", (event) => {
      const toggle = event.target.closest("[data-admin-drawer-toggle]");
      if (toggle) sidebar?.classList.toggle("is-open");
      if (event.target === sidebar) sidebar.classList.remove("is-open");

      const copyButton = event.target.closest("[data-copy-key]");
      if (copyButton) {
        navigator.clipboard?.writeText(copyButton.dataset.copyKey || "");
        copyButton.textContent = "تم النسخ";
        setTimeout(() => {
          copyButton.textContent = "نسخ";
        }, 1200);
      }
    });

    try {
      const [session, stats] = await Promise.all([
        requestJson("/api/admin/session").catch(() => null),
        requestJson("/api/admin/stats"),
      ]);
      renderProfile(session?.admin);
      renderCards(stats);
      renderDonut(stats);
      renderLineChart(stats);
      renderLatestKeys(stats);
      renderUsage(stats);
      renderActivity(stats);
    } catch (error) {
      const main = $(".admin-v2-main");
      if (main) {
        main.insertAdjacentHTML(
          "afterbegin",
          `<div class="admin-v2-error">${escapeHtml(error.message)}</div>`
        );
      }
    }
  }

  init();
})();
