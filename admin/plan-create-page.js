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
    if (!response.ok) throw new Error(payload.message || "تعذر تنفيذ الطلب.");
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

  function setMessage(text, type = "error") {
    const message = $("[data-plan-create-message]");
    if (!message) return;
    message.hidden = !text;
    message.textContent = text || "";
    message.dataset.type = type;
  }

  function formValues() {
    const form = $("#adminPlanCreateForm");
    return {
      name: form.name.value.trim() || "باقة إبداع",
      description: form.description.value.trim() || "للمبدعين والمحترفين",
      imagesLimit: Number(form.imagesLimit.value || 0),
      videosLimit: Number(form.videosLimit.value || 0),
      validityDays: Number(form.validityDays.value || 0),
      price: Number(form.price.value || 0),
      isActive: form.isActive.value === "true",
    };
  }

  function renderPreview() {
    const plan = formValues();
    const target = $("[data-plan-preview]");
    if (!target) return;
    target.innerHTML = `
      <span class="admin-plan-preview-badge">${plan.isActive ? "نشطة" : "معطلة"}</span>
      <h2>${escapeHtml(plan.name)}</h2>
      <p>${escapeHtml(plan.description)}</p>
      <ul>
        <li><span>الصور</span><strong>${plan.imagesLimit} صورة</strong></li>
        <li><span>الفيديوهات</span><strong>${plan.videosLimit} فيديو</strong></li>
        <li><span>الصلاحية</span><strong>${plan.validityDays} يوم</strong></li>
      </ul>
      <div><strong>${plan.price}</strong><span>ريال</span></div>
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

    const form = $("#adminPlanCreateForm");
    renderPreview();
    form?.addEventListener("input", renderPreview);
    form?.addEventListener("change", renderPreview);
    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      setMessage("");
      const submit = form.querySelector("button[type='submit']");
      submit.disabled = true;
      submit.textContent = "جارٍ حفظ الباقة...";
      try {
        await requestJson("/api/admin/plans", {
          method: "POST",
          body: JSON.stringify(formValues()),
        });
        setMessage("تم حفظ الباقة بنجاح.", "success");
        setTimeout(() => {
          window.location.href = "/admin/plans";
        }, 700);
      } catch (error) {
        setMessage(error.message);
      } finally {
        submit.disabled = false;
        submit.textContent = "حفظ الباقة";
      }
    });
  }

  init().catch((error) => setMessage(error.message));
})();
