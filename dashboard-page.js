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
    abortController: null,
    enhancedFinalPrompt: "",
    enhancedPromptDebug: null,
    results: [],
  };

  const IMAGE_XP_COST = { normal: 5, high: 12, ultra: 35 };
  const VIDEO_XP_PER_SECOND = { normal: 10, high: 25, ultra: 60 };
  const VIDEO_MINIMUM_XP = { normal: 50, high: 120, ultra: 250 };
  const VIDEO_DURATIONS = [5, 8, 10, 15, 20, 30, 45, 60, 90, 100];
  const MAX_VIDEO_DURATION_BY_QUALITY = { normal: 100, high: 60, ultra: 30 };

  const fallbackResults = [
    {
      id: "demo-business-video",
      type: "video",
      prompt: "رجل أعمال داخل سيارة فاخرة",
      quality: "high",
      style: "realistic",
      aspectRatio: "16:9",
      creditsUsed: 100,
      createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
      resultUrl:
        "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=900&q=85",
    },
    {
      id: "demo-villa",
      type: "image",
      prompt: "منزل عصري فاخر",
      quality: "high",
      style: "realistic",
      aspectRatio: "16:9",
      creditsUsed: 12,
      createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      resultUrl:
        "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=900&q=85",
    },
    {
      id: "demo-car",
      type: "image",
      prompt: "سيارة رياضية في المدينة",
      quality: "high",
      style: "realistic",
      aspectRatio: "16:9",
      creditsUsed: 12,
      createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
      resultUrl:
        "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=900&q=85",
    },
    {
      id: "demo-robot",
      type: "image",
      prompt: "روبوت مستقبلي",
      quality: "normal",
      style: "three-d",
      aspectRatio: "1:1",
      creditsUsed: 5,
      createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
      resultUrl:
        "https://images.unsplash.com/photo-1485827404703-89b55fcc595e?auto=format&fit=crop&w=900&q=85",
    },
    {
      id: "demo-room",
      type: "image",
      prompt: "غرفة معيشة أنيقة",
      quality: "high",
      style: "realistic",
      aspectRatio: "16:9",
      creditsUsed: 12,
      createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      resultUrl:
        "https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=900&q=85",
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
    return Number(key.creditsLimit ?? key.balanceLimit ?? key.totalCredits ?? Math.max(keyCredits(), 1095));
  }

  function calculateCredits(type = state.type, quality = state.quality, duration = state.duration) {
    if (type === "image") {
      return IMAGE_XP_COST[quality] || IMAGE_XP_COST.high;
    }

    const normalizedDuration = Number(duration || 5);
    return Math.max(VIDEO_MINIMUM_XP[quality], normalizedDuration * VIDEO_XP_PER_SECOND[quality]);
  }

  function qualityLabel(value = state.quality) {
    return { normal: "عادية", high: "عالية", ultra: "فائقة" }[value] || "عالية";
  }

  function styleLabel(value = state.style) {
    return {
      realistic: "واقعي",
      cinematic: "سينمائي",
      anime: "أنمي",
      "three-d": "ثلاثي الأبعاد",
      commercial: "إعلاني",
    }[value] || "واقعي";
  }

  function typeLabel(value = state.type) {
    return value === "video" ? "فيديو" : "صورة";
  }

  function daysLeftText(value) {
    if (!value) return "صلاحية مفتوحة";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "صلاحية مفتوحة";
    const days = Math.ceil((date.getTime() - Date.now()) / 86400000);
    if (days <= 0) return "منتهي";
    return `${days} يوم متبقية`;
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
      finalPrompt: item.finalPrompt || item.final_prompt || "",
      quality: item.quality || "high",
      style: item.style || "realistic",
      aspectRatio: item.aspectRatio || item.aspect || "16:9",
      duration: item.duration,
      provider: item.provider,
      model: item.model || (item.type === "video" ? "PixiGen Motion" : "PixiGen Pro v2"),
      seed: item.seed,
      creditsUsed: Number(item.creditsUsed ?? item.credits_used ?? item.xpCost ?? item.cost ?? calculateCredits()),
      createdAt: item.createdAt || item.created_at || new Date().toISOString(),
      resultUrl: item.resultUrl || item.url || item.outputUrl || item.imageUrl || item.videoUrl || "",
      thumbnailUrl: item.thumbnailUrl || item.resultUrl || item.url || item.outputUrl || "",
      status: item.status || "completed",
    };
  }

  function updateCost() {
    const cost = calculateCredits();
    const suffix = state.type === "video" ? `فيديو ${state.duration} ثواني` : "صورة";
    $("[data-cost-value]").textContent = `${formatNumber(cost)} XP`;
    $("[data-cost-label]").textContent = `${suffix} ${qualityLabel()}`;
  }

  function updateDurationOptions() {
    const select = $("[data-duration-select]");
    if (!select) return;

    const maxDuration = MAX_VIDEO_DURATION_BY_QUALITY[state.quality] || MAX_VIDEO_DURATION_BY_QUALITY.normal;
    select.innerHTML = VIDEO_DURATIONS.map((duration) => {
      const disabled = duration > maxDuration ? " disabled" : "";
      return `<option value="${duration}"${disabled}>${duration} ثانية</option>`;
    }).join("");

    if (state.duration > maxDuration) {
      state.duration = maxDuration;
      setMessage("هذه المدة غير متاحة للجودة المختارة. تم اختيار أقرب مدة مسموحة.", "info");
    }

    select.value = String(state.duration);
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

  function showProcessing(show) {
    const card = $("[data-processing-card]");
    card.hidden = !show;
    if (show) {
      $("[data-processing-title]").textContent =
        state.type === "video" ? "جاري إنشاء الفيديو..." : "جاري إنشاء صورتك...";
      card.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  function setLoading(isLoading) {
    state.loading = isLoading;
    const button = $("[data-submit-button]");
    const enhanceButton = $("[data-smart-enhance]");
    button.disabled = isLoading;
    if (enhanceButton) enhanceButton.disabled = isLoading;
    button.textContent = isLoading
      ? state.type === "video"
        ? "جاري إنشاء الفيديو..."
        : "جاري إنشاء الصورة..."
      : "إنشاء الآن ✨";
    showProcessing(isLoading);
  }

  function setType(type) {
    state.type = type;
    resetEnhancedPromptState();
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
    updateDurationOptions();
    updateCost();
  }

  function renderRecent() {
    const grid = $("[data-recent-grid]");
    const list = (state.results.length ? state.results : fallbackResults).slice(0, 5);
    grid.innerHTML = list.map(renderCreationCard).join("");
  }

  function renderCreationCard(item) {
    const mediaUrl = item.thumbnailUrl || item.resultUrl;
    const prompt = escapeHtml(item.prompt);
    const meta = `${qualityLabel(item.quality)} · ${relativeTime(item.createdAt)}`;
    const targetUrl = `/generation?id=${encodeURIComponent(item.id)}`;
    const media =
      item.type === "video"
        ? `<video src="${escapeHtml(mediaUrl)}" muted playsinline preload="metadata"></video>`
        : `<img src="${escapeHtml(mediaUrl)}" alt="${prompt}" loading="lazy" />`;

    return `
      <article class="udv3-creation-card">
        <a class="udv3-creation-preview" href="${targetUrl}" data-generation-link="${escapeHtml(item.id)}">
          <span class="udv3-creation-media">${media}</span>
          <b>${typeLabel(item.type)}</b>
        </a>
        <h3>${prompt}</h3>
        <p>${meta}</p>
        <button class="udv3-card-menu" type="button" aria-label="إجراءات">⋮</button>
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

  function persistGeneration(generation) {
    try {
      sessionStorage.setItem(`generation:${generation.id}`, JSON.stringify(generation));
      sessionStorage.setItem("latestGeneration", JSON.stringify(generation));
      sessionStorage.setItem("pixigen:lastGeneration", JSON.stringify(generation));
      const stored = JSON.parse(sessionStorage.getItem("pixigen:generations") || "[]");
      const merged = [
        generation,
        ...stored.filter((item) => String(item.id) !== String(generation.id)),
      ].slice(0, 30);
      sessionStorage.setItem("pixigen:generations", JSON.stringify(merged));
    } catch {
      // Session storage is only a client-side convenience for static routing.
    }
  }

  function promptHasAny(value, terms) {
    const text = String(value || "").toLowerCase();
    return terms.some((term) => text.includes(term));
  }

  function isPromptDebugEnabled() {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get("promptDebug") === "1" || localStorage.getItem("pixigen:promptDebug") === "1";
    } catch {
      return false;
    }
  }

  function resetEnhancedPromptState() {
    state.enhancedFinalPrompt = "";
    state.enhancedPromptDebug = null;
    const debugButton = $("[data-show-enhanced-prompt]");
    if (debugButton) debugButton.hidden = true;
  }

  function updateEnhancedPromptPreview() {
    const preview = $("[data-enhanced-prompt-preview]");
    if (!preview) return;

    const data = state.enhancedPromptDebug || {};
    preview.textContent = [
      "FINAL_PROMPT:",
      data.finalPrompt || state.enhancedFinalPrompt || "-",
      "",
      "NEGATIVE_PROMPT:",
      data.negativePrompt || "-",
      "",
      "DEBUG:",
      JSON.stringify(data.debug || {}, null, 2),
    ].join("\n");
  }

  function openEnhancedPromptModal() {
    updateEnhancedPromptPreview();
    const modal = $("[data-enhanced-prompt-modal]");
    if (modal) modal.hidden = false;
  }

  function closeEnhancedPromptModal() {
    const modal = $("[data-enhanced-prompt-modal]");
    if (modal) modal.hidden = true;
  }

  function smartEnhancePrompt(prompt) {
    const text = String(prompt || "").trim();
    const lower = text.toLowerCase();

    const hasCat = promptHasAny(lower, ["قطة", "قط", "cat"]);
    const hasDog = promptHasAny(lower, ["كلب", "dog"]);
    const hasHouse = promptHasAny(lower, ["بيت", "منزل", "house", "home"]);
    const hasRobot = promptHasAny(lower, ["روبوت", "robot"]);
    const hasRobots = promptHasAny(lower, ["روبوتات", "robots"]);
    const hasMoon = promptHasAny(lower, ["القمر", "قمر", "moon"]);
    const hasBlack = promptHasAny(lower, ["أسود", "اسود", "سوداء", "black"]);
    const hasYellow = promptHasAny(lower, ["أصفر", "اصفر", "صفراء", "yellow"]);
    const hasGreen = promptHasAny(lower, ["أخضر", "اخضر", "خضراء", "green"]);
    const hasBeside = promptHasAny(lower, ["بجانب", "مع", "next to", "beside"]);
    const hasTop = promptHasAny(lower, ["فوق", "على سطح", "سطح", "on top", "roof"]);
    const hasFront = promptHasAny(lower, ["أمام", "امام", "in front"]);

    if (hasCat && hasHouse && hasTop) {
      const catColor = hasBlack ? "سوداء" : "واضحة اللون";
      const houseColor = hasYellow ? "أصفر" : "واضح اللون";
      return [
        `صورة واقعية لقطة ${catColor} تقف فوق سطح منزل ${houseColor} كامل الظهور.`,
        "يجب أن تظهر القطة والمنزل بالكامل داخل الإطار.",
        "حافظ بدقة على لون القطة ولون المنزل كما هو مكتوب.",
        "لا تضف حيوانات أخرى أو أشخاص أو نصوص أو شعارات.",
      ].join(" ");
    }

    if (hasCat && hasDog) {
      const catColor = hasBlack ? "سوداء" : "واضحة";
      const dogColor = hasBlack ? "أسود" : "واضح";
      return [
        `صورة واقعية لقطة ${catColor} بجانب كلب ${dogColor}.`,
        "يجب أن يظهر الحيوانان بالكامل جنبًا إلى جنب داخل الإطار.",
        "حافظ على الألوان المطلوبة ولا تضف طعامًا أو أشخاصًا أو نصوصًا.",
      ].join(" ");
    }

    if (hasRobot) {
      if (hasGreen && hasYellow && (hasBeside || hasRobots)) {
        return [
          "صورة خيال علمي واقعية لروبوت أخضر وروبوت أصفر يقفان جنبًا إلى جنب.",
          hasMoon ? "اجعلهما على سطح القمر مع ظهور أرض قمرية واضحة." : "اجعل الروبوتين كاملَي الظهور داخل الإطار.",
          "حافظ على اللون الأخضر للروبوت الأول واللون الأصفر للروبوت الثاني.",
          "لا تضف بشرًا أو حيوانات أو نصوصًا أو شعارات.",
        ].join(" ");
      }

      return [
        `صورة واقعية لـ ${text}.`,
        "اجعل الروبوت أو الروبوتات كاملة الظهور وواضحة داخل الإطار.",
        "حافظ على الألوان المذكورة ولا تضف بشرًا أو نصوصًا أو شعارات.",
      ].join(" ");
    }

    if (hasBeside || hasTop || hasFront || hasBlack || hasYellow || hasGreen) {
      return [
        `صورة واقعية لـ ${text}.`,
        hasBeside ? "أظهر كل العناصر جنبًا إلى جنب بوضوح داخل الإطار." : "",
        hasTop ? "أظهر العنصر فوق العنصر الآخر مع ظهور العنصر السفلي بالكامل." : "",
        hasFront ? "أظهر العنصر الأمامي والعنصر الخلفي بوضوح." : "",
        "حافظ على الألوان والعلاقات المذكورة بدقة.",
        "لا تضف عناصر عشوائية أو نصوصًا أو شعارات.",
      ].filter(Boolean).join(" ");
    }

    return [
      `صورة واقعية لـ ${text}.`,
      "أظهر الموضوع الرئيسي بوضوح داخل الإطار.",
      "حافظ على التفاصيل المطلوبة ولا تضف عناصر غير مذكورة أو نصوصًا أو شعارات.",
    ].join(" ");
  }

  async function handleSmartEnhance() {
    const promptInput = $("[data-prompt-input]");
    const enhanceButton = $("[data-smart-enhance]");
    const debugButton = $("[data-show-enhanced-prompt]");
    const currentPrompt = promptInput.value.trim();

    if (currentPrompt.length < 3) {
      setMessage("اكتب وصفًا قصيرًا أولًا ثم اضغط تحسين ذكي.", "error");
      promptInput.focus();
      return;
    }

    const originalText = enhanceButton?.textContent || "✨ تحسين ذكي";
    if (enhanceButton) {
      enhanceButton.disabled = true;
      enhanceButton.textContent = "جاري تحسين الوصف...";
    }

    try {
      const data = await requestJson("/api/generate/enhance", {
        method: "POST",
        body: JSON.stringify({
          prompt: currentPrompt,
          type: state.type,
          quality: state.quality,
          style: state.style,
        }),
      });

      const enhancedPrompt = String(data.enhancedPrompt || "").trim() || smartEnhancePrompt(currentPrompt);
      promptInput.value = enhancedPrompt;
      $("[data-char-count]").textContent = enhancedPrompt.length;
      state.enhancedFinalPrompt = data.finalPrompt || "";
      state.enhancedPromptDebug = {
        enhancedPrompt,
        finalPrompt: data.finalPrompt || "",
        negativePrompt: data.negativePrompt || "",
        debug: data.debug || null,
      };

      if (debugButton) {
        debugButton.hidden = !isPromptDebugEnabled() || !state.enhancedFinalPrompt;
      }

      setMessage("تم تحسين الوصف بدقة مع تثبيت العناصر والعلاقات.", "info");
      showToast("تم تحسين الوصف ذكيًا.");
      promptInput.focus();
    } catch (error) {
      console.error("SMART ENHANCE ERROR:", error);
      resetEnhancedPromptState();
      setMessage(error.message || "تعذر تحسين الوصف الآن.", "error");
      showToast(error.message || "تعذر تحسين الوصف الآن.", "error");
    } finally {
      if (enhanceButton) {
        enhanceButton.disabled = state.loading;
        enhanceButton.textContent = originalText;
      }
    }
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
    const controller = new AbortController();
    state.activeRequestId = requestId;
    state.abortController = controller;
    setMessage("", "info");
    try {
      sessionStorage.removeItem("latestGeneration");
      sessionStorage.removeItem("pixigen:lastGeneration");
    } catch {
      // Start every generation without displaying a stale previous result.
    }
    setLoading(true);

    const payload = {
      requestId,
      type: state.type,
      prompt: userPrompt,
      quality: state.quality,
      style: state.style,
      enhancedFinalPrompt: state.enhancedFinalPrompt || undefined,
      aspectRatio: state.aspect,
      aspect: state.aspect,
      duration: state.type === "video" ? Number(state.duration) : undefined,
      referenceImage: null,
      imagePrompt: null,
      initImage: null,
      seed: Math.floor(Math.random() * 999999999),
    };

    console.log("REQUEST_ID:", requestId);
    console.log("USER_PROMPT:", userPrompt);
    console.log("GENERATION_PAYLOAD:", payload);

    try {
      const data = await requestJson("/api/generate", {
        method: "POST",
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if ((data.requestId || data.generation?.requestId) !== state.activeRequestId) {
        return;
      }

      if (!data.generation?.id) {
        throw new Error("لم يتم إنشاء معرف للنتيجة");
      }

      const rawGeneration = data.generation;
      const responseGenerationId = rawGeneration.id;
      console.log("RESPONSE GENERATION ID:", responseGenerationId);
      console.log("RESPONSE REQUEST ID:", rawGeneration.requestId || data.requestId);

      const generation = normalizeGeneration({
        ...rawGeneration,
        id: responseGenerationId,
        requestId,
        prompt: rawGeneration.userPrompt || rawGeneration.prompt || userPrompt,
        type: rawGeneration.type || state.type,
        quality: rawGeneration.quality || state.quality,
        style: rawGeneration.style || state.style,
        aspectRatio: rawGeneration.aspectRatio || state.aspect,
        creditsUsed: rawGeneration.creditsUsed ?? requiredCredits,
      });

      if (!generation.resultUrl) {
        throw new Error("تم إنشاء العملية لكن لم يصل رابط النتيجة من الخادم.");
      }

      state.results = [generation, ...state.results.filter((item) => String(item.id) !== String(generation.id))];
      persistGeneration(generation);
      try {
        sessionStorage.setItem("pixigen:key", JSON.stringify(state.key || {}));
      } catch {
        // Ignore storage failures; the API remains the source of truth.
      }
      promptInput.value = "";
      $("[data-char-count]").textContent = "0";
      resetEnhancedPromptState();
      renderAll();
      showToast(`تم الإنشاء بنجاح وتم خصم ${formatNumber(generation.creditsUsed)} XP.`);
      await refreshKey({ silent: true });
      console.log("OPEN GENERATION ROUTE ID:", generation.id);
      console.log("REDIRECT GENERATION ID:", generation.id);
      window.location.href = `/generation?id=${encodeURIComponent(generation.id)}`;
    } catch (error) {
      if (error.name === "AbortError") {
        setMessage("تم إلغاء الإنشاء. لم يتم خصم أي رصيد.", "info");
        showToast("تم إلغاء الإنشاء. لم يتم خصم أي رصيد.", "error");
      } else {
        console.error("GENERATE ERROR:", error);
        setMessage(error.message || "فشل التوليد، لم يتم خصم أي رصيد.", "error");
        showToast(error.message || "فشل التوليد، لم يتم خصم أي رصيد.", "error");
      }
    } finally {
      setLoading(false);
      state.activeRequestId = null;
      state.abortController = null;
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
      if (!silent) console.warn("KEY LOAD WARNING:", error);
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
      if (!silent) console.warn("GENERATIONS LOAD WARNING:", error);
      renderAll();
    }
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
    $("[data-smart-enhance]")?.addEventListener("click", handleSmartEnhance);
    $("[data-prompt-input]").addEventListener("input", (event) => {
      $("[data-char-count]").textContent = event.target.value.length;
      resetEnhancedPromptState();
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
      resetEnhancedPromptState();
      updateDurationOptions();
      updateCost();
    });
    $("[data-style-select]").addEventListener("change", (event) => {
      state.style = event.target.value;
      resetEnhancedPromptState();
    });
    $("[data-aspect-select]").addEventListener("change", (event) => {
      state.aspect = event.target.value;
      resetEnhancedPromptState();
    });
    $("[data-duration-select]").addEventListener("change", (event) => {
      state.duration = Number(event.target.value);
      resetEnhancedPromptState();
      updateCost();
    });
    $("[data-cancel-generation]").addEventListener("click", () => {
      state.abortController?.abort();
      setLoading(false);
    });
    $("[data-show-enhanced-prompt]")?.addEventListener("click", openEnhancedPromptModal);
    $("[data-close-enhanced-prompt]")?.addEventListener("click", closeEnhancedPromptModal);
    $("[data-enhanced-prompt-modal]")?.addEventListener("click", (event) => {
      if (event.target === event.currentTarget) closeEnhancedPromptModal();
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
