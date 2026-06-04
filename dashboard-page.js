(function () {
  const API_BASE_URL = window.AdvancedProConfig?.apiBaseUrl || "";

  const state = {
    key: null,
    type: "image",
    quality: "high",
    style: "realistic",
    aspect: "16:9",
    duration: 5,
    loading: false,
    activeRequestId: null,
    latestResultUrl: "",
    results: [],
  };

  const fallbackResults = [
    {
      id: "demo-car",
      type: "video",
      prompt: "سيارة مستقبلية في شارع مضاء",
      quality: "high",
      creditsUsed: 80,
      createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      resultUrl:
        "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=900&q=80",
    },
    {
      id: "demo-villa",
      type: "image",
      prompt: "منزل حديث فاخر",
      quality: "high",
      creditsUsed: 10,
      createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      resultUrl:
        "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=900&q=80",
    },
    {
      id: "demo-city",
      type: "image",
      prompt: "مدينة مستقبلية مضيئة",
      quality: "normal",
      creditsUsed: 5,
      createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
      resultUrl:
        "https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=900&q=80",
    },
    {
      id: "demo-robot",
      type: "image",
      prompt: "روبوت أصفر وسط مدينة",
      quality: "high",
      creditsUsed: 10,
      createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
      resultUrl:
        "https://images.unsplash.com/photo-1485827404703-89b55fcc595e?auto=format&fit=crop&w=900&q=80",
    },
    {
      id: "demo-room",
      type: "image",
      prompt: "غرفة معيشة حديثة",
      quality: "high",
      creditsUsed: 10,
      createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      resultUrl:
        "https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=900&q=80",
    },
  ];

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  function apiUrl(path) {
    return `${API_BASE_URL}${path}`;
  }

  async function requestJson(path, options = {}) {
    const response = await fetch(apiUrl(path), {
      credentials: "include",
      cache: "no-store",
      ...options,
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {}),
      },
    });

    const text = await response.text();
    let data = {};
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { message: text };
      }
    }

    if (!response.ok) {
      const error = new Error(data.message || data.error || "تعذر تنفيذ الطلب");
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return data;
  }

  function formatNumber(value) {
    return new Intl.NumberFormat("en-US").format(Number(value || 0));
  }

  function formatDate(value) {
    if (!value) return "غير محدد";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "غير محدد";
    return new Intl.DateTimeFormat("ar-SA", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(date);
  }

  function relativeTime(value) {
    if (!value) return "الآن";
    const date = new Date(value);
    const diff = Math.max(0, Date.now() - date.getTime());
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "الآن";
    if (mins < 60) return `منذ ${mins} دقائق`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `منذ ${hours} ساعة`;
    return `منذ ${Math.floor(hours / 24)} يوم`;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function keyCredits() {
    const key = state.key || {};
    return Number(
      key.creditsRemaining ??
        key.balanceRemaining ??
        key.balance ??
        key.credits ??
        key.xpRemaining ??
        key.xp ??
        1095
    );
  }

  function keyTotalCredits() {
    const key = state.key || {};
    return Number(key.creditsLimit ?? key.balanceLimit ?? key.totalCredits ?? keyCredits() ?? 1095);
  }

  function calculateCredits(type = state.type, quality = state.quality, duration = state.duration) {
    if (type === "image") {
      return { normal: 5, high: 10, ultra: 20 }[quality] || 10;
    }

    const table = {
      5: { normal: 50, high: 100, ultra: 200 },
      8: { normal: 80, high: 160, ultra: 320 },
    };

    return table[Number(duration)]?.[quality] || 50;
  }

  function qualityLabel(value = state.quality) {
    return { normal: "عادية", high: "عالية", ultra: "فائقة" }[value] || "عالية";
  }

  function typeLabel(value = state.type) {
    return value === "video" ? "فيديو" : "صورة";
  }

  function updateCost() {
    const cost = calculateCredits();
    const suffix = state.type === "video" ? `فيديو ${state.duration} ثواني` : "صورة";
    $("[data-cost-value]").textContent = `${formatNumber(cost)} XP`;
    $("[data-cost-label]").textContent = `${suffix} ${qualityLabel()}`;
  }

  function setMessage(message, kind = "info") {
    const node = $("[data-form-message]");
    node.textContent = message || "";
    node.dataset.kind = kind;
  }

  function showToast(message, kind = "success") {
    const toast = $("[data-toast]");
    toast.textContent = message;
    toast.dataset.kind = kind;
    toast.hidden = false;
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => {
      toast.hidden = true;
    }, 3500);
  }

  function normalizeKey(payload) {
    const key = payload?.key || payload?.data || payload || {};
    return {
      ...key,
      customerName: key.customerName || key.customer_name || key.ownerName || key.name || "أحمد العتيبي",
      customerEmail: key.customerEmail || key.customer_email || key.email || "",
      planName: key.planName || key.plan_name || key.plan || "VIP",
      status: key.status || "active",
      codeMasked: key.codeMasked || key.maskedCode || key.code || "APRO-XXXX-YYYY",
      expiresAt: key.expiresAt || key.expires_at,
    };
  }

  function normalizeGeneration(item) {
    return {
      id: item.id || item.generationId || crypto.randomUUID(),
      requestId: item.requestId,
      type: item.type || "image",
      prompt: item.userPrompt || item.prompt || item.description || "نتيجة جديدة",
      quality: item.quality || "high",
      style: item.style || "realistic",
      creditsUsed: Number(item.creditsUsed ?? item.credits_used ?? item.cost ?? calculateCredits()),
      createdAt: item.createdAt || item.created_at || new Date().toISOString(),
      resultUrl: item.resultUrl || item.url || item.outputUrl || item.imageUrl || item.videoUrl || "",
      thumbnailUrl: item.thumbnailUrl || item.resultUrl || item.url || item.outputUrl || "",
    };
  }

  function updateKeyUi() {
    const key = state.key || {};
    const remaining = keyCredits();
    const total = Math.max(keyTotalCredits(), remaining, 1);
    const percent = Math.max(4, Math.min(100, Math.round((remaining / total) * 100)));
    const name = key.customerName || "أحمد العتيبي";
    const seed = encodeURIComponent(name);

    $("[data-customer-name]").textContent = name;
    $("[data-customer-avatar]").src =
      key.avatarUrl || `https://api.dicebear.com/8.x/avataaars/svg?seed=${seed}`;
    $("[data-plan-badge]").textContent = key.planName || "VIP";
    $("[data-total-xp]").textContent = `${formatNumber(remaining)} XP`;
    $("[data-widget-xp]").textContent = `${formatNumber(remaining)} XP`;
    $("[data-xp-progress]").style.width = `${percent}%`;
    $("[data-expiry-text]").textContent = `ينتهي في ${formatDate(key.expiresAt)}`;
    $("[data-days-left]").textContent = daysLeftText(key.expiresAt);
  }

  function daysLeftText(value) {
    if (!value) return "صلاحية مفتوحة";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "صلاحية مفتوحة";
    const days = Math.ceil((date.getTime() - Date.now()) / 86400000);
    if (days <= 0) return "منتهي";
    return `${days} يوم متبقية`;
  }

  function renderRecent() {
    const grid = $("[data-recent-grid]");
    const list = (state.results.length ? state.results : fallbackResults).slice(0, 5);
    grid.innerHTML = list.map(renderCreationCard).join("");
    $$("[data-open-result]", grid).forEach((button) => {
      button.addEventListener("click", () => {
        const item = list.find((result) => String(result.id) === button.dataset.openResult);
        if (item) openResult(item);
      });
    });
  }

  function renderCreationCard(item) {
    const mediaUrl = item.thumbnailUrl || item.resultUrl;
    const prompt = escapeHtml(item.prompt);
    const meta = `${qualityLabel(item.quality)} · ${relativeTime(item.createdAt)}`;
    const media =
      item.type === "video"
        ? `<video src="${escapeHtml(mediaUrl)}" muted playsinline preload="metadata"></video>`
        : `<img src="${escapeHtml(mediaUrl)}" alt="${prompt}" loading="lazy" />`;

    return `
      <article class="udv3-creation-card">
        <button type="button" data-open-result="${escapeHtml(item.id)}" aria-label="عرض النتيجة">
          <span class="udv3-creation-media">${media}</span>
          <b>${typeLabel(item.type)}</b>
        </button>
        <h3>${prompt}</h3>
        <p>${meta}</p>
        <div>
          <button type="button" data-copy-url="${escapeHtml(item.resultUrl)}">نسخ</button>
          <a href="${escapeHtml(item.resultUrl)}" download>تحميل</a>
          <span>${formatNumber(item.creditsUsed)} XP</span>
        </div>
      </article>
    `;
  }

  function renderTransactions() {
    const recent = state.results.slice(0, 2).map((item) => ({
      label: `إنشاء ${typeLabel(item.type)} ${qualityLabel(item.quality)}`,
      time: relativeTime(item.createdAt),
      amount: `-${formatNumber(item.creditsUsed)} XP`,
      positive: false,
    }));

    const list = [
      ...recent,
      { label: "شحن باقة إبداع", time: "منذ يومين", amount: "+1,200 XP", positive: true },
    ].slice(0, 3);

    $("[data-transactions-list]").innerHTML = list
      .map(
        (item) => `
          <article>
            <span>${escapeHtml(item.label)}<small>${escapeHtml(item.time)}</small></span>
            <b class="${item.positive ? "is-positive" : ""}">${escapeHtml(item.amount)}</b>
          </article>
        `
      )
      .join("");
  }

  function updateUsageUi() {
    const images = state.results.filter((item) => item.type === "image").length + 18;
    const videos = state.results.filter((item) => item.type === "video").length + 4;
    $("[data-images-count]").textContent = `${images} / 240`;
    $("[data-videos-count]").textContent = `${videos} / 24`;
  }

  function setType(type) {
    state.type = type;
    $$("[data-type-tab]").forEach((button) => button.classList.toggle("is-active", button.dataset.typeTab === type));
    $$("[data-video-only]").forEach((node) => {
      node.hidden = type !== "video";
    });
    $$("[data-image-only]").forEach((node) => {
      node.hidden = type !== "image";
    });
    $("[data-prompt-label]").textContent =
      type === "video" ? "اكتب وصف الفيديو الذي تريد إنشاءه..." : "اكتب وصف الصورة التي تريد إنشاءها...";
    $("[data-prompt-input]").placeholder =
      type === "video"
        ? "مثال: لقطة سينمائية لروبوتات صفراء تتحرك في مدينة مستقبلية..."
        : "مثال: رجل أعمال وسيم يرتدي بدلة فاخرة داخل مكتب حديث، إضاءة سينمائية...";
    updateCost();
  }

  function setLoading(isLoading) {
    state.loading = isLoading;
    const button = $("[data-submit-button]");
    button.disabled = isLoading;
    button.textContent = isLoading
      ? state.type === "video"
        ? "جاري إنشاء الفيديو..."
        : "جاري إنشاء الصورة..."
      : "إنشاء الآن ✨";
  }

  async function handleGenerate(event) {
    event.preventDefault();
    if (state.loading) return;

    const promptInput = $("[data-prompt-input]");
    const userPrompt = promptInput.value.trim();
    if (userPrompt.length < 3) {
      setMessage("اكتب وصفًا واضحًا أولًا.", "error");
      promptInput.focus();
      return;
    }

    const requiredCredits = calculateCredits();
    if (keyCredits() < requiredCredits) {
      setMessage("رصيدك غير كافٍ لإتمام هذا الطلب.", "error");
      showToast("رصيدك غير كافٍ.", "error");
      return;
    }

    const requestId = crypto.randomUUID();
    state.activeRequestId = requestId;
    state.latestResultUrl = "";
    setMessage(
      state.type === "video"
        ? "جاري إنشاء الفيديو، قد يستغرق بعض الوقت..."
        : "جاري إنشاء الصورة...",
      "loading"
    );
    setLoading(true);

    const payload = {
      requestId,
      type: state.type,
      prompt: userPrompt,
      quality: state.quality,
      style: state.style,
      aspectRatio: state.aspect,
      aspect: state.aspect,
      duration: state.type === "video" ? Number(state.duration) : undefined,
      seed: Math.floor(Math.random() * 999999999),
    };

    console.log("REQUEST_ID:", requestId);
    console.log("USER_PROMPT:", userPrompt);
    console.log("GENERATION_PAYLOAD:", payload);

    try {
      const data = await requestJson("/api/generate", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (data.requestId && data.requestId !== state.activeRequestId) {
        return;
      }

      const rawGeneration = data.generation || data.result || data;
      const generation = normalizeGeneration({
        ...rawGeneration,
        requestId,
        prompt: rawGeneration.userPrompt || rawGeneration.prompt || userPrompt,
        type: rawGeneration.type || state.type,
        quality: rawGeneration.quality || state.quality,
        creditsUsed: rawGeneration.creditsUsed ?? requiredCredits,
      });

      if (!generation.resultUrl) {
        throw new Error("تم إنشاء العملية لكن لم يصل رابط النتيجة من الخادم.");
      }

      state.results = [generation, ...state.results.filter((item) => item.id !== generation.id)];
      state.latestResultUrl = generation.resultUrl;
      setMessage("تم الإنشاء بنجاح.", "success");
      showToast("تم الإنشاء بنجاح.");
      promptInput.value = "";
      $("[data-char-count]").textContent = "0";
      openResult(generation);
      renderAll();
      await refreshKey({ silent: true });
      await refreshGenerations({ silent: true });
    } catch (error) {
      console.error("GENERATE ERROR:", error);
      setMessage(error.message || "فشل التوليد، لم يتم خصم أي رصيد.", "error");
      showToast(error.message || "فشل التوليد، لم يتم خصم أي رصيد.", "error");
    } finally {
      setLoading(false);
      state.activeRequestId = null;
    }
  }

  function openResult(item) {
    const modal = $("[data-result-modal]");
    const preview = $("[data-result-preview]");
    const url = item.resultUrl || "";
    const urlWithCacheBust = url ? `${url}${url.includes("?") ? "&" : "?"}v=${encodeURIComponent(item.requestId || item.id)}` : "";

    preview.innerHTML =
      item.type === "video"
        ? `<video src="${escapeHtml(urlWithCacheBust)}" controls playsinline></video>`
        : `<img src="${escapeHtml(urlWithCacheBust)}" alt="${escapeHtml(item.prompt)}" />`;
    $("[data-result-prompt]").textContent = item.prompt || "";
    $("[data-result-download]").href = url;
    $("[data-copy-result]").onclick = () => copyText(url);
    modal.hidden = false;
  }

  function closeResult() {
    $("[data-result-modal]").hidden = true;
  }

  async function copyText(value) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      showToast("تم النسخ بنجاح");
    } catch {
      showToast("تعذر النسخ تلقائيًا", "error");
    }
  }

  async function refreshKey({ silent = false } = {}) {
    try {
      const data = await requestJson("/api/me/key");
      state.key = normalizeKey(data);
      updateKeyUi();
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        window.location.href = "/activate";
        return;
      }
      if (!silent) {
        console.warn("KEY LOAD WARNING:", error);
      }
      state.key = normalizeKey({});
      updateKeyUi();
    }
  }

  async function refreshGenerations({ silent = false } = {}) {
    try {
      const data = await requestJson("/api/generate");
      const list = data.generations || data.items || data.results || [];
      state.results = list.map(normalizeGeneration).filter((item) => item.resultUrl);
      renderAll();
    } catch (error) {
      if (!silent) {
        console.warn("GENERATIONS LOAD WARNING:", error);
      }
      renderAll();
    }
  }

  async function handleLogout() {
    try {
      await requestJson("/api/keys/logout", { method: "POST" });
    } catch {
      try {
        await requestJson("/api/logout", { method: "POST" });
      } catch {
        // Redirect anyway; the protected page will reject missing/expired sessions.
      }
    }
    window.location.href = "/activate";
  }

  function renderAll() {
    updateKeyUi();
    updateCost();
    renderRecent();
    renderTransactions();
    updateUsageUi();
  }

  function bindEvents() {
    $("[data-create-form]").addEventListener("submit", handleGenerate);
    $("[data-prompt-input]").addEventListener("input", (event) => {
      $("[data-char-count]").textContent = event.target.value.length;
    });
    $$("[data-type-tab]").forEach((button) => {
      button.addEventListener("click", () => setType(button.dataset.typeTab));
    });
    $$("[data-type-shortcut]").forEach((link) => {
      link.addEventListener("click", (event) => {
        event.preventDefault();
        setType(link.dataset.typeShortcut);
        $("#create").scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
    $$("[data-local-nav]").forEach((link) => {
      link.addEventListener("click", (event) => {
        const hash = link.getAttribute("href");
        if (!hash || !hash.startsWith("#")) return;
        event.preventDefault();
        $(hash)?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
    $("[data-focus-create]").addEventListener("click", () => {
      $("#create").scrollIntoView({ behavior: "smooth", block: "start" });
      $("[data-prompt-input]").focus();
    });
    $("[data-quality-select]").addEventListener("change", (event) => {
      state.quality = event.target.value;
      updateCost();
    });
    $("[data-style-select]").addEventListener("change", (event) => {
      state.style = event.target.value;
    });
    $("[data-aspect-select]").addEventListener("change", (event) => {
      state.aspect = event.target.value;
    });
    $("[data-duration-select]").addEventListener("change", (event) => {
      state.duration = Number(event.target.value);
      updateCost();
    });
    $$("[data-close-result]").forEach((button) => button.addEventListener("click", closeResult));
    document.addEventListener("click", (event) => {
      const copyButton = event.target.closest("[data-copy-url]");
      if (copyButton) copyText(copyButton.dataset.copyUrl);
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeResult();
    });
  }

  async function init() {
    bindEvents();
    setType("image");
    renderAll();
    await refreshKey();
    await refreshGenerations({ silent: true });
  }

  init();
})();
