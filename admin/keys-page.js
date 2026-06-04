(function () {
  const API_BASE_URL = window.AdvancedProConfig?.apiBaseUrl || "";
  const nf = new Intl.NumberFormat("ar-SA");
  let allKeys = [];

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
    if (!response.ok) {
      throw new Error(payload.message || "تعذر تنفيذ الطلب.");
    }
    return payload;
  }

  function formatDate(value) {
    if (!value) return "غير محدد";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "غير محدد";
    return date.toLocaleDateString("ar-SA", { year: "numeric", month: "2-digit", day: "2-digit" });
  }

  function formatDateTime(value) {
    if (!value) return "لا يوجد";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "لا يوجد";
    return date.toLocaleString("ar-SA", { dateStyle: "medium", timeStyle: "short" });
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
      approved: "is-active",
      review: "is-unused",
    }[status] || "is-unused";
  }

  function menuItemsForStatus(status) {
    const base = [
      ["details", "👁", "عرض التفاصيل", ""],
      ["copy", "📋", "نسخ الكود", ""],
    ];

    if (status === "active") {
      base.push(["disable", "⏸", "تعطيل", "is-warning"]);
    } else if (status === "disabled") {
      base.push(["activate", "▶", "تنشيط", "is-success"]);
    } else if (status === "unused" || status === "review") {
      base.push(["approve", "☑", "اعتماد", ""]);
      base.push(["activate", "▶", "تنشيط", "is-success"]);
    } else {
      base.push(["activate", "▶", "تنشيط", "is-success"]);
    }

    base.push(["edit-limit", "✎", "تعديل الرصيد", ""]);
    base.push(["delete", "🗑", "حذف", "is-danger"]);
    return base;
  }

  function renderActionsMenu(key) {
    return `
      <div class="admin-key-actions-menu" data-key-menu>
        ${menuItemsForStatus(key.status)
          .map(
            ([action, icon, label, className]) => `
              <button type="button" class="${className}" data-key-action="${action}" data-key-id="${key.id}">
                <span>${icon}</span>
                ${label}
              </button>
            `
          )
          .join("")}
      </div>
    `;
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
                    <td><strong>${nf.format(Number(key.xpBalance || key.balance || 0))}</strong> XP</td>
                    <td>${formatDate(key.createdAt)}</td>
                    <td>${formatDate(key.expiresAt)}</td>
                    <td><span class="admin-v2-status ${statusClass(key.status)}">${escapeHtml(key.statusLabel)}</span></td>
                    <td class="admin-key-actions-cell">
                      <button class="admin-key-more" type="button" data-key-menu-toggle="${key.id}" aria-label="إجراءات الكود">•••</button>
                      ${renderActionsMenu(key)}
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

  function rerenderKeys() {
    renderTable(applyFilters(allKeys));
  }

  function findKey(id) {
    return allKeys.find((item) => Number(item.id) === Number(id));
  }

  function toast(text, type = "success") {
    let element = document.querySelector("[data-admin-key-toast]");
    if (!element) {
      element = document.createElement("div");
      element.className = "admin-key-toast";
      element.dataset.adminKeyToast = "true";
      document.body.appendChild(element);
    }
    element.textContent = text;
    element.dataset.type = type;
    element.classList.add("is-visible");
    setTimeout(() => element.classList.remove("is-visible"), 2200);
  }

  async function copyText(value) {
    try {
      await navigator.clipboard?.writeText(value);
    } catch (error) {
      const input = document.createElement("input");
      input.value = value;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      input.remove();
    }
  }

  function closeModal() {
    const modal = document.querySelector("[data-key-action-modal]");
    if (modal) modal.hidden = true;
  }

  function modalShell(title, body) {
    let modal = document.querySelector("[data-key-action-modal]");
    if (!modal) {
      modal = document.createElement("div");
      modal.className = "admin-key-action-modal";
      modal.dataset.keyActionModal = "true";
      document.body.appendChild(modal);
    }
    modal.innerHTML = `
      <section role="dialog" aria-modal="true">
        <button type="button" data-key-modal-close aria-label="إغلاق">×</button>
        <h2>${title}</h2>
        <div class="admin-key-action-modal__body">${body}</div>
      </section>
    `;
    modal.hidden = false;
  }

  function openDetails(key) {
    modalShell(
      "عرض التفاصيل",
      `
        <dl class="admin-key-details-grid">
          <div><dt>الكود</dt><dd dir="ltr">${escapeHtml(key.code)}</dd></div>
          <div><dt>العميل</dt><dd>${escapeHtml(key.customerName || "غير محدد")}</dd></div>
          <div><dt>الباقة</dt><dd>${escapeHtml(key.planName || "--")}</dd></div>
          <div><dt>الرصيد</dt><dd>${nf.format(Number(key.xpBalance || key.balance || 0))} XP</dd></div>
          <div><dt>تاريخ الإنشاء</dt><dd>${formatDateTime(key.createdAt)}</dd></div>
          <div><dt>تاريخ الانتهاء</dt><dd>${formatDateTime(key.expiresAt)}</dd></div>
          <div><dt>الحالة</dt><dd>${escapeHtml(key.statusLabel || key.status)}</dd></div>
          <div><dt>المستخدم</dt><dd>${nf.format(Number(key.imagesUsed || 0))} صور / ${nf.format(Number(key.videosUsed || 0))} فيديو</dd></div>
          <div><dt>آخر استخدام</dt><dd>${formatDateTime(key.lastUsage)}</dd></div>
        </dl>
      `
    );
  }

  function openConfirm({ title, message, confirmText, danger = false, onConfirm }) {
    modalShell(
      title,
      `
        <p>${message}</p>
        <div class="admin-key-modal-actions">
          <button type="button" class="${danger ? "is-danger" : "is-primary"}" data-key-confirm-action>${confirmText}</button>
          <button type="button" data-key-modal-close>إلغاء</button>
        </div>
      `
    );
    document.querySelector("[data-key-confirm-action]")?.addEventListener("click", onConfirm, { once: true });
  }

  function openEditLimit(key) {
    modalShell(
      "تعديل رصيد XP",
      `
        <form data-key-limit-form class="admin-key-limit-form">
          <label>رصيد XP <input name="balance" type="number" min="0" value="${Number(key.xpBalance || key.balance || 0)}" /></label>
          <label>تاريخ الانتهاء <input name="expiresAt" type="date" value="${key.expiresAt ? new Date(key.expiresAt).toISOString().slice(0, 10) : ""}" /></label>
          <button type="submit">حفظ التعديلات</button>
        </form>
      `
    );
    document.querySelector("[data-key-limit-form]")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      await updateKey(key.id, {
        balance: Number(form.balance.value || 0),
        expiresAt: form.expiresAt.value || null,
      });
      closeModal();
      toast("تم حفظ التعديلات");
    });
  }

  function statusPayload(action) {
    if (action === "activate") return { isActive: true, notes: "manualActive:true" };
    if (action === "disable") return { isActive: false };
    if (action === "approve") return { isActive: true, notes: "approved:true" };
    return {};
  }

  async function updateKey(id, payload) {
    await requestJson(`/api/admin/codes/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    await loadKeys();
  }

  async function deleteKey(id) {
    await requestJson(`/api/admin/codes/${id}`, { method: "DELETE" });
    await loadKeys();
  }

  async function handleAction(action, id) {
    const key = findKey(id);
    if (!key) return;

    if (action === "details") {
      openDetails(key);
      return;
    }

    if (action === "copy") {
      await copyText(key.code);
      toast("تم نسخ الكود بنجاح");
      return;
    }

    if (action === "approve") {
      openConfirm({
        title: "اعتماد الكود",
        message: "هل تريد اعتماد هذا الكود؟",
        confirmText: "اعتماد",
        onConfirm: async () => {
          await updateKey(id, statusPayload("approve"));
          closeModal();
          toast("تم اعتماد الكود بنجاح");
        },
      });
      return;
    }

    if (action === "activate") {
      await updateKey(id, statusPayload("activate"));
      toast("تم تنشيط الكود بنجاح");
      return;
    }

    if (action === "disable") {
      openConfirm({
        title: "تعطيل الكود",
        message: "هل تريد تعطيل هذا الكود؟ لن يتمكن العميل من استخدامه حتى يتم تنشيطه مرة أخرى.",
        confirmText: "تعطيل",
        danger: true,
        onConfirm: async () => {
          await updateKey(id, statusPayload("disable"));
          closeModal();
          toast("تم تعطيل الكود بنجاح");
        },
      });
      return;
    }

    if (action === "edit-limit") {
      openEditLimit(key);
      return;
    }

    if (action === "delete") {
      openConfirm({
        title: "حذف الكود",
        message: "هل أنت متأكد من حذف الكود؟ لا يمكن التراجع عن هذا الإجراء.",
        confirmText: "حذف",
        danger: true,
        onConfirm: async () => {
          await deleteKey(id);
          closeModal();
          toast("تم حذف الكود بنجاح");
        },
      });
    }
  }

  async function loadKeys() {
    const payload = await requestJson("/api/admin/keys");
    allKeys = payload.keys || [];
    renderSummary(payload.summary || {});
    rerenderKeys();
  }

  async function init() {
    bindAdminShell();
    const session = await requestJson("/api/admin/session").catch(() => null);
    if (!session?.admin) {
      window.location.href = loginPath();
      return;
    }
    renderProfile(session.admin);
    await loadKeys();

    $("[data-key-search]")?.addEventListener("input", rerenderKeys);
    $("[data-key-status]")?.addEventListener("change", rerenderKeys);
    $("[data-keys-refresh]")?.addEventListener("click", () => {
      if ($("[data-key-search]")) $("[data-key-search]").value = "";
      if ($("[data-key-status]")) $("[data-key-status]").value = "all";
      rerenderKeys();
    });

    document.addEventListener("click", async (event) => {
      const modalClose = event.target.closest("[data-key-modal-close]");
      if (modalClose || event.target.matches("[data-key-action-modal]")) {
        closeModal();
        return;
      }

      const toggle = event.target.closest("[data-key-menu-toggle]");
      if (toggle) {
        const menu = toggle.closest(".admin-key-actions-cell")?.querySelector("[data-key-menu]");
        document.querySelectorAll("[data-key-menu].is-open").forEach((item) => {
          if (item !== menu) item.classList.remove("is-open");
        });
        menu?.classList.toggle("is-open");
        return;
      }

      if (!event.target.closest(".admin-key-actions-cell")) {
        document.querySelectorAll("[data-key-menu].is-open").forEach((item) => item.classList.remove("is-open"));
      }

      const copy = event.target.closest("[data-copy-key]");
      if (copy) {
        await copyText(copy.dataset.copyKey || "");
        toast("تم نسخ الكود بنجاح");
        return;
      }

      const actionButton = event.target.closest("[data-key-action]");
      if (actionButton) {
        document.querySelectorAll("[data-key-menu].is-open").forEach((item) => item.classList.remove("is-open"));
        try {
          await handleAction(actionButton.dataset.keyAction, actionButton.dataset.keyId);
        } catch (error) {
          toast(error.message || "تعذر تنفيذ الإجراء", "error");
        }
      }
    });
  }

  init().catch((error) => {
    const target = $("[data-admin-keys-table]");
    if (target) target.innerHTML = `<div class="admin-v2-error">${escapeHtml(error.message)}</div>`;
  });
})();
