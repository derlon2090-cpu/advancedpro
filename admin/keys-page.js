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
    const configured = String(window.AdvancedProConfig?.adminSecretPath || "advanced-pro-control")
      .replace(/^\/+|\/+$/g, "");
    return `/${configured || "advanced-pro-control"}`;
  }

  async function logout() {
    try {
      await fetch(`${API_BASE_URL}/api/admin/logout`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
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

  async function requestJson(path) {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      credentials: "include",
      headers: { "Content-Type": "application/json" },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.message || "تعذر تحميل بيانات المفاتيح.");
    }
    return payload;
  }

  function formatDate(value) {
    if (!value) return "غير محدد";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "غير محدد";
    return date.toLocaleDateString("ar-SA", { year: "numeric", month: "2-digit", day: "2-digit" });
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

  function renderSummary(summary) {
    const target = $("[data-keys-summary]");
    if (!target) return;
    const total = Number(summary.total || 0) || 1;
    const cards = [
      ["إجمالي المفاتيح", summary.total, "#2F80FF", "▣"],
      ["المفاتيح المنتهية", summary.expired, "#EF4444", "⌛"],
      ["المفاتيح غير المستخدمة", summary.unused, "#F59E0B", "⧖"],
      ["المفاتيح النشطة", summary.active, "#12B76A", "✓"],
    ];
    target.innerHTML = cards
      .map(([label, value, color, icon]) => {
        const percent = Math.round((Number(value || 0) / total) * 100);
        return `
          <article class="admin-key-summary-card">
            <span style="--summary-color:${color}">${icon}</span>
            <small>${label}</small>
            <strong>${nf.format(Number(value || 0))}</strong>
            <em>${percent}% من إجمالي المفاتيح</em>
            <b><i style="width:${Math.max(percent, 4)}%; background:${color}"></i></b>
          </article>
        `;
      })
      .join("");
  }

  function statusClass(status) {
    return {
      active: "is-active",
      unused: "is-unused",
      expired: "is-expired",
      disabled: "is-disabled",
    }[status] || "is-unused";
  }

  function renderTable(keys) {
    const target = $("[data-admin-keys-table]");
    if (!target) return;
    if (!keys.length) {
      target.innerHTML = `<div class="admin-v2-empty">لا توجد مفاتيح مطابقة.</div>`;
      return;
    }

    target.innerHTML = `
      <div class="admin-v2-table-wrap">
        <table class="admin-v2-table admin-keys-table">
          <thead>
            <tr>
              <th>الكود</th>
              <th>العميل</th>
              <th>الباقة</th>
              <th>الحد</th>
              <th>تاريخ الإنشاء</th>
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
                    <td>
                      <strong>${escapeHtml(key.code)}</strong>
                      <button class="admin-key-copy" type="button" data-copy-key="${escapeHtml(key.code)}">⧉</button>
                    </td>
                    <td>
                      <div class="admin-key-customer">
                        <span>${escapeHtml((key.customerName || "ع").charAt(0))}</span>
                        <div>
                          <strong>${escapeHtml(key.customerName)}</strong>
                          <small>${escapeHtml(key.customerEmail || "بدون بريد")}</small>
                        </div>
                      </div>
                    </td>
                    <td><span class="admin-key-plan-pill">${escapeHtml(key.planName)}</span></td>
                    <td>${nf.format(Number(key.imagesLimit || 0))} صور<br />${nf.format(Number(key.videosLimit || 0))} فيديو</td>
                    <td>${formatDate(key.createdAt)}</td>
                    <td>${formatDate(key.expiresAt)}</td>
                    <td><span class="admin-v2-status ${statusClass(key.status)}">${escapeHtml(key.statusLabel)}</span></td>
                    <td><button class="admin-key-more" type="button">•••</button></td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function applyFilters(keys) {
    const search = String($("[data-key-search]")?.value || "").trim().toLowerCase();
    const status = String($("[data-key-status]")?.value || "all");
    return keys.filter((key) => {
      const matchesSearch =
        !search ||
        key.code.toLowerCase().includes(search) ||
        String(key.customerName || "").toLowerCase().includes(search) ||
        String(key.customerEmail || "").toLowerCase().includes(search);
      const matchesStatus = status === "all" || key.status === status;
      return matchesSearch && matchesStatus;
    });
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
    let keys = payload.keys || [];
    renderSummary(payload.summary || {});
    renderTable(keys);

    const rerender = () => renderTable(applyFilters(keys));
    $("[data-key-search]")?.addEventListener("input", rerender);
    $("[data-key-status]")?.addEventListener("change", rerender);
    $("[data-keys-refresh]")?.addEventListener("click", () => {
      if ($("[data-key-search]")) $("[data-key-search]").value = "";
      if ($("[data-key-status]")) $("[data-key-status]").value = "all";
      renderTable(keys);
    });

    document.addEventListener("click", (event) => {
      const copy = event.target.closest("[data-copy-key]");
      if (!copy) return;
      navigator.clipboard?.writeText(copy.dataset.copyKey || "");
      copy.textContent = "✓";
      setTimeout(() => {
        copy.textContent = "⧉";
      }, 1000);
    });
  }

  init().catch((error) => {
    const target = $("[data-admin-keys-table]");
    if (target) target.innerHTML = `<div class="admin-v2-error">${escapeHtml(error.message)}</div>`;
  });
})();
