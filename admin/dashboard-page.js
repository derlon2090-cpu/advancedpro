(function () {
  const API_BASE_URL = window.AdvancedProConfig?.apiBaseUrl || "";
  const nf = new Intl.NumberFormat("ar-SA");

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));

  function getAdminLoginPath() {
    const configured = String(
      window.AdvancedProConfig?.adminSecretPath || "advanced-pro-control"
    ).replace(/^\/+|\/+$/g, "");
    return `/${configured || "advanced-pro-control"}`;
  }

  async function requestJson(path, options = {}) {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      credentials: "include",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      ...options,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.message || "تعذر تحميل البيانات.");
      error.payload = payload;
      throw error;
    }
    return payload;
  }

  function safeNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function formatKey(code) {
    if (!code) return "APRO-XXXX-YYYY";
    return String(code);
  }

  function updatePromptCounter() {
    const prompt = $("[data-neo-prompt]");
    const count = $("[data-neo-count]");
    if (!prompt || !count) return;
    count.textContent = nf.format(prompt.value.length);
  }

  function setActiveType(type) {
    $$("[data-neo-type]").forEach((button) => {
      const isActive = button.dataset.neoType === type;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-selected", String(isActive));
    });

    const prompt = $("[data-neo-prompt]");
    const result = $("[data-neo-result-image]");
    if (!prompt || !result) return;

    if (type === "video") {
      prompt.placeholder = "اكتب وصف الفيديو المطلوب، المشهد، الحركة، الإضاءة، والشخصيات...";
      result.src =
        "https://images.unsplash.com/photo-1518709268805-4e9042af2176?auto=format&fit=crop&w=1200&q=85";
      result.alt = "معاينة نتيجة فيديو";
      return;
    }

    prompt.placeholder = "اكتب وصف الصورة المطلوبة، الشخص، المكان، الإضاءة، والأسلوب...";
    result.src =
      "https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=1200&q=85";
    result.alt = "معاينة نتيجة صورة";
  }

  function renderProfile(admin) {
    const profile = $("[data-admin-profile]");
    if (!profile) return;
    const name = admin?.name || admin?.email || "Owner";
    profile.querySelector("span").textContent = name.trim().charAt(0).toUpperCase() || "A";
    profile.title = `مرحبًا، ${name}`;
  }

  function renderStats(stats) {
    const total = safeNumber(stats.totalUsage || stats.totalKeys || 1248, 1248);
    const imagesUsed = safeNumber(stats.imagesUsed, 128);
    const videosUsed = safeNumber(stats.videosUsed, 24);
    const latest = stats.latestKeys?.[0];

    const totalTarget = $("[data-neo-total]");
    if (totalTarget) totalTarget.textContent = nf.format(total);

    const keyTarget = $("[data-neo-key-code]");
    if (keyTarget) keyTarget.textContent = formatKey(latest?.code);

    const imagesTarget = $("[data-neo-images]");
    if (imagesTarget) imagesTarget.textContent = `${nf.format(imagesUsed)} / ${nf.format(Math.max(imagesUsed, 200))}`;

    const videosTarget = $("[data-neo-videos]");
    if (videosTarget) videosTarget.textContent = `${nf.format(videosUsed)} / ${nf.format(Math.max(videosUsed, 100))}`;
  }

  async function logout() {
    try {
      await fetch(`${API_BASE_URL}/api/admin/logout`, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      // Redirect below is enough for the UI even if the request fails.
    }

    try {
      document.cookie = "admin_session=; Path=/; Max-Age=0; SameSite=Lax";
    } catch (error) {
      // Ignore browser cookie cleanup failures.
    }

    window.location.href = getAdminLoginPath();
  }

  async function bootstrap() {
    try {
      const session = await requestJson("/api/admin/session");
      renderProfile(session.admin);
    } catch (error) {
      window.location.href = getAdminLoginPath();
      return;
    }

    try {
      const stats = await requestJson("/api/admin/stats");
      renderStats(stats);
    } catch (error) {
      renderStats({});
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    updatePromptCounter();

    $("[data-neo-prompt]")?.addEventListener("input", updatePromptCounter);

    $$("[data-neo-type]").forEach((button) => {
      button.addEventListener("click", () => setActiveType(button.dataset.neoType || "image"));
    });

    $("[data-neo-preview]")?.addEventListener("click", () => {
      const button = $("[data-neo-preview]");
      if (!button) return;
      button.disabled = true;
      button.innerHTML = "جاري الإنشاء <span class=\"admin-neo-spinner\"></span>";
      setTimeout(() => {
        button.disabled = false;
        button.innerHTML = "إنشاء الآن <span>✦</span>";
      }, 1200);
    });

    document.addEventListener("click", (event) => {
      const logoutButton = event.target.closest("[data-logout]");
      if (logoutButton) logout();
    });

    bootstrap();
  });
})();
