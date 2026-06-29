(function () {
  const API_BASE_URL = window.AdvancedProConfig?.apiBaseUrl || "";
  const BUILD_VERSION = "2026.06.29-daily-tips-v1";
  console.info("PIXIGEN_BUILD:", BUILD_VERSION);

  const state = {
    key: null,
    type: "image",
    quality: "normal",
    style: "realistic",
    aspect: "16:9",
    duration: 5,
    loading: false,
    activeRequestId: null,
    abortController: null,
    enhancedFinalPrompt: "",
    enhancedPromptDebug: null,
    upgradeRecommendationDismissed: false,
    results: [],
    activeView: "home",
    sectionFilter: "all",
    sectionSearch: "",
    activeMenuId: null,
    activeMenuScope: null,
    favorites: new Set(),
    refreshTimer: null,
    generationTimeoutTimer: null,
    autoOpenGenerationId: null,
    autoOpenGenerationHandled: false,
    pendingGenerationId: null,
    generationsHydrated: false,
    dailyTipCursor: null,
  };

  const IMAGE_XP_COST = { normal: 5, high: 10, ultra: 20 };
  const VIDEO_XP_COST = {
    5: { normal: 50, high: 100, ultra: 200 },
    8: { normal: 80, high: 160, ultra: 320 },
  };
  const VIDEO_DURATIONS = [5, 8];
  const ADVPROAI_URL = "https://advproai.com";
  const MAX_VIDEO_DURATION_BY_QUALITY = { normal: 8, high: 8, ultra: 8 };
  const USER_FACING_MODEL_NAMES = {
    image: {
      normal: "وميض",
      high: "رؤية",
      ultra: "إتقان برو",
    },
    video: {
      normal: "وميض موشن",
      high: "رؤية موشن",
      ultra: "إتقان موشن",
    },
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const DASHBOARD_EN_TEXT = new Map([
    ["لوحة التحكم", "Dashboard"],
    ["إنشاء جديد", "Create"],
    ["صورة", "Image"],
    ["فيديو", "Video"],
    ["المحتوى", "Content"],
    ["مشاريعي", "Projects"],
    ["المفضلة", "Favorites"],
    ["النماذج", "Models"],
    ["القوالب", "Templates"],
    ["الحساب", "Account"],
    ["باقتي", "Plan"],
    ["معاملاتي", "Transactions"],
    ["إعدادات الحساب", "Account Settings"],
    ["مركز الدعم", "Support Center"],
    ["تحتاج إلى مساعدة؟", "Need help?"],
    ["تواصل معنا", "Contact us"],
    ["العميل", "Customer"],
    ["ماذا ترغب في إنشاء اليوم؟", "What would you like to create today?"],
    ["اختر نوع المحتوى وابدأ تجربة الإبداع", "Choose a content type and start creating."],
    ["اكتب وصف الصورة التي تريد إنشاءها...", "Describe the image you want to create..."],
    ["التكلفة المتوقعة", "Estimated cost"],
    ["صورة عادية", "Normal image"],
    ["إنشاء الآن ✨", "Create now ✨"],
    ["✨ تحسين ذكي", "✨ Smart enhance"],
    ["عرض البرومبت المحسن", "Show enhanced prompt"],
    ["يرتب الوصف ويحافظ على الألوان والعلاقات قبل الإرسال.", "Refines the prompt and preserves colors and relationships before sending."],
    ["النمط", "Style"],
    ["المقاس", "Aspect ratio"],
    ["المدة", "Duration"],
    ["الجودة", "Quality"],
    ["واقعي", "Realistic"],
    ["سينمائي", "Cinematic"],
    ["أنمي", "Anime"],
    ["ثلاثي الأبعاد", "3D"],
    ["إعلاني", "Commercial"],
    ["عادية", "Normal"],
    ["عالية", "High"],
    ["فائقة", "Ultra"],
    ["أحدث الإبداعات", "Latest Creations"],
    ["عرض الكل", "View all"],
    ["نصائح للإبداع", "Creative Tips"],
    ["استخدم تفاصيل دقيقة", "Use precise details"],
    ["كلما كان وصفك دقيقًا كانت النتيجة أفضل.", "The more precise your prompt, the better the result."],
    ["اختر الجودة المناسبة", "Choose the right quality"],
    ["الجودة الأعلى تعطي تفاصيل أدق بتكلفة أكبر.", "Higher quality gives finer details at a higher cost."],
    ["جرّب أنماطًا مختلفة", "Try different styles"],
    ["اكتشف جمال الفكرة بأكثر من أسلوب.", "Explore your idea through different styles."],
    ["الأبعاد تؤثر على النتيجة", "Aspect ratio matters"],
    ["اختر المقاس المناسب لاستخدامك.", "Choose the right size for your use case."],
    ["رصيدي الحالي", "Current balance"],
    ["ترقية الباقة ✨", "Upgrade plan ✨"],
    ["استهلاكك سريع", "Quick usage"],
    ["صور", "Images"],
    ["عرض كل الإحصائيات", "View all stats"],
    ["معاملات حديثة", "Recent Transactions"],
    ["عرض كل المعاملات", "View all transactions"],
    ["هل أنت متأكد؟", "Are you sure?"],
    ["سيتم حذف هذا المشروع.", "This project will be deleted."],
    ["إلغاء", "Cancel"],
    ["حذف", "Delete"],
    ["البرومبت المحسن", "Enhanced prompt"],
    ["هذا العرض للمشرف فقط لمراجعة البرومبت النهائي قبل الإرسال.", "This admin-only preview shows the final prompt before sending."],
    ["فتح القائمة", "Open menu"],
    ["إغلاق القائمة", "Close menu"],
    ["التنبيهات", "Notifications"],
    ["رصيدك الحالي", "Current balance"],
  ]);

  const DASHBOARD_EN_PLACEHOLDERS = new Map([
    [
      "مثال: رجل أعمال وسيم يرتدي بدلة فاخرة داخل مكتب حديث، إضاءة سينمائية...",
      "Example: a frightened man inside a dark cave, cinematic lighting, realistic details..."
    ],
  ]);

  function applyDashboardLanguage(settings = getSettings()) {
    const language = settings.language === "en" ? "en" : "ar";
    const root = document.body;
    root.querySelectorAll("input[placeholder], textarea[placeholder]").forEach((field) => {
      if (!field.dataset.originalPlaceholder) {
        field.dataset.originalPlaceholder = field.getAttribute("placeholder") || "";
      }
      const original = field.dataset.originalPlaceholder;
      field.setAttribute(
        "placeholder",
        language === "en" ? (DASHBOARD_EN_PLACEHOLDERS.get(original) || original) : original
      );
    });

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        if (node.parentElement?.closest("textarea,input,script,style,pre,[data-prompt-input],[data-enhanced-prompt-preview]")) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((node) => {
      if (!node.__pixigenOriginalText) {
        node.__pixigenOriginalText = node.nodeValue;
      }
      const original = node.__pixigenOriginalText;
      const trimmed = original.trim();
      const translated = DASHBOARD_EN_TEXT.get(trimmed);
      if (language === "en" && translated) {
        node.nodeValue = original.replace(trimmed, translated);
      } else {
        node.nodeValue = original;
      }
    });
  }

  function apiUrl(path) {
    return `${API_BASE_URL}${path}`;
  }

  function sanitizeUserMessage(message, fallback = "تعذر إتمام الطلب مؤقتًا، حاول لاحقًا.") {
    const text = String(message || "").trim();
    if (!text) return fallback;
    if (
      /<\s*(!doctype|html|body|svg|path|div|section|main|header|footer)\b/i.test(text) ||
      /<\/?(html|body|svg|path|div|section|main|header|footer)>/i.test(text) ||
      /(?:\bM\d+(?:\.\d+)?\s+\d+(?:\.\d+)?\b.*\bd=)/i.test(text)
    ) {
      return fallback;
    }
    if (/api[_-\s]*key|gemini|wavespeed|prompt_translation|deepseek|env\b|process\.env/i.test(text)) {
      return fallback;
    }
    return text;
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

    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    const text = await response.text();
    let data = {};
    if (text) {
      if (contentType.includes("application/json")) {
        try {
          data = JSON.parse(text);
        } catch {
          data = { message: "تعذر إتمام الطلب مؤقتًا، حاول لاحقًا." };
        }
      } else {
        data = { message: sanitizeUserMessage(text) };
      }
    }

    if (!response.ok && !contentType.includes("application/json") && text) {
      console.warn("NON_JSON_API_RESPONSE", {
        path,
        status: response.status,
        contentType,
        preview: text.slice(0, 400),
      });
      data = { message: "تعذر إتمام الطلب مؤقتًا، حاول لاحقًا." };
    }

    if (!response.ok) {
      const error = new Error(data.message || data.error || "تعذر تنفيذ الطلب");
      error.status = response.status;
      error.data = data;
      throw error;
    }

    if (!contentType.includes("application/json")) {
      console.warn("UNEXPECTED_NON_JSON_SUCCESS_RESPONSE", {
        path,
        status: response.status,
        contentType,
        preview: text.slice(0, 400),
      });
      throw new Error("تعذر إتمام الطلب مؤقتًا، حاول لاحقًا.");
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

  function resolveUserFacingModelName(model, { type = "image", quality = "high" } = {}) {
    const raw = String(model || "").trim().toLowerCase();
    if (raw.includes("z-image")) return USER_FACING_MODEL_NAMES.image.normal;
    if (raw.includes("seedream")) return USER_FACING_MODEL_NAMES.image.high;
    if (raw.includes("nano-banana")) return USER_FACING_MODEL_NAMES.image.ultra;
    if (raw.includes("wan-2.2/t2v-480p-ultra-fast") || raw.includes("wan-2.2-ultra-fast")) {
      return USER_FACING_MODEL_NAMES.video.normal;
    }
    if (raw.includes("wan-2.2-animate") || raw.includes("wan-2.7")) {
      return USER_FACING_MODEL_NAMES.video.high;
    }
    if (raw.includes("kling-v3.0-std") || raw.includes("kling-3.0-std")) {
      return USER_FACING_MODEL_NAMES.video.ultra;
    }

    const group = USER_FACING_MODEL_NAMES[type] || USER_FACING_MODEL_NAMES.image;
    return group[quality] || group.high || USER_FACING_MODEL_NAMES.image.high;
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

    const normalizedDuration = VIDEO_DURATIONS.includes(Number(duration)) ? Number(duration) : 5;
    return VIDEO_XP_COST[normalizedDuration]?.[quality] || VIDEO_XP_COST[5][quality];
  }

  function estimatePromptComplexity(prompt) {
    const text = String(prompt || "").trim().toLowerCase();
    if (!text) return 0;

    const words = text.split(/\s+/).filter(Boolean);
    const relationWords = [
      "بجانب",
      "معه",
      "فوق",
      "داخل",
      "خلف",
      "أمام",
      "امام",
      "بين",
      "يمسك",
      "يجلس",
      "يرتدي",
      "يقود",
      "يطير",
      "راكب",
      "next to",
      "inside",
      "behind",
      "in front",
      "wearing",
      "driving",
    ];
    const colorWords = [
      "أسود",
      "اسود",
      "أبيض",
      "ابيض",
      "أحمر",
      "احمر",
      "أخضر",
      "اخضر",
      "أصفر",
      "اصفر",
      "أزرق",
      "ازرق",
      "black",
      "white",
      "red",
      "green",
      "yellow",
      "blue",
    ];
    const subjectWords = [
      "رجل",
      "امرأة",
      "شخص",
      "طفل",
      "كلب",
      "قط",
      "قطة",
      "روبوت",
      "سيارة",
      "فراري",
      "منزل",
      "بيت",
      "قمر",
      "man",
      "woman",
      "person",
      "dog",
      "cat",
      "robot",
      "car",
      "house",
      "moon",
    ];
    const countMatches = (items) => items.reduce((total, item) => total + (text.includes(item) ? 1 : 0), 0);
    const relationScore = countMatches(relationWords) * 3;
    const colorScore = countMatches(colorWords) * 1.5;
    const subjectScore = Math.max(0, countMatches(subjectWords) - 1) * 2;
    const lengthScore = words.length > 18 ? 3 : words.length > 10 ? 1.5 : 0;
    const numberScore = /(^|\s)(\d+|اثنين|ثلاثة|ثلاث|أربعة|اربعة|خمسة|ستة|سبعة|ثمانية|تسعة|عشرة)\s/.test(text)
      ? 2
      : 0;

    return Math.min(12, Math.round((relationScore + colorScore + subjectScore + lengthScore + numberScore) * 10) / 10);
  }

  function shouldRecommendQualityUpgrade() {
    if (state.type !== "image" || state.quality !== "normal" || state.upgradeRecommendationDismissed) {
      return false;
    }
    const promptInput = $("[data-prompt-input]");
    return estimatePromptComplexity(promptInput?.value || "") >= 8;
  }

  function updateUpgradeRecommendation() {
    const card = $("[data-upgrade-recommendation]");
    if (!card) return;
    card.hidden = !shouldRecommendQualityUpgrade();
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
      customerName: key.customerName || key.customer_name || key.ownerName || key.name || "العميل",
      customerEmail: key.customerEmail || key.customer_email || key.email || "",
      planName: key.planName || key.plan_name || key.plan || "VIP",
      status: key.status || "active",
      codeMasked: key.codeMasked || key.maskedCode || key.code || "APRO-XXXX-YYYY",
      expiresAt: key.expiresAt || key.expires_at,
    };
  }

  function normalizeGeneration(item) {
    const generationId = item.id || item.generationId || crypto.randomUUID();
    const rawResultUrl =
      item.storageUrl ||
      item.storage_url ||
      item.resultUrl ||
      item.result_url ||
      item.url ||
      item.outputUrl ||
      item.output_url ||
      item.imageUrl ||
      item.image_url ||
      item.videoUrl ||
      item.video_url ||
      "";
    const rawThumbnailUrl =
      item.thumbnailUrl ||
      item.thumbnail_url ||
      item.storageUrl ||
      item.storage_url ||
      item.resultUrl ||
      item.result_url ||
      item.url ||
      item.outputUrl ||
      item.output_url ||
      "";
    const explicitStatus = item.status || "";
    const hasMedia = Boolean(rawResultUrl || rawThumbnailUrl);
    const protectedDownloadUrl = generationId && hasMedia ? `/api/download/${encodeURIComponent(generationId)}?inline=1` : "";
    return {
      id: generationId,
      requestId: item.requestId,
      type: item.type || "image",
      prompt: item.userPrompt || item.prompt || item.description || "نتيجة جديدة",
      finalPrompt: item.finalPrompt || item.final_prompt || "",
      quality: item.quality || "high",
      style: item.style || "realistic",
      aspectRatio: item.aspectRatio || item.aspect || "16:9",
      duration: item.duration,
      provider: item.provider,
      model: resolveUserFacingModelName(item.model, {
        type: item.type || "image",
        quality: item.quality || "high",
      }),
      seed: item.seed,
      creditsUsed: Number(item.creditsUsed ?? item.credits_used ?? item.xpCost ?? item.cost ?? calculateCredits()),
      createdAt: item.createdAt || item.created_at || new Date().toISOString(),
      resultUrl: rawResultUrl || protectedDownloadUrl,
      thumbnailUrl: rawThumbnailUrl || rawResultUrl || protectedDownloadUrl,
      downloadUrl: protectedDownloadUrl || rawResultUrl,
      rawResultUrl,
      rawThumbnailUrl,
      status: explicitStatus || (hasMedia ? "completed" : "processing"),
      errorMessage: item.errorMessage || item.error_message || item.message || null,
      isFavorite: Boolean(
        item.isFavorite ||
          item.is_favorite ||
          item.favorite ||
          item.generation?.isFavorite ||
          item.generation?.is_favorite ||
          state.favorites.has(String(generationId))
      ),
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
    const name = key.customerName || "العميل";

    $("[data-customer-name]").textContent = name;
    $("[data-customer-avatar]").src = "/assets/pixigen-robot-avatar.svg";
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

  function setLoading(isLoading) {
    state.loading = isLoading;
    const button = $("[data-submit-button]");
    const buttonLabel = $("[data-submit-label]");
    const enhanceButton = $("[data-smart-enhance]");
    button.disabled = isLoading;
    button.classList.toggle("is-loading", isLoading);
    if (enhanceButton) enhanceButton.disabled = isLoading;
    if (isLoading) {
      const labels =
        state.type === "video"
          ? ["جاري إنشاء الفيديو...", "جاري تجهيز الفيديو...", "جاري تحسين الفيديو...", "الإنشاء مستمر..."]
          : ["جاري إنشاء الصورة...", "جاري تجهيز الصورة...", "جاري تحسين الصورة...", "الإنشاء مستمر..."];
      let index = 0;
      if (buttonLabel) {
        buttonLabel.textContent = labels[index];
      }
      clearInterval(setLoading.labelTimer);
      setLoading.labelTimer = setInterval(() => {
        index = (index + 1) % labels.length;
        if (buttonLabel) {
          buttonLabel.textContent = labels[index];
        }
      }, 1600);
      return;
    }

    clearInterval(setLoading.labelTimer);
    if (buttonLabel) {
      buttonLabel.textContent = "إنشاء الآن ✨";
    }
  }

  function confirmAction(message = "هل أنت متأكد؟") {
    const modal = $("[data-confirm-modal]");
    const messageNode = $("[data-confirm-message]");
    const accept = $("[data-confirm-accept]");
    const cancel = $("[data-confirm-cancel]");
    if (!modal || !accept || !cancel) return Promise.resolve(false);

    messageNode.textContent = message;
    modal.hidden = false;

    return new Promise((resolve) => {
      const finish = (accepted) => {
        modal.hidden = true;
        accept.removeEventListener("click", onAccept);
        cancel.removeEventListener("click", onCancel);
        modal.removeEventListener("click", onBackdrop);
        resolve(accepted);
      };
      const onAccept = () => finish(true);
      const onCancel = () => finish(false);
      const onBackdrop = (event) => {
        if (event.target === modal) finish(false);
      };
      accept.addEventListener("click", onAccept);
      cancel.addEventListener("click", onCancel);
      modal.addEventListener("click", onBackdrop);
    });
  }

  function setType(type) {
    state.type = type;
    state.upgradeRecommendationDismissed = false;
    resetEnhancedPromptState();
    $$("[data-type-tab]").forEach((button) => button.classList.toggle("is-active", button.dataset.typeTab === type));
    $$("[data-type-shortcut]").forEach((link) => {
      link.classList.toggle("is-active", state.activeView === "home" && link.dataset.typeShortcut === type);
    });
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
    updateUpgradeRecommendation();
  }

  function renderRecent() {
    const grid = $("[data-recent-grid]");
    if (!state.generationsHydrated) {
      grid.innerHTML = Array.from({ length: 5 }, () => `
        <article class="udv3-creation-card udv3-creation-card--skeleton" aria-hidden="true">
          <span class="udv3-skeleton-box udv3-skeleton-box--media"></span>
          <div class="udv3-creation-body">
            <span class="udv3-skeleton-box udv3-skeleton-box--title"></span>
            <div class="udv3-creation-meta">
              <span class="udv3-skeleton-box udv3-skeleton-box--meta"></span>
              <span class="udv3-skeleton-box udv3-skeleton-box--menu"></span>
            </div>
          </div>
        </article>
      `).join("");
      return;
    }
    const list = uniqueGenerations(state.results).slice(0, 5);
    grid.innerHTML = list.length
      ? list.map(renderCreationCardFixed).join("")
      : renderDailyTipCard({ compact: true });
  }

  function dailyTipIndex(offset = 0) {
    const day = Math.floor(Date.now() / 86400000);
    return (day + offset + DAILY_TIPS.length) % DAILY_TIPS.length;
  }

  function getDailyTip(offset = 0) {
    return DAILY_TIPS[dailyTipIndex(offset)] || DAILY_TIPS[0];
  }

  function renderDailyTipCard({ compact = false } = {}) {
    const offset = Number.isInteger(state.dailyTipCursor) ? state.dailyTipCursor : 0;
    const [title, copy, icon] = getDailyTip(offset);
    const current = dailyTipIndex(offset);
    const dots = Array.from({ length: 5 }, (_, index) => {
      const isActive = index === current % 5;
      return `<span class="${isActive ? "is-active" : ""}" aria-hidden="true"></span>`;
    }).join("");

    return `
      <article class="udv3-daily-tip ${compact ? "is-compact" : ""}" data-daily-tip-card>
        <header>
          <strong>نصيحة اليوم</strong>
          <svg><use href="#udv5-bulb"></use></svg>
        </header>
        <div class="udv3-daily-tip__body">
          <i><svg><use href="#${escapeHtml(icon)}"></use></svg></i>
          <h3>${escapeHtml(title)}</h3>
          <p>${escapeHtml(copy)}</p>
          <button type="button" data-daily-tip-apply>تطبيق الآن</button>
        </div>
        <footer>
          <button type="button" data-daily-tip-prev aria-label="النصيحة السابقة">‹</button>
          <div>${dots}</div>
          <button type="button" data-daily-tip-next aria-label="النصيحة التالية">›</button>
        </footer>
      </article>
    `;
  }

  function renderDailyTips() {
    const grid = $("[data-tips-grid]");
    if (!grid) return;
    const start = dailyTipIndex(0);
    const items = Array.from({ length: 4 }, (_, index) => DAILY_TIPS[(start + index) % DAILY_TIPS.length]);
    grid.innerHTML = items
      .map(([title, copy, icon]) => `
        <article>
          <i><svg><use href="#${escapeHtml(icon)}"></use></svg></i>
          <strong>${escapeHtml(title)}</strong>
          <span>${escapeHtml(copy)}</span>
        </article>
      `)
      .join("");

    const dateLabel = $("[data-daily-tip-date]");
    if (dateLabel) {
      dateLabel.textContent = `نصائح اليوم ${new Date().toLocaleDateString("ar-SA", { day: "numeric", month: "short" })}`;
    }
  }

  function renderCreationCard(item) {
    const mediaUrl = item.thumbnailUrl || item.resultUrl;
    const prompt = escapeHtml(item.prompt);
    const meta = `${qualityLabel(item.quality)} · ${relativeTime(item.createdAt)}`;
    const targetUrl = `/generation?id=${encodeURIComponent(item.id)}`;
    const isProcessing = item.status !== "completed" || !item.resultUrl;
    const media = isProcessing
      ? `<div class="udv3-creation-placeholder"><strong>جاري الإنشاء...</strong><span>${escapeHtml(item.prompt || "نحن نحضر نتيجتك الآن")}</span><i></i><small>يتم حفظ النتيجة تلقائيًا داخل حسابك</small></div>`
      : item.type === "video"
        ? `<video src="${escapeHtml(mediaUrl)}" muted playsinline preload="metadata"></video>`
        : `<img src="${escapeHtml(mediaUrl)}" alt="${prompt}" loading="lazy" />`;

    return `
      <article class="udv3-creation-card ${isProcessing ? "is-processing" : ""}">
        <a class="udv3-creation-preview" href="${targetUrl}" data-generation-link="${escapeHtml(item.id)}">
          <span class="udv3-creation-media">${media}</span>
          <b>${isProcessing ? "جاري الإنشاء..." : typeLabel(item.type)}</b>
        </a>
        <div class="udv3-creation-body">
          <h3>${prompt}</h3>
          <div class="udv3-creation-meta">
            <p>${meta}</p>
            <div class="udv3-card-menu-wrap">
              <button class="udv3-card-menu" type="button" data-menu-generation-id="${escapeHtml(item.id)}" aria-label="إجراءات المشروع">⋮</button>
              ${renderGenerationMenu(item)}
            </div>
          </div>
        </div>
      </article>
    `;
  }

  function renderCreationCardFixed(item) {
    const mediaUrl = item.thumbnailUrl || item.resultUrl;
    const fallbackUrl = item.downloadUrl || "";
    const prompt = escapeHtml(item.prompt);
    const meta = `${qualityLabel(item.quality)} · ${relativeTime(item.createdAt)}`;
    const targetUrl = `/generation?id=${encodeURIComponent(item.id)}`;
    const isProcessing = item.status !== "completed" || !item.resultUrl;
    const media = isProcessing
      ? `<div class="udv6-creation-placeholder"><strong>جاري الإنشاء...</strong><span>${escapeHtml(item.prompt || "نحن نحضر نتيجتك الآن")}</span><i></i><small>يتم حفظ النتيجة تلقائيًا داخل حسابك</small></div>`
      : item.type === "video"
        ? `<video src="${escapeHtml(mediaUrl)}" muted playsinline preload="metadata"></video>`
        : `<img src="${escapeHtml(mediaUrl)}"${fallbackUrl && fallbackUrl !== mediaUrl ? ` data-fallback-src="${escapeHtml(fallbackUrl)}"` : ""} alt="${prompt}" loading="lazy" onerror="if(this.dataset.fallbackSrc&&!this.dataset.fallbackTried){this.dataset.fallbackTried='1';this.src=this.dataset.fallbackSrc}else{this.closest('.udv3-creation-media')?.classList.add('is-media-broken');this.remove();}" />`;

    return `
      <article class="udv3-creation-card ${isProcessing ? "is-processing" : ""}">
        <a class="udv3-creation-preview" href="${targetUrl}" data-generation-link="${escapeHtml(item.id)}">
          <span class="udv3-creation-media">${media}</span>
          <b>${isProcessing ? "جاري الإنشاء..." : typeLabel(item.type)}</b>
        </a>
        <button
          class="udv6-favorite-button"
          type="button"
          data-generation-action="favorite"
          data-generation-id="${escapeHtml(item.id)}"
          data-active="${String(Boolean(item.isFavorite))}"
          aria-label="${item.isFavorite ? "إزالة من المفضلة" : "إضافة إلى المفضلة"}"
        >${item.isFavorite ? "♥" : "♡"}</button>
        <div class="udv3-creation-body">
          <h3>${prompt}</h3>
          <div class="udv3-creation-meta">
            <p>${meta}</p>
            <div class="udv3-card-menu-wrap">
              <button class="udv3-card-menu" type="button" data-menu-generation-id="${escapeHtml(item.id)}" data-menu-scope="recent" aria-label="إجراءات المشروع">⋮</button>
              ${renderGenerationMenu(item)}
            </div>
          </div>
        </div>
      </article>
    `;
  }

  const TEMPLATE_ITEMS = [
    {
      id: "luxury-product",
      category: "ads",
      title: "إعلان منتج فاخر",
      prompt: "إعلان احترافي لمنتج فاخر على منصة رخامية، إضاءة استوديو سينمائية، خلفية نظيفة وتفاصيل دقيقة",
      image: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=900&q=80",
    },
    {
      id: "youtube-cover",
      category: "youtube",
      title: "غلاف يوتيوب جذاب",
      prompt: "غلاف يوتيوب سينمائي عالي التباين مع موضوع رئيسي واضح ومساحة نظيفة للعنوان",
      image: "https://images.unsplash.com/photo-1492619375914-88005aa9e8fb?auto=format&fit=crop&w=900&q=80",
    },
    {
      id: "social-post",
      category: "instagram",
      title: "منشور إنستغرام",
      prompt: "تصميم منشور إنستغرام عصري بألوان متناسقة وتكوين بسيط وفخم وإضاءة ناعمة",
      image: "https://images.unsplash.com/photo-1557683316-973673baf926?auto=format&fit=crop&w=900&q=80",
    },
    {
      id: "brand-logo",
      category: "logos",
      title: "شعار احترافي",
      prompt: "شعار هندسي بسيط وفاخر لعلامة تقنية حديثة، تكوين متوازن وخلفية محايدة",
      image: "https://images.unsplash.com/photo-1561070791-2526d30994b5?auto=format&fit=crop&w=900&q=80",
    },
    {
      id: "real-estate",
      category: "realestate",
      title: "عقار فاخر",
      prompt: "فيلا عصرية فاخرة وقت الغروب، تصوير معماري احترافي، واجهة كاملة وإضاءة دافئة",
      image: "https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=900&q=80",
    },
    {
      id: "sports-car",
      category: "cars",
      title: "سيارة رياضية",
      prompt: "سيارة رياضية سوداء في شارع مدينة مضاء ليلًا، تصوير إعلاني سينمائي وانعكاسات واقعية",
      image: "https://images.unsplash.com/photo-1503736334956-4c8f8e92946d?auto=format&fit=crop&w=900&q=80",
    },
  ];

  const DAILY_TIPS = [
    ["استخدم تفاصيل دقيقة", "كلما كان وصفك دقيقًا كانت النتيجة أقرب لما تتخيله.", "udv5-detail"],
    ["حدد زاوية التصوير", "اكتب لقطة قريبة، واسعة، علوية، أو من مستوى العين.", "udv5-crop"],
    ["اختر المقاس مبكرًا", "المشهد الأفقي يختلف عن العمودي في توزيع العناصر.", "udv5-crop"],
    ["جرّب النمط السينمائي", "استخدمه للمشاهد الدرامية والإضاءة القوية.", "udv5-palette"],
    ["أضف الإضاءة", "اذكر ضوء ناعم، غروب، إضاءة استوديو، أو ظلال قوية.", "udv5-detail"],
    ["ثبّت الألوان المهمة", "إذا كان اللون مهمًا اكتبه بوضوح بجانب العنصر نفسه.", "udv5-palette"],
    ["اكتب عدد العناصر", "بدل كلمة عدة، اكتب اثنان أو ثلاثة لتقليل الأخطاء.", "udv5-quality"],
    ["صف الخلفية", "الخلفية الواضحة تمنع ظهور عناصر غير مرغوبة.", "udv5-detail"],
    ["حدد مكان الشخص", "داخل كهف، فوق جبل، بجانب سيارة، أو أمام منزل.", "udv5-crop"],
    ["استخدم جودة أعلى للمشاهد المعقدة", "الجودة الأعلى تساعد عند وجود أكثر من عنصر مهم.", "udv5-quality"],
    ["اجعل الطلب مشهدًا واحدًا", "اطلب صورة واحدة مترابطة وليس تصميمًا مقسمًا.", "udv5-crop"],
    ["اكتب ما لا تريده", "أضف بدون نصوص أو شعارات عند الحاجة.", "udv5-detail"],
    ["استخدم أسلوب إعلاني للمنتجات", "يناسب المنتجات، العطور، السيارات، والعروض التجارية.", "udv5-palette"],
    ["استخدم أنمي للشخصيات", "يعطي طابعًا مرسومًا وواضحًا للشخصيات الخيالية.", "udv5-palette"],
    ["حدد حجم العنصر", "كبير جدًا، صغير، قريب من الكاميرا، أو بعيد.", "udv5-crop"],
    ["صف المشاعر", "خائف، سعيد، هادئ، متوتر، أو واثق.", "udv5-detail"],
    ["اجعل الموضوع الرئيسي واضحًا", "ابدأ الوصف بالعنصر الأهم في الصورة.", "udv5-quality"],
    ["اكتب البيئة الطبيعية", "غابة، شاطئ، صحراء، حديقة، أو مدينة ليلية.", "udv5-detail"],
    ["استخدم 9:16 للجوال", "مناسب للقصص والريلز والشورتس.", "udv5-crop"],
    ["استخدم 16:9 للمشاهد الواسعة", "مناسب للطبيعة، السينما، والواجهات العريضة.", "udv5-crop"],
    ["استخدم 1:1 للمنشورات", "مناسب للصور الاجتماعية والبروفايلات.", "udv5-crop"],
    ["استخدم 4:5 للإعلانات", "يعطي مساحة عمودية جميلة للمنتجات والمنشورات.", "udv5-crop"],
    ["كرر العلاقة المهمة", "إذا قلت بجانب أو فوق، وضح من بجانب ماذا.", "udv5-detail"],
    ["اجعل النص قصيرًا عند الحاجة", "الوصف القصير الجيد أفضل من وصف طويل مشتت.", "udv5-quality"],
    ["استخدم تفاصيل خامة", "زجاج، معدن، خشب، قماش، ضباب، أو انعكاسات.", "udv5-palette"],
    ["حدد وقت المشهد", "صباح، غروب، ليل، أو ضوء القمر.", "udv5-detail"],
    ["اطلب صورة واقعية عند الالتباس", "كلمة واقعية تقلل النتائج الكرتونية غير المطلوبة.", "udv5-quality"],
    ["استخدم ثلاثي الأبعاد للمجسمات", "ممتاز للأيقونات، المنتجات الرقمية، والشخصيات المجسمة.", "udv5-palette"],
    ["راجع الوصف قبل الإرسال", "تأكد أن كل عنصر مهم مذكور مرة واحدة بوضوح.", "udv5-quality"],
    ["ابدأ بفكرة بسيطة", "أنشئ نسخة أولى ثم حسّنها بالتدريج.", "udv5-detail"],
  ];

  function loadLocalPreferences() {
    restoreCachedKey();
    loadFavorites();
    const settings = getSettings();
    state.quality =
      settings.explicitQualityPreference && ["normal", "high", "ultra"].includes(settings.quality)
        ? settings.quality
        : "normal";
    hydrateCachedGenerations();
  }

  function getFavoritesCacheKey(keyLike = state.key) {
    const generationCacheKey = getGenerationCacheKey(keyLike);
    return generationCacheKey ? generationCacheKey.replace("pixigen:generations:", "pixigen:favorites:") : "pixigen:favorites";
  }

  function loadFavorites(keyLike = state.key) {
    try {
      const scopedFavorites = localStorage.getItem(getFavoritesCacheKey(keyLike));
      const legacyFavorites = localStorage.getItem("pixigen:favorites");
      const favorites = JSON.parse(scopedFavorites || legacyFavorites || "[]");
      state.favorites = new Set(Array.isArray(favorites) ? favorites.map(String) : []);
    } catch {
      state.favorites = new Set();
    }
  }

  function saveFavorites() {
    try {
      const payload = JSON.stringify(Array.from(state.favorites));
      localStorage.setItem(getFavoritesCacheKey(), payload);
      localStorage.setItem("pixigen:favorites", payload);
    } catch {
      // Local persistence is optional; the current session remains functional.
    }
  }

  function resultsSortValue(item) {
    return Date.parse(item?.createdAt || item?.completedAt || "") || 0;
  }

  function sortGenerations(items) {
    return items.slice().sort((a, b) => resultsSortValue(b) - resultsSortValue(a));
  }

  function generationUniqueKey(item) {
    return generationUniqueKeys(item)[0] || `unknown:${Math.random()}`;
  }

  function generationUniqueKeys(item) {
    const keys = [];
    const requestId = String(item?.requestId || "").trim();
    if (requestId) keys.push(`request:${requestId}`);
    const url = String(item?.rawResultUrl || item?.rawThumbnailUrl || "").trim();
    if (url) keys.push(`url:${url.replace(/[?&]v=[^&]+/g, "").split("#")[0]}`);
    const prompt = String(item?.prompt || "").trim().replace(/\s+/g, " ").slice(0, 180);
    const createdAt = Date.parse(item?.createdAt || item?.completedAt || "");
    const timeBucket = Number.isFinite(createdAt) ? Math.floor(createdAt / 120000) : "";
    if (prompt) keys.push(`prompt:${item?.type || "image"}:${prompt}:${timeBucket}`);
    const id = String(item?.id || "").trim();
    if (id) keys.push(`id:${id}`);
    return keys;
  }

  function uniqueGenerations(items = []) {
    const seen = new Map();
    const unique = [];
    for (const item of items || []) {
      const keys = generationUniqueKeys(item);
      const existingIndex = keys
        .map((key) => seen.get(key))
        .find((index) => Number.isInteger(index));
      if (Number.isInteger(existingIndex)) {
        const existing = unique[existingIndex];
        const shouldReplace =
          item.status === "completed" &&
          existing?.status !== "completed" &&
          (item.resultUrl || item.thumbnailUrl);
        if (shouldReplace) {
          unique[existingIndex] = {
            ...existing,
            ...item,
            isFavorite: Boolean(existing?.isFavorite || item.isFavorite),
          };
          generationUniqueKeys(unique[existingIndex]).forEach((key) => seen.set(key, existingIndex));
        }
        continue;
      }
      const index = unique.length;
      keys.forEach((key) => seen.set(key, index));
      unique.push(item);
    }
    return unique;
  }

  function generationShareUrl(item) {
    const id = String(item?.id || "").trim();
    if (id) {
      return new URL(`/generation?id=${encodeURIComponent(id)}`, window.location.origin).toString();
    }
    const url = String(item?.rawResultUrl || item?.resultUrl || item?.thumbnailUrl || "").trim();
    if (!url) return "";
    try {
      return new URL(url, window.location.origin).toString();
    } catch {
      return url;
    }
  }

  function generationDirectMediaUrl(item) {
    const url = String(
      item?.rawResultUrl ||
        item?.rawThumbnailUrl ||
        item?.originalResultUrl ||
        item?.storageUrl ||
        item?.resultUrl ||
        item?.thumbnailUrl ||
        ""
    ).trim();
    if (!url) return "";
    try {
      return new URL(url, window.location.origin).toString();
    } catch {
      return url;
    }
  }

  function getCachedKeySnapshot() {
    const snapshots = [];
    try {
      const sessionKey = sessionStorage.getItem("pixigen:key");
      if (sessionKey) snapshots.push(JSON.parse(sessionKey));
    } catch {
      // Ignore broken session cache.
    }
    try {
      const localAccessCode = localStorage.getItem("advancedpro_access_code");
      if (localAccessCode) snapshots.push(JSON.parse(localAccessCode));
    } catch {
      // Ignore broken local cache.
    }
    return snapshots.find((entry) => entry && typeof entry === "object") || null;
  }

  function getGenerationCacheKey(keyLike = state.key) {
    const snapshot = keyLike || {};
    const activationKeyId = Number(snapshot.activationKeyId || snapshot.id || snapshot.keyId || 0);
    const workspaceId = Number(snapshot.workspace?.id || snapshot.workspaceId || 0);
    const codeMasked = String(snapshot.codeMasked || snapshot.maskedCode || snapshot.code || "").trim();
    if (activationKeyId) return `pixigen:generations:${activationKeyId}`;
    if (workspaceId) return `pixigen:generations:workspace:${workspaceId}`;
    if (codeMasked) return `pixigen:generations:${codeMasked}`;
    return "";
  }

  function persistKeySnapshot(keyLike = state.key) {
    const normalized = normalizeKey(keyLike || {});
    if (!Object.keys(normalized).length) return;
    try {
      sessionStorage.setItem("pixigen:key", JSON.stringify(normalized));
    } catch {
      // Ignore storage failures; the API remains the source of truth.
    }
    try {
      localStorage.setItem("advancedpro_access_code", JSON.stringify(normalized));
    } catch {
      // Ignore storage failures; the current session remains functional.
    }
  }

  function restoreCachedKey() {
    const snapshot = getCachedKeySnapshot();
    if (!snapshot) return;
    state.key = normalizeKey(snapshot);
  }

  function persistGenerationCache(items = state.results) {
    const cacheKey = getGenerationCacheKey();
    if (!cacheKey) return;
    const normalizedItems = uniqueGenerations(sortGenerations((items || []).map(normalizeGeneration)));
    try {
      localStorage.setItem(cacheKey, JSON.stringify(normalizedItems));
      sessionStorage.setItem(cacheKey, JSON.stringify(normalizedItems));
    } catch {
      // Ignore storage failures; rendering can still rely on live API data.
    }
  }

  function hydrateCachedGenerations(keyLike = state.key) {
    const cacheKey = getGenerationCacheKey(keyLike);
    if (!cacheKey) return false;
    const candidates = [];
    try {
      const sessionValue = sessionStorage.getItem(cacheKey);
      if (sessionValue) candidates.push(JSON.parse(sessionValue));
    } catch {
      // Ignore broken session cache.
    }
    try {
      const localValue = localStorage.getItem(cacheKey);
      if (localValue) candidates.push(JSON.parse(localValue));
    } catch {
      // Ignore broken local cache.
    }
    const storedItems = candidates.find(Array.isArray);
    if (!Array.isArray(storedItems) || !storedItems.length) return false;
    state.results = uniqueGenerations(sortGenerations(storedItems.map(normalizeGeneration)));
    state.generationsHydrated = true;
    return true;
  }

  function sectionItemMatches(item) {
    const filterMatches = state.sectionFilter === "all" || item.type === state.sectionFilter;
    const search = state.sectionSearch.trim().toLowerCase();
    const searchMatches = !search || String(item.prompt || "").toLowerCase().includes(search);
    return filterMatches && searchMatches;
  }

  function renderSectionStats(items = state.results) {
    const images = items.filter((item) => item.type === "image").length;
    const videos = items.filter((item) => item.type === "video").length;
    const latest = items[0]?.createdAt ? relativeTime(items[0].createdAt) : "لا يوجد نشاط";
    return `
      <div class="udv6-stat-grid">
        <article class="udv6-stat-card"><i>▣</i><div><span>إجمالي المشاريع</span><strong>${formatNumber(items.length)}</strong></div></article>
        <article class="udv6-stat-card"><i>▧</i><div><span>عدد الصور</span><strong>${formatNumber(images)}</strong></div></article>
        <article class="udv6-stat-card"><i>▶</i><div><span>عدد الفيديوهات</span><strong>${formatNumber(videos)}</strong></div></article>
        <article class="udv6-stat-card"><i>◷</i><div><span>آخر نشاط</span><strong style="font-size:16px">${escapeHtml(latest)}</strong></div></article>
      </div>
    `;
  }

  function generationMedia(item) {
    const resultUrl = escapeHtml(item.resultUrl || item.thumbnailUrl || "/ap-mark.svg");
    const thumbnailUrl = escapeHtml(item.thumbnailUrl || "");
    const fallbackUrl = escapeHtml(item.downloadUrl || "");
    if (!item.resultUrl && !item.thumbnailUrl) {
      return `<div class="udv6-media-placeholder"><span>جاري الإنشاء...</span><i></i><small>سيظهر المشروع هنا فور اكتماله</small></div>`;
    }
    if (item.type === "video") {
      return `<video src="${resultUrl}"${thumbnailUrl && thumbnailUrl !== resultUrl ? ` poster="${thumbnailUrl}"` : ""} muted playsinline preload="metadata"></video>`;
    }
    return `<img src="${resultUrl}"${fallbackUrl && fallbackUrl !== resultUrl ? ` data-fallback-src="${fallbackUrl}"` : ""} alt="${escapeHtml(item.prompt)}" loading="lazy" onerror="if(this.dataset.fallbackSrc&&!this.dataset.fallbackTried){this.dataset.fallbackTried='1';this.src=this.dataset.fallbackSrc}else{this.closest('.udv6-work-media,.udv3-creation-media')?.classList.add('is-media-broken');this.remove();}" />`;
  }

  function renderGenerationMenu(item) {
    const downloadLabel = item.type === "video" ? "تحميل الفيديو" : "تحميل";
    const isReady = Boolean(item.resultUrl && item.status === "completed");
    return `
      <div class="udv6-menu" data-generation-menu data-generation-menu-id="${escapeHtml(item.id)}" hidden>
        <button type="button" data-generation-action="download" data-generation-id="${escapeHtml(item.id)}" ${isReady ? "" : "disabled"}>${escapeHtml(downloadLabel)}</button>
        <button type="button" data-generation-action="copy" data-generation-id="${escapeHtml(item.id)}" ${isReady ? "" : "disabled"}>نسخ الرابط</button>
        <button class="is-danger" type="button" data-generation-action="delete" data-generation-id="${escapeHtml(item.id)}">حذف</button>
      </div>
    `;
  }

  function renderWorkCard(item, { favoriteView = false } = {}) {
    const targetUrl = `/generation?id=${encodeURIComponent(item.id)}`;
    const isProcessing = item.status !== "completed" || !item.resultUrl;
    return `
      <article class="udv6-work-card ${isProcessing ? "is-processing" : ""}">
        <a class="udv6-work-media" href="${targetUrl}">
          ${generationMedia(item)}
          <b>${typeLabel(item.type)}</b>
          ${favoriteView || item.isFavorite ? "<em>♥</em>" : ""}
        </a>
        <div class="udv6-work-body">
          <h3>${escapeHtml(item.prompt)}</h3>
          <div class="udv6-work-meta">
            <span>${qualityLabel(item.quality)} · ${relativeTime(item.createdAt)}</span>
            <div class="udv6-card-menu-wrap">
              <button class="udv6-card-menu-button" type="button" data-menu-generation-id="${escapeHtml(item.id)}" aria-label="إجراءات المشروع">⋮</button>
              ${renderGenerationMenu(item)}
            </div>
          </div>
        </div>
      </article>
    `;
  }

  function renderWorkCardFixed(item, { favoriteView = false } = {}) {
    const targetUrl = `/generation?id=${encodeURIComponent(item.id)}`;
    const isProcessing = item.status !== "completed" || !item.resultUrl;
    return `
      <article class="udv6-work-card ${isProcessing ? "is-processing" : ""}">
        <a class="udv6-work-media" href="${targetUrl}" data-generation-link="${escapeHtml(item.id)}">
          ${generationMedia(item)}
          <b>${typeLabel(item.type)}</b>
        </a>
        <button
          class="udv6-favorite-button"
          type="button"
          data-generation-action="favorite"
          data-generation-id="${escapeHtml(item.id)}"
          data-active="${String(Boolean(favoriteView || item.isFavorite))}"
          aria-label="${favoriteView || item.isFavorite ? "إزالة من المفضلة" : "إضافة إلى المفضلة"}"
        >${favoriteView || item.isFavorite ? "♥" : "♡"}</button>
        <div class="udv6-work-body">
          <h3>${escapeHtml(item.prompt)}</h3>
          <div class="udv6-work-meta">
            <span>${qualityLabel(item.quality)} · ${relativeTime(item.createdAt)}</span>
            <div class="udv6-card-menu-wrap">
              <button class="udv6-card-menu-button" type="button" data-menu-generation-id="${escapeHtml(item.id)}" data-menu-scope="${favoriteView ? "favorites" : "projects"}" aria-label="إجراءات المشروع">⋮</button>
              ${renderGenerationMenu(item)}
            </div>
          </div>
        </div>
      </article>
    `;
  }

  function renderProjectsSection() {
    const sourceItems = uniqueGenerations(state.results);
    const items = sourceItems.filter(sectionItemMatches);
    return `
      <div class="udv6-section-shell">
        <header class="udv6-section-head">
          <div><h1>مشاريعي</h1><p>كل الصور والفيديوهات التي أنشأتها في مكان واحد.</p></div>
          <button class="udv6-primary-button" type="button" data-section-create>＋ مشروع جديد</button>
        </header>
        ${renderSectionStats(sourceItems)}
        <section class="udv6-panel">
          <div class="udv6-toolbar">
            <input class="udv6-search" type="search" placeholder="ابحث في مشاريعك..." value="${escapeHtml(state.sectionSearch)}" data-section-search />
            ${renderTypeFilters()}
          </div>
          ${items.length ? `<div class="udv6-card-grid">${items.map((item) => renderWorkCardFixed(item)).join("")}</div>` : renderEmpty("لا توجد مشاريع مطابقة", "ابدأ بإنشاء أول صورة أو فيديو، وستظهر هنا مباشرة.")}
        </section>
      </div>
    `;
  }

  function renderTypeFilters() {
    return `
      <div class="udv6-segmented">
        <button class="${state.sectionFilter === "all" ? "is-active" : ""}" type="button" data-section-filter="all">الكل</button>
        <button class="${state.sectionFilter === "image" ? "is-active" : ""}" type="button" data-section-filter="image">الصور</button>
        <button class="${state.sectionFilter === "video" ? "is-active" : ""}" type="button" data-section-filter="video">الفيديو</button>
      </div>
    `;
  }

  function renderEmpty(title, copy) {
    return `<div class="udv6-empty"><div><strong>${escapeHtml(title)}</strong><span>${escapeHtml(copy)}</span></div></div>`;
  }

  function renderFavoritesSection() {
    const items = uniqueGenerations(state.results)
      .filter((item) => item.isFavorite || state.favorites.has(String(item.id)))
      .filter(sectionItemMatches);
    return `
      <div class="udv6-section-shell">
        <header class="udv6-section-head">
          <div><h1>المفضلة</h1><p>احتفظ بأفضل نتائجك وارجع إليها بسرعة.</p></div>
        </header>
        <section class="udv6-panel">
          <div class="udv6-toolbar">
            <input class="udv6-search" type="search" placeholder="ابحث في المفضلة..." value="${escapeHtml(state.sectionSearch)}" data-section-search />
            ${renderTypeFilters()}
          </div>
          ${items.length ? `<div class="udv6-card-grid">${items.map((item) => renderWorkCardFixed(item, { favoriteView: true })).join("")}</div>` : renderEmpty("لم تضف أي نتيجة للمفضلة بعد", "اضغط على القلب أو اختر إضافة للمفضلة من قائمة أي نتيجة.")}
        </section>
      </div>
    `;
  }

  function renderModelsSection() {
    const normalUses = state.results.filter((item) => item.quality === "normal").length;
    const highUses = state.results.filter((item) => item.quality === "high").length;
    const ultraUses = state.results.filter((item) => item.quality === "ultra").length;
    const models = [
      { name: "وميض", level: "سريع", icon: "⚡", copy: "سريع جدًا واقتصادي ومناسب للأوصاف البسيطة.", cost: 5, success: 94, uses: normalUses, rating: "4.6" },
      { name: "رؤية", level: "متوازن", icon: "◈", copy: "جودة واقعية ممتازة للأوصاف المتوسطة والمتوازنة.", cost: 12, success: 97, uses: highUses, rating: "4.8" },
      { name: "إتقان برو", level: "احترافي", icon: "♛", copy: "أفضل جودة للأوصاف المركبة والمشاهد متعددة العناصر.", cost: 35, success: 98, uses: ultraUses, rating: "4.9" },
    ];
    return `
      <div class="udv6-section-shell">
        <header class="udv6-section-head"><div><h1>نماذجنا</h1><p>اختر مستوى الجودة الأنسب لفكرتك وميزانيتك.</p></div></header>
        <section class="udv6-panel">
          <div class="udv6-model-list">
            ${models.map((model) => `
              <article class="udv6-model-card">
                <div class="udv6-model-visual">${model.icon}</div>
                <div>
                  <h3><span class="udv6-model-title">${model.name}</span> <small>${model.level}</small></h3>
                  <p>${model.copy}</p>
                  <div class="udv6-model-tags"><span>نسبة النجاح ${model.success}%</span><span>${formatNumber(model.uses)} استخدام</span><span>★ ${model.rating}</span></div>
                </div>
                <div class="udv6-model-price">${model.cost}<small style="display:block;font-size:10px">XP</small></div>
              </article>
            `).join("")}
          </div>
        </section>
      </div>
    `;
  }

  function renderTemplatesSection() {
    const categories = [
      ["all", "الكل"], ["ads", "إعلانات"], ["youtube", "يوتيوب"], ["instagram", "إنستغرام"],
      ["logos", "شعارات"], ["products", "صور منتجات"], ["realestate", "عقارات"], ["cars", "سيارات"],
    ];
    const items = TEMPLATE_ITEMS.filter((item) => state.sectionFilter === "all" || item.category === state.sectionFilter);
    return `
      <div class="udv6-section-shell">
        <header class="udv6-section-head"><div><h1>القوالب</h1><p>برومبتات جاهزة تمنحك بداية سريعة ونتيجة مرتبة.</p></div></header>
        <section class="udv6-panel">
          <div class="udv6-toolbar">
            <div class="udv6-segmented" style="overflow:auto;max-width:100%">
              ${categories.map(([value, label]) => `<button class="${state.sectionFilter === value ? "is-active" : ""}" type="button" data-template-filter="${value}">${label}</button>`).join("")}
            </div>
          </div>
          <div class="udv6-template-grid">
            ${items.map((item) => `
              <article class="udv6-template-card">
                <img src="${item.image}" alt="${item.title}" loading="lazy" />
                <div><h3>${item.title}</h3><p>${item.prompt}</p><button type="button" data-use-template="${item.id}">استخدام القالب</button></div>
              </article>
            `).join("")}
          </div>
        </section>
      </div>
    `;
  }

  function renderPlanSection() {
    const key = state.key || {};
    const remaining = keyCredits();
    const total = Math.max(keyTotalCredits(), remaining, 1);
    const percent = Math.max(4, Math.min(100, Math.round((remaining / total) * 100)));
    const images = state.results.filter((item) => item.type === "image").length;
    const videos = state.results.filter((item) => item.type === "video").length;
    return `
      <div class="udv6-section-shell">
        <header class="udv6-section-head"><div><h1>باقتي</h1><p>مركز حسابك المالي والرصيد المتاح والصلاحية.</p></div></header>
        <section class="udv6-plan-hero">
          <article class="udv6-balance-panel" style="--plan-progress:${percent}%">
            <small>الرصيد الحالي</small><strong>${formatNumber(remaining)} XP</strong><span>${escapeHtml(key.planName || "VIP")} · ${daysLeftText(key.expiresAt)}</span>
            <div class="udv6-plan-progress"><i></i></div><span>متبقي ${percent}% من رصيد الباقة</span>
            <div class="udv6-plan-actions"><button type="button" data-plan-action="recharge">شحن رصيد</button><button type="button" data-plan-action="upgrade">ترقية الباقة</button></div>
          </article>
          <div class="udv6-plan-stat-list">
            <article class="udv6-plan-stat"><span>صور مستخدمة</span><strong>${formatNumber(images)}</strong></article>
            <article class="udv6-plan-stat"><span>فيديوهات مستخدمة</span><strong>${formatNumber(videos)}</strong></article>
            <article class="udv6-plan-stat"><span>إزالة العلامة المائية</span><strong>مفعلة</strong></article>
            <article class="udv6-plan-stat"><span>المتبقي من الباقة</span><strong>${formatNumber(remaining)} XP</strong></article>
          </div>
        </section>
      </div>
    `;
  }

  function renderTransactionsSection() {
    const rows = state.results.map((item) => ({
      label: `إنشاء ${typeLabel(item.type)}`,
      detail: qualityLabel(item.quality),
      date: formatDate(item.createdAt),
      amount: `-${formatNumber(item.creditsUsed)} XP`,
      positive: false,
    }));
    return `
      <div class="udv6-section-shell">
        <header class="udv6-section-head"><div><h1>معاملاتي</h1><p>كشف واضح لجميع عمليات الرصيد والاستخدام.</p></div></header>
        <section class="udv6-panel">
          <div class="udv6-transaction-list">
            ${rows.length ? rows.map((row) => `
              <article class="udv6-transaction-row">
                <div><strong>${row.label}</strong><span style="display:block">${row.detail}</span></div>
                <time>${row.date}</time>
                <b class="${row.positive ? "is-positive" : ""}">${row.amount}</b>
                <span class="udv6-status">مكتملة</span>
              </article>
            `).join("") : renderEmpty("لا توجد معاملات حتى الآن", "ستظهر عمليات الخصم والشحن هنا بعد أول استخدام.")}
          </div>
        </section>
      </div>
    `;
  }

  function getSettings() {
    try {
      return {
        language: "ar",
        quality: "normal",
        explicitQualityPreference: false,
        emailNotifications: true,
        systemNotifications: true,
        theme: "light",
        ...JSON.parse(localStorage.getItem("pixigen:settings") || "{}"),
      };
    } catch {
      return {
        language: "ar",
        quality: "normal",
        explicitQualityPreference: false,
        emailNotifications: true,
        systemNotifications: true,
        theme: "light",
      };
    }
  }

  function applyUserSettings(settings = getSettings()) {
    const language = settings.language === "en" ? "en" : "ar";
    const theme = settings.theme === "dark" ? "dark" : "light";
    document.documentElement.lang = language;
    document.documentElement.dir = language === "en" ? "ltr" : "rtl";
    document.documentElement.dataset.theme = theme;
    document.body.dataset.theme = theme;
    document.body.dataset.language = language;
    applyDashboardLanguage({ ...settings, language });
  }

  async function signOutFromCode() {
    const endpoints = ["/api/keys/logout", "/api/auth/logout"];
    for (const endpoint of endpoints) {
      try {
        await requestJson(endpoint, { method: "POST" });
        break;
      } catch (error) {
        if (endpoint === endpoints[endpoints.length - 1]) {
          console.warn("LOGOUT WARNING:", error);
        }
      }
    }

    try {
      localStorage.removeItem("advancedpro_token");
      sessionStorage.removeItem("advancedpro_token");
      localStorage.removeItem("advancedpro_access_code");
      sessionStorage.removeItem("advancedpro_access_code");
      localStorage.removeItem("pixigen:key");
      sessionStorage.removeItem("pixigen:key");
      sessionStorage.removeItem("pixigen:active-generation");
      localStorage.removeItem("pixigen:active-generation");
    } catch {
      // Ignore cleanup failures.
    }

    showToast("تم تسجيل الخروج من الكود.");
    window.location.href = "/activate";
  }

  function renderSettingsSection() {
    const settings = getSettings();
    const key = state.key || {};
    const language = settings.language === "en" ? "en" : "ar";
    const theme = settings.theme === "dark" ? "dark" : "light";
    const copy = language === "en"
      ? {
          title: "Account Settings",
          subtitle: "Manage your profile, generation defaults, appearance, and access code.",
          language: "Language",
          languageHint: "Applies direction immediately",
          appearance: "Appearance",
          appearanceHint: "Light or dark mode",
          personal: "Profile",
          name: "Name",
          email: "Email",
          save: "Save information",
          preferences: "Preferences",
          quality: "Default quality",
          access: "Access",
          logoutTitle: "Sign out from this code",
          logoutCopy: "Remove this activation code from this browser and return to the activation page.",
          logout: "Sign out",
          notifications: "Notifications",
          emailNotifications: "Email notifications",
          systemNotifications: "System notifications",
          normal: "Normal",
          high: "High",
          ultra: "Ultra",
        }
      : {
          title: "إعدادات الحساب",
          subtitle: "حدّث معلوماتك وتفضيلات التوليد والمظهر والكود.",
          language: "اللغة",
          languageHint: "يتم تطبيق الاتجاه فورًا",
          appearance: "الوضع",
          appearanceHint: "شمسي أو ليلي حسب وقتك",
          personal: "المعلومات الشخصية",
          name: "الاسم",
          email: "البريد الإلكتروني",
          save: "حفظ المعلومات",
          preferences: "التفضيلات",
          quality: "الجودة الافتراضية",
          access: "الوصول",
          logoutTitle: "تسجيل خروج من الكود",
          logoutCopy: "إزالة كود التفعيل من هذا المتصفح والعودة إلى صفحة التفعيل.",
          logout: "تسجيل خروج",
          notifications: "الإشعارات",
          emailNotifications: "إشعارات البريد",
          systemNotifications: "إشعارات النظام",
          normal: "عادية",
          high: "عالية",
          ultra: "فائقة",
        };
    const languageChoices = [
      ["ar", "العربية", "ا", language === "en" ? "Arabic interface" : "اتجاه عربي كامل"],
      ["en", "English", "A", "English interface"],
    ];
    const themeChoices = [
      ["light", language === "en" ? "Light" : "شمسي", "☀", language === "en" ? "Bright and clear" : "سطوع واضح ومريح"],
      ["dark", language === "en" ? "Dark" : "ليلي", "☾", language === "en" ? "Comfortable at night" : "تباين هادئ في الليل"],
    ];
    return `
      <div class="udv6-section-shell">
        <header class="udv6-section-head"><div><h1>${copy.title}</h1><p>${copy.subtitle}</p></div></header>
        <form class="udv6-settings-grid" data-settings-form>
          <div class="udv6-setting-group">
            <div class="udv6-setting-group__head"><span>${copy.language}</span><small>${copy.languageHint}</small></div>
            <div class="udv6-setting-pills" role="group" aria-label="${copy.language}">
              ${languageChoices.map(([value, label, icon, copy]) => `
                <button type="button" class="udv6-setting-pill ${language === value ? "is-active" : ""}" data-setting-choice data-setting-key="language" data-setting-value="${value}" aria-pressed="${language === value}">
                  <span aria-hidden="true">${icon}</span><strong>${label}</strong><small>${copy}</small>
                </button>
              `).join("")}
            </div>
          </div>
          <div class="udv6-setting-group">
            <div class="udv6-setting-group__head"><span>${copy.appearance}</span><small>${copy.appearanceHint}</small></div>
            <div class="udv6-setting-pills" role="group" aria-label="${copy.appearance}">
              ${themeChoices.map(([value, label, icon, copy]) => `
                <button type="button" class="udv6-setting-pill ${theme === value ? "is-active" : ""}" data-setting-choice data-setting-key="theme" data-setting-value="${value}" aria-pressed="${theme === value}">
                  <span aria-hidden="true">${icon}</span><strong>${label}</strong><small>${copy}</small>
                </button>
              `).join("")}
            </div>
          </div>
          <section class="udv6-settings-card">
            <h2>${copy.personal}</h2>
            <label class="udv6-field"><span>${copy.name}</span><input name="customerName" value="${escapeHtml(key.customerName || "")}" /></label>
            <label class="udv6-field"><span>${copy.email}</span><input name="customerEmail" type="email" value="${escapeHtml(key.customerEmail || "")}" /></label>
            <button class="udv6-primary-button" type="button" data-settings-save>${copy.save}</button>
          </section>
          <section class="udv6-settings-card">
            <h2>${copy.preferences}</h2>
            <label class="udv6-field"><span>${copy.quality}</span><select name="quality"><option value="normal" ${settings.quality === "normal" ? "selected" : ""}>${copy.normal}</option><option value="high" ${settings.quality === "high" ? "selected" : ""}>${copy.high}</option><option value="ultra" ${settings.quality === "ultra" ? "selected" : ""}>${copy.ultra}</option></select></label>
            <label class="udv6-field"><span>${copy.language}</span><select name="language"><option value="ar" ${settings.language === "ar" ? "selected" : ""}>العربية</option><option value="en" ${settings.language === "en" ? "selected" : ""}>English</option></select></label>
            <label class="udv6-field"><span>${copy.appearance}</span><select name="theme"><option value="light" ${settings.theme !== "dark" ? "selected" : ""}>${themeChoices[0][1]}</option><option value="dark" ${settings.theme === "dark" ? "selected" : ""}>${themeChoices[1][1]}</option></select></label>
          </section>
          <section class="udv6-settings-card">
            <h2>${copy.access}</h2>
            <div class="udv6-logout-box">
              <div><strong>${copy.logoutTitle}</strong><span>${copy.logoutCopy}</span></div>
              <button type="button" data-key-logout>${copy.logout}</button>
            </div>
          </section>
          <section class="udv6-settings-card">
            <h2>${copy.notifications}</h2>
            <div class="udv6-toggle-row"><span>${copy.emailNotifications}</span><button class="udv6-toggle" type="button" aria-pressed="${settings.emailNotifications}" data-setting-toggle="emailNotifications"></button></div>
            <div class="udv6-toggle-row"><span>${copy.systemNotifications}</span><button class="udv6-toggle" type="button" aria-pressed="${settings.systemNotifications}" data-setting-toggle="systemNotifications"></button></div>
          </section>
        </form>
      </div>
    `;
  }

  function renderDashboardSection() {
    const section = $("[data-dashboard-section]");
    if (!section || state.activeView === "home") return;
    const renderers = {
      projects: renderProjectsSection,
      favorites: renderFavoritesSection,
      models: renderModelsSection,
      templates: renderTemplatesSection,
      plan: renderPlanSection,
      transactions: renderTransactionsSection,
      settings: renderSettingsSection,
    };
    section.innerHTML = (renderers[state.activeView] || renderProjectsSection)();
  }

  function setDashboardView(view, { updateHistory = true } = {}) {
    const allowed = ["home", "projects", "favorites", "models", "templates", "plan", "transactions", "settings"];
    state.activeView = allowed.includes(view) ? view : "home";
    state.sectionFilter = "all";
    state.sectionSearch = "";
    state.activeMenuId = null;

    const isHome = state.activeView === "home";
    document.body.classList.toggle("is-dashboard-section", !isHome);
    document.body.dataset.dashboardView = state.activeView;
    $("[data-dashboard-home]").hidden = !isHome;
    $("[data-dashboard-section]").hidden = isHome;
    $$("[data-dashboard-view]").forEach((link) => {
      const isTypeShortcut = Boolean(link.dataset.typeShortcut);
      const isActive = isTypeShortcut
        ? isHome && link.dataset.typeShortcut === state.type
        : link.dataset.dashboardView === state.activeView;
      link.classList.toggle("is-active", isActive);
    });

    if (!isHome) renderDashboardSection();
    if (updateHistory) history.pushState({ dashboardView: state.activeView }, "", `#${state.activeView}`);
  }

  function findGeneration(id) {
    return state.results.find((item) => String(item.id) === String(id));
  }

  function switchToCreate({ type = "image", prompt = "", shouldScroll = true, shouldFocus = true } = {}) {
    setDashboardView("home");
    setType(type);
    const input = $("[data-prompt-input]");
    if (prompt) {
      input.value = prompt;
      $("[data-char-count]").textContent = prompt.length;
    }
    if (!shouldScroll && !shouldFocus) return;
    setTimeout(() => {
      if (shouldScroll) {
        $("#create")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      if (shouldFocus) {
        input?.focus({ preventScroll: true });
      }
    }, 40);
  }

  async function copyText(value, message = "تم نسخ الرابط") {
    try {
      await navigator.clipboard.writeText(value);
      showToast(message);
    } catch {
      showToast("تعذر النسخ من المتصفح.", "error");
    }
  }

  async function handleGenerationAction(action, id) {
    const item = findGeneration(id);
    if (!item) return;
    closeAllMenus();

    if (action === "download") {
      const anchor = document.createElement("a");
      anchor.href = item.resultUrl;
      anchor.download = "";
      anchor.target = "_blank";
      anchor.click();
    } else if (action === "copy") {
      const shareUrl = generationShareUrl(item);
      if (!shareUrl) {
        showToast("تعذر تجهيز رابط النتيجة.", "error");
        return;
      }
      await copyText(shareUrl, "تم نسخ رابط النتيجة");
    } else if (action === "favorite") {
      const nextValue = !Boolean(item.isFavorite);
      try {
        const payload = await requestJson(`/api/generations/${encodeURIComponent(item.id)}/favorite`, {
          method: "PATCH",
          body: JSON.stringify({ isFavorite: nextValue }),
        });
        const responseFavorite = Boolean(
          payload.isFavorite ??
            payload.is_favorite ??
            payload.generation?.isFavorite ??
            payload.generation?.is_favorite ??
            nextValue
        );
        item.isFavorite = responseFavorite;
        if (item.isFavorite) state.favorites.add(String(item.id));
        else state.favorites.delete(String(item.id));
        saveFavorites();
        persistGenerationCache();
        showToast(item.isFavorite ? "تمت الإضافة للمفضلة" : "تمت الإزالة من المفضلة");
      } catch (error) {
        showToast(error.message || "تعذر تحديث المفضلة.", "error");
      }
    } else if (action === "delete") {
      const confirmed = await confirmAction("هل أنت متأكد؟ سيتم حذف هذا المشروع نهائيًا.");
      if (!confirmed) return;
      try {
        await requestJson(`/api/generate/${encodeURIComponent(item.id)}`, {
          method: "DELETE",
        });
      } catch (error) {
        console.warn("GENERATION DELETE WARNING:", error);
        showToast(error.message || "تعذر حذف المشروع.", "error");
        return;
      }
      state.results = state.results.filter((result) => String(result.id) !== String(id));
      state.favorites.delete(String(id));
      saveFavorites();
      persistGenerationCache();
      showToast("تم حذف المشروع");
    }
    renderAll();
  }

  function closeAllMenus() {
    state.activeMenuId = null;
    state.activeMenuScope = null;
    $$("[data-generation-menu]").forEach((menu) => {
      menu.hidden = true;
    });
    $$("[data-menu-generation-id]").forEach((button) => {
      button.setAttribute("aria-expanded", "false");
      button.closest(".udv6-work-card, .udv3-creation-card")?.classList.remove("is-menu-open");
    });
  }

  function toggleMenu(menuButton) {
    const menu = menuButton?.parentElement?.querySelector("[data-generation-menu]");
    if (!menu) return;
    const shouldOpen = menu.hidden;
    closeAllMenus();
    if (!shouldOpen) return;
    state.activeMenuId = menuButton.dataset.menuGenerationId;
    state.activeMenuScope = menuButton.dataset.menuScope || null;
    menu.hidden = false;
    menuButton.setAttribute("aria-expanded", "true");
    menuButton.closest(".udv6-work-card, .udv3-creation-card")?.classList.add("is-menu-open");
  }

  function bindSectionEvents() {
    document.addEventListener(
      "click",
      async (event) => {
        const menuButton = event.target.closest("[data-menu-generation-id]");
        if (menuButton) {
          event.preventDefault();
          event.stopPropagation();
          toggleMenu(menuButton);
          return;
        }

        const actionButton = event.target.closest("[data-generation-action]");
        if (actionButton) {
          event.preventDefault();
          event.stopPropagation();
          await handleGenerationAction(
            actionButton.dataset.generationAction,
            actionButton.dataset.generationId
          );
          return;
        }

        const filter = event.target.closest("[data-section-filter]");
        if (filter) {
          event.preventDefault();
          event.stopPropagation();
          state.sectionFilter = filter.dataset.sectionFilter;
          renderDashboardSection();
          return;
        }

        const templateFilter = event.target.closest("[data-template-filter]");
        if (templateFilter) {
          event.preventDefault();
          event.stopPropagation();
          state.sectionFilter = templateFilter.dataset.templateFilter;
          renderDashboardSection();
          return;
        }

        const templateButton = event.target.closest("[data-use-template]");
        if (templateButton) {
          event.preventDefault();
          event.stopPropagation();
          const item = TEMPLATE_ITEMS.find(
            (template) => template.id === templateButton.dataset.useTemplate
          );
          if (item) {
            switchToCreate({ prompt: item.prompt, shouldScroll: false, shouldFocus: false });
            showToast("تم استخدام القالب");
          }
          return;
        }

        const settingsSave = event.target.closest("[data-settings-save]");
        if (settingsSave) {
          event.preventDefault();
          event.stopPropagation();
          saveSettingsForm(settingsSave.closest("[data-settings-form]"));
          return;
        }

        const keyLogout = event.target.closest("[data-key-logout]");
        if (keyLogout) {
          event.preventDefault();
          event.stopPropagation();
          signOutFromCode();
        }
      },
      true
    );

    document.addEventListener("click", async (event) => {
      const navigation = event.target.closest("a[data-dashboard-view], button[data-dashboard-view]");
      if (navigation && !navigation.matches("[data-type-shortcut]")) {
        event.preventDefault();
        setDashboardView(navigation.dataset.dashboardView);
        return;
      }

      const createButton = event.target.closest("[data-section-create]");
      if (createButton) {
        event.preventDefault();
        switchToCreate();
        return;
      }

      const toggle = event.target.closest("[data-setting-toggle]");
      if (toggle) {
        const settings = getSettings();
        const key = toggle.dataset.settingToggle;
        settings[key] = !settings[key];
        localStorage.setItem("pixigen:settings", JSON.stringify(settings));
        toggle.setAttribute("aria-pressed", String(settings[key]));
        return;
      }

      const settingChoice = event.target.closest("[data-setting-choice]");
      if (settingChoice) {
        const key = settingChoice.dataset.settingKey;
        const value = settingChoice.dataset.settingValue;
        const form = settingChoice.closest("[data-settings-form]");
        const field = form?.querySelector(`[name="${key}"]`);
        if (field && key && value) {
          field.value = value;
          form.querySelectorAll(`[data-setting-choice][data-setting-key="${key}"]`).forEach((button) => {
            const isActive = button.dataset.settingValue === value;
            button.classList.toggle("is-active", isActive);
            button.setAttribute("aria-pressed", String(isActive));
          });
          saveSettingsForm(form);
        }
        return;
      }

      const dailyTipNav = event.target.closest("[data-daily-tip-prev], [data-daily-tip-next]");
      if (dailyTipNav) {
        event.preventDefault();
        const current = Number.isInteger(state.dailyTipCursor) ? state.dailyTipCursor : 0;
        state.dailyTipCursor = current + (dailyTipNav.matches("[data-daily-tip-next]") ? 1 : -1);
        renderRecent();
        applyDashboardLanguage();
        return;
      }

      const dailyTipApply = event.target.closest("[data-daily-tip-apply]");
      if (dailyTipApply) {
        event.preventDefault();
        const [, copy] = getDailyTip(Number.isInteger(state.dailyTipCursor) ? state.dailyTipCursor : 0);
        const input = $("[data-prompt-input]");
        if (input) {
          input.value = input.value.trim() ? `${input.value.trim()}\n${copy}` : copy;
          $("[data-char-count]").textContent = input.value.length;
          setDashboardView("home");
          input.focus({ preventScroll: true });
        }
        return;
      }

      const planAction = event.target.closest("[data-plan-action]");
      if (planAction) {
        event.preventDefault();
        window.location.href = ADVPROAI_URL;
        return;
      }

      if (
        state.activeMenuId &&
        !event.target.closest("[data-generation-menu]") &&
        !event.target.closest("[data-menu-generation-id]")
      ) {
        closeAllMenus();
      }
    });

    document.addEventListener("input", (event) => {
      if (!event.target.matches("[data-section-search]")) return;
      state.sectionSearch = event.target.value;
      renderDashboardSection();
    });

    document.addEventListener(
      "submit",
      (event) => {
        if (!event.target.matches("[data-settings-form]")) return;
        event.preventDefault();
        event.stopPropagation();
        saveSettingsForm(event.target);
      },
      true
    );

    window.addEventListener("popstate", () => {
      setDashboardView(window.location.hash.slice(1) || "home", { updateHistory: false });
    });
  }

  function saveSettingsForm(formElement) {
    if (!formElement) return;
    const form = new FormData(formElement);
    const settings = getSettings();
    settings.quality = form.get("quality") || settings.quality;
    settings.explicitQualityPreference = true;
    settings.language = form.get("language") || settings.language;
    settings.theme = form.get("theme") || settings.theme || "light";
    localStorage.setItem("pixigen:settings", JSON.stringify(settings));
    state.key = {
      ...(state.key || {}),
      customerName: String(form.get("customerName") || state.key?.customerName || ""),
      customerEmail: String(form.get("customerEmail") || state.key?.customerEmail || ""),
    };
    applyUserSettings(settings);
    updateKeyUi();
    if (state.activeView === "settings") {
      renderDashboardSection();
    }
    showToast("تم حفظ إعدادات الحساب.");
  }

  function renderTransactions() {
    const container = $("[data-transactions-list]");
    if (!state.generationsHydrated) {
      container.innerHTML = Array.from({ length: 3 }, () => `
        <article class="udv3-transaction-skeleton" aria-hidden="true">
          <span class="udv3-skeleton-box udv3-skeleton-box--icon"></span>
          <span class="udv3-skeleton-stack">
            <span class="udv3-skeleton-box udv3-skeleton-box--line"></span>
            <span class="udv3-skeleton-box udv3-skeleton-box--line is-short"></span>
          </span>
          <span class="udv3-skeleton-box udv3-skeleton-box--amount"></span>
        </article>
      `).join("");
      return;
    }

    const recent = state.results.slice(0, 2).map((item) => ({
      label: `إنشاء ${typeLabel(item.type)} ${qualityLabel(item.quality)}`,
      time: relativeTime(item.createdAt),
      amount: `-${formatNumber(item.creditsUsed)} XP`,
      positive: false,
      icon: item.type === "video" ? "udv5-transaction-video" : "udv5-transaction-image",
    }));

    const list = recent.slice(0, 3);

    container.innerHTML = list.length
      ? list
          .map(
            (item) => `
          <article>
            <i><svg><use href="#${item.icon}"></use></svg></i>
            <span>${escapeHtml(item.label)}<small>${escapeHtml(item.time)}</small></span>
            <b class="${item.positive ? "is-positive" : ""}">${escapeHtml(item.amount)}</b>
          </article>
        `
          )
          .join("")
      : `<div class="udv3-empty-state is-compact udv3-empty-state--transactions">لا توجد معاملات توليد حتى الآن.</div>`;
  }

  function updateUsageUi() {
    const key = state.key || {};
    const generatedImages = state.results.filter((item) => item.type === "image").length;
    const generatedVideos = state.results.filter((item) => item.type === "video").length;
    const imagesUsed = Number(key.imagesUsed ?? key.imageUsed ?? generatedImages);
    const videosUsed = Number(key.videosUsed ?? key.videoUsed ?? generatedVideos);
    const totalCredits = Math.max(keyTotalCredits(), keyCredits(), 0);
    const imagesLimitFromXp = Math.max(imagesUsed, generatedImages, Math.floor(totalCredits / IMAGE_XP_COST.normal));
    const videosLimitFromXp = Math.max(videosUsed, generatedVideos, Math.floor(totalCredits / VIDEO_XP_COST[5].normal));
    const rawImagesLimit = Number(key.imagesLimit ?? key.imageLimit ?? 0);
    const rawVideosLimit = Number(key.videosLimit ?? key.videoLimit ?? 0);
    const imagesLimit = rawImagesLimit > 0 ? rawImagesLimit : imagesLimitFromXp;
    const videosLimit = rawVideosLimit > 0 ? rawVideosLimit : videosLimitFromXp;

    $("[data-images-count]").textContent = `${imagesUsed} / ${imagesLimit}`;
    $("[data-videos-count]").textContent = `${videosUsed} / ${videosLimit}`;
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
      promptInput.focus({ preventScroll: true });
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
      state.upgradeRecommendationDismissed = false;
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
      updateUpgradeRecommendation();
      promptInput.focus({ preventScroll: true });
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
    event?.preventDefault();
    event?.stopPropagation();
    if (state.loading) return;

    const promptInput = $("[data-prompt-input]");
    const userPrompt = promptInput.value.trim();
    if (userPrompt.length < 3) {
      setMessage("اكتب وصفًا واضحًا أولًا.", "error");
      promptInput.focus({ preventScroll: true });
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
        status: rawGeneration.status || data.status || "processing",
      });

      state.results = [
        generation,
        ...state.results.filter((item) => (
          String(item.id) !== String(generation.id) &&
          (!generation.requestId || String(item.requestId || "") !== String(generation.requestId))
        )),
      ];
      state.results = uniqueGenerations(sortGenerations(state.results));
      persistKeySnapshot(state.key);
      persistGenerationCache();
      state.autoOpenGenerationId = String(generation.id);
      state.autoOpenGenerationHandled = false;
      state.pendingGenerationId = String(generation.id);
      sessionStorage.setItem("pixigen:active-generation", String(generation.id));
      startGenerationTimeout(generation.id, generation.type);
      setMessage(
        generation.type === "video"
          ? "تم بدء إنشاء الفيديو. يمكنك متابعة استخدام اللوحة، وسنفتح النتيجة تلقائيًا عند الاكتمال."
          : "تم بدء إنشاء الصورة. يمكنك متابعة استخدام اللوحة، وسنفتح النتيجة تلقائيًا عند الاكتمال.",
        "success"
      );
      showToast(
        generation.type === "video"
          ? "تم بدء إنشاء الفيديو"
          : "تم بدء إنشاء الصورة",
        "success"
      );
      renderAll();
      if (generation.status === "completed" && generation.resultUrl) {
        state.pendingGenerationId = null;
        state.autoOpenGenerationHandled = true;
        clearGenerationTimeout();
        setLoading(false);
        await refreshKey({ silent: true });
        window.location.assign(`/generation?id=${encodeURIComponent(generation.id)}`);
        return;
      }
      scheduleGenerationsRefresh();
      return;
    } catch (error) {
      if (error.name === "AbortError") {
        setMessage("تم إلغاء الإنشاء. لم يتم خصم أي رصيد.", "info");
        showToast("تم إلغاء الإنشاء. لم يتم خصم أي رصيد.", "error");
      } else {
        console.error("GENERATE ERROR:", error);
        setMessage(error.message || "فشل التوليد، لم يتم خصم أي رصيد.", "error");
        showToast(error.message || "فشل التوليد، لم يتم خصم أي رصيد.", "error");
      }
      clearGenerationTimeout();
    } finally {
      state.activeRequestId = null;
      state.abortController = null;
      if (!state.pendingGenerationId) {
        setLoading(false);
      }
    }
  }

  async function refreshKey({ silent = false } = {}) {
    try {
      const data = await requestJson("/api/me/key");
      state.key = normalizeKey(data);
      persistKeySnapshot(state.key);
      loadFavorites(state.key);
      if (!state.results.length) {
        hydrateCachedGenerations(state.key);
      }
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
      const previousStatuses = new Map(
        state.results.map((item) => [String(item.id), item.status])
      );
      const data = await requestJson("/api/generate");
      const list = data.generations || data.items || data.results || [];
      const incoming = list.map(normalizeGeneration);
      state.results = uniqueGenerations(sortGenerations([...incoming, ...state.results]));
      persistGenerationCache();
      const completed = state.results.find(
        (item) =>
          item.status === "completed" &&
          previousStatuses.has(String(item.id)) &&
          previousStatuses.get(String(item.id)) !== "completed"
      );
      if (completed) {
        showToast(
          completed.type === "video"
            ? "🎉 تم إنشاء الفيديو بنجاح. نتيجتك جاهزة الآن."
            : "🎉 تم إنشاء الصورة بنجاح. نتيجتك جاهزة الآن."
        );
        await refreshKey({ silent: true });
        if (
          state.autoOpenGenerationId &&
          String(completed.id) === String(state.autoOpenGenerationId) &&
          !state.autoOpenGenerationHandled
        ) {
          state.pendingGenerationId = null;
          clearGenerationTimeout();
          setLoading(false);
          state.autoOpenGenerationHandled = true;
          window.location.assign(`/generation?id=${encodeURIComponent(completed.id)}`);
          return;
        }
        if (state.pendingGenerationId && String(completed.id) === String(state.pendingGenerationId)) {
          state.pendingGenerationId = null;
          clearGenerationTimeout();
          setLoading(false);
        }
      }

      const failed = state.results.find(
        (item) =>
          item.status === "failed" &&
          previousStatuses.has(String(item.id)) &&
          previousStatuses.get(String(item.id)) !== "failed"
      );
      if (
        failed &&
        state.autoOpenGenerationId &&
        String(failed.id) === String(state.autoOpenGenerationId)
      ) {
        const failureMessage = sanitizeUserMessage(
          failed.errorMessage || "تعذر إتمام الطلب مؤقتًا، حاول مرة أخرى بعد قليل. لم يتم خصم أي رصيد.",
          "تعذر إتمام الطلب مؤقتًا، حاول لاحقًا."
        );
        state.pendingGenerationId = null;
        clearGenerationTimeout();
        setLoading(false);
        state.autoOpenGenerationHandled = true;
        state.autoOpenGenerationId = null;
        setMessage(failureMessage, "error");
        showToast(failureMessage, "error");
      }
      if (!state.activeMenuId) {
        renderAll();
      }
    } catch (error) {
      if (!silent) console.warn("GENERATIONS LOAD WARNING:", error);
      if (!state.activeMenuId) {
        renderAll();
      }
    } finally {
      state.generationsHydrated = true;
      scheduleGenerationsRefresh();
    }
  }

  function renderAll() {
    updateKeyUi();
    updateCost();
    updateUpgradeRecommendation();
    renderRecent();
    renderDailyTips();
    renderTransactions();
    updateUsageUi();
    if (state.activeView !== "home") renderDashboardSection();
    applyDashboardLanguage();
  }

  function clearGenerationTimeout() {
    clearTimeout(state.generationTimeoutTimer);
    state.generationTimeoutTimer = null;
  }

  function startGenerationTimeout(generationId, type) {
    clearGenerationTimeout();
    if (type !== "image") return;
    state.generationTimeoutTimer = setTimeout(async () => {
      if (!state.pendingGenerationId || String(state.pendingGenerationId) !== String(generationId)) return;
      await refreshGenerations({ silent: true });
      const current = findGeneration(generationId);
      if (!current || current.status === "completed") return;
      state.pendingGenerationId = null;
      state.autoOpenGenerationHandled = true;
      state.autoOpenGenerationId = null;
      setLoading(false);
      setMessage("استغرق إنشاء الصورة أكثر من 30 ثانية. حاول مرة أخرى، ولن يتم خصم الرصيد إلا عند نجاح إنشاء نتيجة ظاهرة.", "error");
      showToast("استغرق إنشاء الصورة أكثر من 30 ثانية. حاول مرة أخرى.", "error");
    }, 35_000);
  }

  function scheduleGenerationsRefresh() {
    clearTimeout(state.refreshTimer);
    if (!state.results.some((item) => ["queued", "processing"].includes(item.status))) return;
    state.refreshTimer = setTimeout(() => {
      refreshGenerations({ silent: true });
    }, 3000);
  }

  function bindEvents() {
    $("[data-create-form]").addEventListener("submit", handleGenerate);
    $("[data-smart-enhance]")?.addEventListener("click", handleSmartEnhance);
    $("[data-prompt-input]").addEventListener("input", (event) => {
      $("[data-char-count]").textContent = event.target.value.length;
      state.upgradeRecommendationDismissed = false;
      resetEnhancedPromptState();
      updateUpgradeRecommendation();
    });
    $$("[data-type-tab]").forEach((button) => {
      button.addEventListener("click", () => setType(button.dataset.typeTab));
    });
    $$("[data-type-shortcut]").forEach((link) => {
      link.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        switchToCreate({ type: link.dataset.typeShortcut });
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
      switchToCreate({ type: state.type });
    });
    $("[data-quality-select]").addEventListener("change", (event) => {
      state.quality = event.target.value;
      state.upgradeRecommendationDismissed = false;
      resetEnhancedPromptState();
      updateDurationOptions();
      updateCost();
      updateUpgradeRecommendation();
    });
    $("[data-style-select]").addEventListener("change", (event) => {
      state.style = event.target.value;
      resetEnhancedPromptState();
      updateUpgradeRecommendation();
    });
    $("[data-aspect-select]").addEventListener("change", (event) => {
      state.aspect = event.target.value;
      resetEnhancedPromptState();
      updateUpgradeRecommendation();
    });
    $("[data-duration-select]").addEventListener("change", (event) => {
      state.duration = Number(event.target.value);
      resetEnhancedPromptState();
      updateCost();
      updateUpgradeRecommendation();
    });
    $("[data-show-enhanced-prompt]")?.addEventListener("click", openEnhancedPromptModal);
    $("[data-accept-quality-upgrade]")?.addEventListener("click", () => {
      const qualitySelect = $("[data-quality-select]");
      state.quality = "high";
      state.upgradeRecommendationDismissed = true;
      if (qualitySelect) qualitySelect.value = "high";
      resetEnhancedPromptState();
      updateDurationOptions();
      updateCost();
      updateUpgradeRecommendation();
      showToast("تم اختيار الجودة العالية لهذا الوصف المركب.");
    });
    $("[data-close-enhanced-prompt]")?.addEventListener("click", closeEnhancedPromptModal);
    $("[data-enhanced-prompt-modal]")?.addEventListener("click", (event) => {
      if (event.target === event.currentTarget) closeEnhancedPromptModal();
    });

    const setSidebarOpen = (open) => {
      document.body.classList.toggle("is-sidebar-open", open);
      document.documentElement.classList.toggle("is-sidebar-open", open);
      const backdrop = $("[data-sidebar-backdrop]");
      if (backdrop) backdrop.hidden = !open;
    };

    $("[data-sidebar-open]")?.addEventListener("click", () => setSidebarOpen(true));
    $$("[data-sidebar-close]").forEach((button) => {
      button.addEventListener("click", () => setSidebarOpen(false));
    });
    $$(".udv3-nav a").forEach((link) => {
      link.addEventListener("click", () => setSidebarOpen(false));
    });
  }

  async function init() {
    loadLocalPreferences();
    applyUserSettings();
    bindEvents();
    bindSectionEvents();
    setType("image");
    setDashboardView(window.location.hash.slice(1) || "home", { updateHistory: false });
    document.body.classList.add("is-dashboard-loading");
    if (state.results.length) {
      state.generationsHydrated = true;
    }
    renderAll();
    await refreshKey({ silent: true });
    await refreshGenerations({ silent: true });
    document.body.classList.remove("is-dashboard-loading");
    renderAll();
  }

  init();
})();
