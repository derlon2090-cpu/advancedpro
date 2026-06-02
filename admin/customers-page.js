(function () {
  const API_BASE_URL = window.AdvancedProConfig?.apiBaseUrl || "";
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

  function buildCustomerRows(keys) {
    const customers = new Map();
    keys.forEach((key) => {
      const name = key.customerName || "عميل بدون اسم";
      const email = key.customerEmail || "بدون بريد";
      const id = `${name}::${email}`;
      const current = customers.get(id) || {
        name,
        email,
        keys: 0,
        active: 0,
        images: 0,
        videos: 0,
        latestExpiresAt: key.expiresAt,
      };
      current.keys += 1;
      if (key.status === "active") current.active += 1;
      current.images += Math.max(0, Number(key.imagesLimit || 0) - Number(key.imagesUsed || 0));
      current.videos += Math.max(0, Number(key.videosLimit || 0) - Number(key.videosUsed || 0));
      if (key.expiresAt && (!current.latestExpiresAt || new Date(key.expiresAt) > new Date(current.latestExpiresAt))) {
        current.latestExpiresAt = key.expiresAt;
      }
      customers.set(id, current);
    });
    return Array.from(customers.values());
  }

  function formatDate(value) {
    if (!value) return "غير محدد";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "غير محدد";
    return date.toLocaleDateString("ar-SA", { year: "numeric", month: "2-digit", day: "2-digit" });
  }

  function renderCustomers(customers) {
    const target = $("[data-admin-customers-table]");
    if (!target) return;
    const search = String($("[data-customer-search]")?.value || "").trim().toLowerCase();
    const filtered = customers.filter(
      (customer) =>
        !search || customer.name.toLowerCase().includes(search) || customer.email.toLowerCase().includes(search)
    );

    if (!filtered.length) {
      target.innerHTML = `<div class="admin-v2-empty">لا يوجد عملاء مطابقون.</div>`;
      return;
    }

    target.innerHTML = `
      <div class="admin-v2-table-wrap">
        <table class="admin-v2-table admin-keys-table">
          <thead>
            <tr>
              <th>العميل</th>
              <th>البريد</th>
              <th>عدد المفاتيح</th>
              <th>المفاتيح النشطة</th>
              <th>رصيد الصور</th>
              <th>رصيد الفيديو</th>
              <th>أقرب انتهاء</th>
            </tr>
          </thead>
          <tbody>
            ${filtered
              .map(
                (customer) => `
                  <tr>
                    <td>
                      <div class="admin-key-customer">
                        <span>${escapeHtml(customer.name.charAt(0))}</span>
                        <div><strong>${escapeHtml(customer.name)}</strong></div>
                      </div>
                    </td>
                    <td>${escapeHtml(customer.email)}</td>
                    <td>${customer.keys}</td>
                    <td><span class="admin-v2-status is-active">${customer.active}</span></td>
                    <td>${customer.images}</td>
                    <td>${customer.videos}</td>
                    <td>${formatDate(customer.latestExpiresAt)}</td>
                  </tr>
                `
              )
              .join("")}
          </tbody>
        </table>
      </div>
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

    const payload = await requestJson("/api/admin/keys");
    const customers = buildCustomerRows(payload.keys || []);
    renderCustomers(customers);
    $("[data-customer-search]")?.addEventListener("input", () => renderCustomers(customers));
  }

  init().catch((error) => {
    const target = $("[data-admin-customers-table]");
    if (target) target.innerHTML = `<div class="admin-v2-error">${escapeHtml(error.message)}</div>`;
  });
})();
