(function () {
  const API_BASE_URL = window.AdvancedProConfig?.apiBaseUrl || "";

  const state = {
    key: null,
    result: null,
    results: [],
  };

  const fallbackResults = [
    {
      id: "demo-villa",
      type: "image",
      prompt: "منزل عصري فاخر",
      quality: "high",
      style: "realistic",
      aspectRatio: "16:9",
      creditsUsed: 10,
      createdAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
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
      creditsUsed: 10,
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
      creditsUsed: 10,
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

  async function requestJson(path) {
    const response = await fetch(apiUrl(path), {
      credentials: "include",
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.success === false) {
      const error = new Error(data.message || "تعذر تحميل البيانات.");
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatNumber(value) {
    return new Intl.NumberFormat("en-US").format(Number(value || 0));
  }

  function formatDate(value) {
    if (!value) return "غير محدد";
    try {
      return new Intl.DateTimeFormat("ar-SA", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }).format(new Date(value));
    } catch {
      return "غير محدد";
    }
  }

  function relativeTime(value) {
    const time = value ? new Date(value).getTime() : Date.now();
    const diff = Math.max(Date.now() - time, 0);
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "منذ أقل من دقيقة";
    if (minutes < 60) return `منذ ${minutes} دقيقة`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `منذ ${hours} ساعة`;
    const days = Math.floor(hours / 24);
    return `منذ ${days} يوم`;
  }

  function qualityLabel(value) {
    return {
      normal: "عادية",
      high: "عالية الدقة",
      ultra: "فائقة",
    }[value || "high"] || "عالية الدقة";
  }

  function styleLabel(value) {
    return {
      realistic: "واقعي",
      cinematic: "سينمائي",
      anime: "أنمي",
      "three-d": "ثلاثي الأبعاد",
      commercial: "إعلاني",
    }[value || "realistic"] || "واقعي";
  }

  function typeLabel(value) {
    return value === "video" ? "فيديو" : "صورة";
  }

  function getGenerationId() {
    const params = new URLSearchParams(window.location.search);
    const queryId = params.get("id");
    if (queryId) return queryId;
    const match = window.location.pathname.match(/\/generations\/([^/?#]+)/);
    return match ? decodeURIComponent(match[1]) : "";
  }

  function normalizeKey(payload) {
    const key = payload?.key || payload?.data || payload || {};
    return {
      ...key,
      customerName: key.customerName || key.ownerName || key.name || "أحمد العتيبي",
      planName: key.planName || key.plan?.name || "VIP",
      balance: Number(key.balance ?? key.creditsRemaining ?? key.xp ?? 1095),
      initialBalance: Number(key.initialBalance ?? key.totalCredits ?? key.balance ?? key.creditsRemaining ?? 1200),
      imageLimit: Number(key.imageLimit ?? key.imagesLimit ?? 240),
      imageUsed: Number(key.imageUsed ?? key.imagesUsed ?? 18),
      videoLimit: Number(key.videoLimit ?? key.videosLimit ?? 24),
      videoUsed: Number(key.videoUsed ?? key.videosUsed ?? 4),
      expiresAt: key.expiresAt || "2026-08-25T00:00:00.000Z",
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
      aspectRatio: item.aspectRatio || item.aspect_ratio || item.aspect || "16:9",
      duration: item.duration || item.durationSeconds || null,
      model: item.model || "PixiGen Pro v2",
      seed: item.seed,
      creditsUsed: Number(item.creditsUsed ?? item.credits_used ?? item.xpCost ?? item.cost ?? 10),
      createdAt: item.createdAt || item.created_at || new Date().toISOString(),
      resultUrl: item.resultUrl || item.url || item.outputUrl || item.imageUrl || item.videoUrl || "",
      thumbnailUrl: item.thumbnailUrl || item.resultUrl || item.url || item.outputUrl || "",
    };
  }

  function normalizeServerGeneration(item) {
    const generation = {
      id: item?.id || item?.generationId || null,
      requestId: item?.requestId || item?.request_id || null,
      type: item?.type || "image",
      prompt: item?.userPrompt || item?.prompt || "",
      finalPrompt: item?.finalPrompt || item?.final_prompt || "",
      quality: item?.quality || "normal",
      style: item?.style || "realistic",
      aspectRatio: item?.aspectRatio || item?.aspect_ratio || item?.aspect || "16:9",
      duration: item?.duration || item?.durationSeconds || null,
      model: item?.model || "",
      seed: item?.seed || null,
      creditsUsed: Number(item?.creditsUsed ?? item?.credits_used ?? item?.xpCost ?? item?.cost ?? 0),
      createdAt: item?.createdAt || item?.created_at || null,
      completedAt: item?.completedAt || item?.completed_at || null,
      resultUrl: item?.resultUrl || item?.result_url || item?.url || item?.outputUrl || item?.imageUrl || item?.videoUrl || "",
    };

    if (!generation.id || !generation.resultUrl) {
      throw new Error("بيانات النتيجة غير مكتملة من السيرفر.");
    }

    return generation;
  }

  function keyCredits() {
    return Math.max(Number(state.key?.balance || 0), 0);
  }

  function keyTotalCredits() {
    return Math.max(Number(state.key?.initialBalance || state.key?.totalCredits || state.key?.balance || 1200), 1);
  }

  function daysLeftText(expiresAt) {
    if (!expiresAt) return "صلاحية غير محددة";
    const days = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000);
    if (!Number.isFinite(days)) return "صلاحية غير محددة";
    if (days <= 0) return "انتهت الصلاحية";
    return `${days} يوم متبقية`;
  }

  function updateKeyUi() {
    const key = state.key || normalizeKey({});
    const remaining = keyCredits();
    const total = Math.max(keyTotalCredits(), remaining, 1);
    const percent = Math.max(8, Math.min(100, Math.round((remaining / total) * 100)));
    const seed = encodeURIComponent(key.customerName || "advanced-pro");

    $("[data-customer-name]").textContent = key.customerName;
    $("[data-customer-avatar]").src =
      key.avatarUrl || `https://api.dicebear.com/8.x/avataaars/svg?seed=${seed}`;
    $("[data-plan-badge]").textContent = key.planName || "VIP";
    $("[data-total-xp]").textContent = `${formatNumber(remaining)} XP`;
    $("[data-widget-xp]").textContent = `${formatNumber(remaining)} XP`;
    $("[data-xp-progress]").style.width = `${percent}%`;
    $("[data-expiry-text]").textContent = `ينتهي في ${formatDate(key.expiresAt)}`;
    $("[data-days-left]").textContent = daysLeftText(key.expiresAt);
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

  function renderMedia(result) {
    const url = result?.resultUrl;
    if (!url) {
      return `<div class="udv3-result-placeholder">لم يتم العثور على رابط النتيجة.</div>`;
    }
    const src = `${url}${url.includes("?") ? "&" : "?"}v=${encodeURIComponent(result.requestId || result.id)}`;
    if (result.type === "video") {
      return `<video src="${escapeHtml(src)}" controls playsinline preload="metadata"></video>`;
    }
    return `<img src="${escapeHtml(src)}" alt="${escapeHtml(result.prompt)}" loading="eager" />`;
  }

  function renderRecent() {
    const grid = $("[data-recent-grid]");
    const list = (state.results.length ? state.results : fallbackResults)
      .filter((item) => String(item.id) !== String(state.result?.id))
      .slice(0, 5);
    grid.innerHTML = list
      .map((item) => {
        const result = normalizeGeneration(item);
        const mediaUrl = result.thumbnailUrl || result.resultUrl;
        const media =
          result.type === "video"
            ? `<video src="${escapeHtml(mediaUrl)}" muted playsinline preload="metadata"></video>`
            : `<img src="${escapeHtml(mediaUrl)}" alt="${escapeHtml(result.prompt)}" loading="lazy" />`;
        return `
          <article class="udv3-creation-card">
            <a class="udv3-creation-preview" href="/generation?id=${encodeURIComponent(result.id)}">
              <span class="udv3-creation-media">${media}</span>
              <b>${typeLabel(result.type)}</b>
            </a>
            <h3>${escapeHtml(result.prompt)}</h3>
            <p>${qualityLabel(result.quality)} · ${relativeTime(result.createdAt)}</p>
          </article>
        `;
      })
      .join("");
  }

  function renderTransactions() {
    const current = state.result;
    const list = current
      ? [
          {
            label: `إنشاء ${typeLabel(current.type)} ${qualityLabel(current.quality)}`,
            time: relativeTime(current.createdAt),
            amount: `-${formatNumber(current.creditsUsed)} XP`,
          },
          { label: "شحن باقة إبداع", time: "منذ يومين", amount: "+1,200 XP", positive: true },
        ]
      : [
          { label: "إنشاء صورة عالية الدقة", time: "منذ 5 دقائق", amount: "-10 XP" },
          { label: "شحن باقة إبداع", time: "منذ يومين", amount: "+1,200 XP", positive: true },
        ];

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
    const key = state.key || normalizeKey({});
    const images = Number(key.imageUsed || 18);
    const imageLimit = Number(key.imageLimit || 240);
    const videos = Number(key.videoUsed || 4);
    const videoLimit = Number(key.videoLimit || 24);
    $("[data-images-count]").textContent = `${formatNumber(images)} / ${formatNumber(imageLimit)}`;
    $("[data-videos-count]").textContent = `${formatNumber(videos)} / ${formatNumber(videoLimit)}`;
  }

  function renderResult() {
    const result = state.result;
    if (!result) return;

    const isVideo = result.type === "video";
    $("[data-success-title]").textContent = `تم إنشاء ${isVideo ? "الفيديو" : "الصورة"} بنجاح!`;
    $("[data-success-copy]").textContent = `تم خصم ${formatNumber(result.creditsUsed)} XP من رصيدك.`;
    $("[data-details-title]").textContent = `تفاصيل ${isVideo ? "الفيديو" : "الصورة"}`;
    $("[data-detail-style]").textContent = styleLabel(result.style);
    $("[data-detail-aspect]").textContent = isVideo ? `${result.duration || 5} ثواني` : result.aspectRatio;
    $("[data-detail-quality]").textContent = qualityLabel(result.quality);
    $("[data-detail-created]").textContent = relativeTime(result.createdAt);
    $("[data-detail-model]").textContent = result.model || "PixiGen Pro v2";
    $("[data-detail-cost]").textContent = `${formatNumber(result.creditsUsed)} XP`;
    $("[data-detail-generation-id]").textContent = result.id || "-";
    $("[data-detail-request-id]").textContent = result.requestId || "-";
    $("[data-detail-seed]").textContent = result.seed || "-";
    $("[data-detail-prompt]").textContent = result.prompt;
    $("[data-detail-result-url]").textContent = result.resultUrl || "-";
    $("[data-result-badge]").textContent = qualityLabel(result.quality);
    $("[data-result-media]").innerHTML = renderMedia(result);

    const download = $("[data-download-result]");
    download.href = result.resultUrl || "#";
    download.download = "";
    download.textContent = isVideo ? "تحميل الفيديو" : "تحميل الصورة";
  }

  function renderResultError(message) {
    state.result = null;
    $("[data-success-title]").textContent = "تعذر العثور على النتيجة";
    $("[data-success-copy]").textContent = message;
    $("[data-details-title]").textContent = "تفاصيل النتيجة";
    $("[data-detail-style]").textContent = "غير متاح";
    $("[data-detail-aspect]").textContent = "غير متاح";
    $("[data-detail-quality]").textContent = "غير متاح";
    $("[data-detail-created]").textContent = "غير متاح";
    $("[data-detail-model]").textContent = "غير متاح";
    $("[data-detail-cost]").textContent = "غير متاح";
    $("[data-detail-generation-id]").textContent = "غير متاح";
    $("[data-detail-request-id]").textContent = "غير متاح";
    $("[data-detail-seed]").textContent = "غير متاح";
    $("[data-detail-prompt]").textContent = message;
    $("[data-detail-result-url]").textContent = "غير متاح";
    $("[data-result-badge]").textContent = "خطأ";
    $("[data-result-media]").innerHTML =
      `<div class="udv3-result-placeholder">${escapeHtml(message)}<br><a class="udv3-inline-link" href="/dashboard">العودة للوحة التحكم</a></div>`;

    const download = $("[data-download-result]");
    download.href = "#";
    download.removeAttribute("download");
  }

  async function refreshKey({ silent = false } = {}) {
    try {
      const data = await requestJson("/api/me/key");
      state.key = normalizeKey(data);
      try {
        sessionStorage.setItem("pixigen:key", JSON.stringify(state.key));
      } catch {
        // Ignore storage failures.
      }
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        window.location.href = "/activate";
        return;
      }
      if (!silent) console.warn("KEY LOAD WARNING:", error);
      try {
        state.key = normalizeKey(JSON.parse(sessionStorage.getItem("pixigen:key") || "{}"));
      } catch {
        state.key = normalizeKey({});
      }
    }
    updateKeyUi();
    updateUsageUi();
    renderTransactions();
  }

  async function refreshGenerations({ silent = false } = {}) {
    try {
      const data = await requestJson("/api/generate");
      const list = (data.generations || data.items || data.results || [])
        .map(normalizeGeneration)
        .filter((item) => item.resultUrl);
      state.results = list;
    } catch (error) {
      if (!silent) console.warn("GENERATIONS LOAD WARNING:", error);
      state.results = [];
    }
    renderRecent();
  }

  async function loadResult() {
    const id = getGenerationId();
    console.log("PAGE QUERY ID:", id);
    if (!id) {
      renderResultError("لم يتم العثور على معرف النتيجة.");
      return;
    }

    try {
      console.log("ROUTE GENERATION ID:", id);
      const data = await requestJson(`/api/generations/${encodeURIComponent(id)}`);
      console.log("SERVER GENERATION:", data.generation || data.result || data);
      const result = normalizeServerGeneration(data.generation || data.result || data);
      console.log("FETCHED GENERATION:", result);
      state.result = result;
      renderResult();
      renderTransactions();
    } catch (error) {
      console.warn("GENERATION LOAD WARNING:", error);
      const message = error.message || "تعذر العثور على النتيجة.";
      renderResultError(message);
      showToast(message, "error");
    }
  }

  function bindEvents() {
    $("[data-copy-result]").addEventListener("click", async () => {
      if (!state.result?.resultUrl) return;
      await navigator.clipboard?.writeText(state.result.resultUrl).catch(() => {});
      showToast("تم نسخ الرابط بنجاح.");
    });

    $("[data-share-result]").addEventListener("click", async () => {
      if (!state.result?.resultUrl) return;
      if (navigator.share) {
        await navigator.share({
          title: "PixiGenl",
          text: state.result.prompt,
          url: state.result.resultUrl,
        }).catch(() => {});
      } else {
        await navigator.clipboard?.writeText(state.result.resultUrl).catch(() => {});
        showToast("تم نسخ الرابط للمشاركة.");
      }
    });

    $("[data-delete-result]").addEventListener("click", () => {
      showToast("تم إخفاء النتيجة من هذه الصفحة فقط.", "error");
    });
  }

  async function init() {
    bindEvents();
    await loadResult();
    await refreshKey({ silent: true });
    await refreshGenerations({ silent: true });
  }

  init();
})();
