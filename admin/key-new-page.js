(function () {
  const API_BASE_URL = window.AdvancedProConfig?.apiBaseUrl || "";
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  let plans = [];
  let selectedPlan = null;
  let previewCode = generateKeyCode();
  let createdKey = null;

  const $ = (selector) => document.querySelector(selector);

  function generateKeyCode() {
    const part = () =>
      Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");

    return `APRO-${part()}-${part()}-${part()}`;
  }

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
    if (!response.ok) throw new Error(payload.message || "تعذر تنفيذ الطلب.");
    return payload;
  }

  function setMessage(text, type = "error") {
    const message = $("[data-key-create-message]");
    if (!message) return;
    message.hidden = !text;
    message.textContent = text || "";
    message.dataset.type = type;
  }

  function formatDate(date) {
    if (!date) return "غير محدد";
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) return "غير محدد";
    return parsed.toLocaleDateString("ar-SA", { year: "numeric", month: "2-digit", day: "2-digit" });
  }

  function dateInputValue(date) {
    return date.toISOString().slice(0, 10);
  }

  function getDates() {
    const form = $("#adminKeyCreateForm");
    const mode = form?.validityMode.value || "plan";
    const now = new Date();
    if (mode === "custom") {
      return {
        startsAt: form.startsAt.value ? new Date(form.startsAt.value) : null,
        expiresAt: form.expiresAt.value ? new Date(form.expiresAt.value) : null,
      };
    }
    const expiresAt = new Date(now);
    expiresAt.setDate(now.getDate() + Number(selectedPlan?.validityDays || 30));
    return { startsAt: now, expiresAt };
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

  function renderPlans() {
    const target = $("[data-plan-options]");
    if (!target) return;
    target.innerHTML = plans
      .map(
        (plan) => `
          <label class="admin-key-plan ${String(selectedPlan?.id) === String(plan.id) ? "is-selected" : ""}">
            <input type="radio" name="planId" value="${escapeHtml(plan.id)}" ${String(selectedPlan?.id) === String(plan.id) ? "checked" : ""} />
            <span class="admin-key-plan__icon">${plan.name.includes("تميز") ? "◇" : plan.name.includes("إبداع") ? "☆" : "↗"}</span>
            <strong>${escapeHtml(plan.name)}</strong>
            <em>${Number(plan.price || 0)} ريال</em>
            <small>${Number(plan.validityDays || 0)} يوم</small>
            <p>${Number(plan.imagesLimit || 0)} صورة</p>
            <p>${Number(plan.videosLimit || 0)} فيديو</p>
          </label>
        `
      )
      .join("");
  }

  function renderSummary() {
    const target = $("[data-key-summary]");
    if (!target || !selectedPlan) return;
    const dates = getDates();
    const items = [
      ["الباقة", selectedPlan.name],
      ["الصور", `${selectedPlan.imagesLimit} صورة`],
      ["الفيديو", `${selectedPlan.videosLimit} فيديو`],
      ["تاريخ البداية", formatDate(dates.startsAt)],
      ["تاريخ الانتهاء", formatDate(dates.expiresAt)],
      ["مدة الصلاحية", `${selectedPlan.validityDays} يوم`],
    ];
    target.innerHTML = items
      .map(
        ([label, value]) => `
          <div>
            <span>${label}</span>
            <strong>${escapeHtml(value)}</strong>
          </div>
        `
      )
      .join("");
    const preview = $("[data-key-preview]");
    if (preview) preview.textContent = previewCode;
  }

  function setDefaultCustomDates() {
    const form = $("#adminKeyCreateForm");
    if (!form || !selectedPlan) return;
    const startsAt = new Date();
    const expiresAt = new Date(startsAt);
    expiresAt.setDate(startsAt.getDate() + Number(selectedPlan.validityDays || 30));
    form.startsAt.value = dateInputValue(startsAt);
    form.expiresAt.value = dateInputValue(expiresAt);
  }

  function showSuccessModal(key) {
    createdKey = key;
    const modal = $("[data-key-success-modal]");
    const content = $("[data-key-success-content]");
    if (!modal || !content) return;
    content.innerHTML = `
      <div class="admin-key-success-code">${escapeHtml(key.code)}</div>
      <p><strong>العميل:</strong> ${escapeHtml(key.customerName)}</p>
      <p><strong>الباقة:</strong> ${escapeHtml(key.planName)}</p>
      <p><strong>تاريخ الانتهاء:</strong> ${formatDate(key.expiresAt)}</p>
    `;
    modal.hidden = false;
  }

  async function init() {
    bindAdminShell();
    const session = await requestJson("/api/admin/session").catch(() => null);
    if (!session?.admin) {
      window.location.href = loginPath();
      return;
    }
    renderProfile(session.admin);

    const payload = await requestJson("/api/admin/plans");
    plans = payload.plans || [];
    selectedPlan = plans[0] || null;
    renderPlans();
    setDefaultCustomDates();
    renderSummary();

    const form = $("#adminKeyCreateForm");
    const customDates = $("[data-custom-dates]");
    const customerFromUrl = new URLSearchParams(window.location.search).get("customer");
    if (customerFromUrl && form?.customerName) {
      form.customerName.value = customerFromUrl;
    }

    form?.addEventListener("change", (event) => {
      if (event.target.name === "planId") {
        selectedPlan = plans.find((plan) => String(plan.id) === String(event.target.value)) || selectedPlan;
        previewCode = generateKeyCode();
        renderPlans();
        setDefaultCustomDates();
        renderSummary();
      }
      if (event.target.name === "validityMode") {
        customDates.hidden = event.target.value !== "custom";
        setDefaultCustomDates();
        renderSummary();
      }
      if (["startsAt", "expiresAt"].includes(event.target.name)) {
        renderSummary();
      }
      if (event.target.name === "manualCodeEnabled") {
        form.manualCode.hidden = !event.target.checked;
        if (!event.target.checked) {
          previewCode = generateKeyCode();
          renderSummary();
        }
      }
    });

    form?.manualCode?.addEventListener("input", () => {
      if (form.manualCodeEnabled.checked) {
        previewCode = form.manualCode.value.toUpperCase();
        renderSummary();
      }
    });

    $("[data-regenerate-key]")?.addEventListener("click", () => {
      previewCode = generateKeyCode();
      if (form?.manualCodeEnabled.checked) form.manualCode.value = previewCode;
      renderSummary();
    });

    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      setMessage("");
      const submit = form.querySelector("button[type='submit']");
      submit.disabled = true;
      submit.textContent = "جارٍ إنشاء المفتاح...";

      try {
        const body = {
          customerName: form.customerName.value.trim(),
          customerEmail: form.customerEmail.value.trim(),
          planId: form.planId.value,
          validityMode: form.validityMode.value,
          startsAt: form.startsAt.value || null,
          expiresAt: form.expiresAt.value || null,
          manualCodeEnabled: form.manualCodeEnabled.checked,
          code: form.manualCodeEnabled.checked ? form.manualCode.value.trim() : undefined,
        };
        const payload = await requestJson("/api/admin/keys", {
          method: "POST",
          body: JSON.stringify(body),
        });
        showSuccessModal(payload.key);
      } catch (error) {
        setMessage(error.message);
      } finally {
        submit.disabled = false;
        submit.textContent = "⚿ إنشاء المفتاح";
      }
    });

    document.addEventListener("click", (event) => {
      if (event.target.closest("[data-close-modal]")) {
        $("[data-key-success-modal]").hidden = true;
      }
      if (event.target.closest("[data-copy-created-key]") && createdKey) {
        navigator.clipboard?.writeText(createdKey.code);
      }
      if (event.target.closest("[data-create-another]")) {
        $("[data-key-success-modal]").hidden = true;
        form.reset();
        selectedPlan = plans[0] || null;
        previewCode = generateKeyCode();
        renderPlans();
        setDefaultCustomDates();
        renderSummary();
      }
    });
  }

  init().catch((error) => setMessage(error.message));
})();
