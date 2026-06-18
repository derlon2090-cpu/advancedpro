(function () {
  const API_BASE_URL = window.AdvancedProConfig?.apiBaseUrl || "";

  const state = {
    key: null,
    result: null,
    results: [],
    pollingTimer: null,
    currentIndex: 0,
    similarIndex: 0,
  };

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
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(value));
    } catch {
      return "غير محدد";
    }
  }

  function relativeTime(value) {
    const time = value ? new Date(value).getTime() : Date.now();
    const diff = Math.max(Date.now() - time, 0);
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "منذ لحظات";
    if (minutes < 60) return `منذ ${minutes} دقيقة`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `منذ ${hours} ساعة`;
    const days = Math.floor(hours / 24);
    return `منذ ${days} يوم`;
  }

  function qualityLabel(value) {
    return {
      normal: "عادية",
      high: "عالية",
      ultra: "فائقة",
    }[value || "high"] || "عالية";
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
      customerName: key.customerName || key.ownerName || key.name || "العميل",
      planName: key.planName || key.plan?.name || "VIP",
      balance: Number(key.balance ?? key.creditsRemaining ?? key.xp ?? 1095),
      initialBalance: Number(key.initialBalance ?? key.totalCredits ?? key.balance ?? key.creditsRemaining ?? 1200),
      imageLimit: Number(key.imageLimit ?? key.imagesLimit ?? 240),
      imageUsed: Number(key.imageUsed ?? key.imagesUsed ?? 18),
      videoLimit: Number(key.videoLimit ?? key.videosLimit ?? 24),
      videoUsed: Number(key.videoUsed ?? key.videosUsed ?? 4),
      expiresAt: key.expiresAt || null,
    };
  }

  function normalizeGeneration(item) {
    return {
      id: item?.id || item?.generationId || null,
      requestId: item?.requestId || item?.request_id || null,
      type: item?.type || "image",
      prompt: item?.userPrompt || item?.prompt || "",
      finalPrompt: item?.finalPrompt || item?.final_prompt || "",
      quality: item?.quality || "high",
      style: item?.style || "realistic",
      aspectRatio: item?.aspectRatio || item?.aspect_ratio || item?.aspect || "16:9",
      duration: item?.duration || item?.durationSeconds || null,
      model: item?.model || "PixiGen Pro v2",
      seed: item?.seed || null,
      creditsUsed: Number(item?.creditsUsed ?? item?.credits_used ?? item?.xpCost ?? item?.cost ?? 10),
      createdAt: item?.createdAt || item?.created_at || null,
      completedAt: item?.completedAt || item?.completed_at || null,
      resultUrl: item?.resultUrl || item?.result_url || item?.url || item?.outputUrl || item?.imageUrl || item?.videoUrl || "",
      thumbnailUrl: item?.thumbnailUrl || item?.resultUrl || item?.result_url || item?.url || item?.outputUrl || "",
      status: item?.status || "processing",
      userRating: item?.userRating || item?.user_rating || null,
      isFavorite: Boolean(item?.isFavorite || item?.is_favorite),
      generationTimeMs: item?.generationTimeMs ?? item?.generation_time_ms ?? null,
    };
  }

  function showToast(message) {
    const toast = $("[data-toast]");
    if (!toast) return;
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => {
      toast.hidden = true;
    }, 3200);
  }

  function setPageState(result) {
    const label = $("[data-page-state-label]");
    if (!label) return;
    if (!result) {
      label.textContent = "غير متاح";
      return;
    }
    label.textContent = result.status === "completed" ? "مكتمل" : result.status === "failed" ? "فشل الإنشاء" : "جاري الإنشاء...";
  }

  function renderMedia(result) {
    const frame = $("[data-media-frame]");
    if (!frame) return;

    if (!result) {
      frame.innerHTML = `<div class="result-placeholder">لم يتم العثور على النتيجة.</div>`;
      return;
    }

    if (result.status !== "completed" || !result.resultUrl) {
      frame.innerHTML = `
        <div class="result-processing">
          <div class="result-processing-preview">
            <img src="${escapeHtml(result.thumbnailUrl || result.resultUrl || "/ap-mark.svg")}" alt="${escapeHtml(result.prompt || "جاري الإنشاء")}" />
            <div class="result-processing-overlay">
              <strong>جاري المعالجة...</strong>
              <div class="result-progress" aria-hidden="true"><i></i></div>
              <small>${escapeHtml(currentStageLabel())}</small>
            </div>
          </div>
          <div class="result-processing-steps">
            <div class="result-stage-list" data-stage-list></div>
          </div>
        </div>
      `;
      renderStages(result);
      return;
    }

    const mediaId = `${result.resultUrl}${result.resultUrl.includes("?") ? "&" : "?"}v=${encodeURIComponent(result.requestId || result.id || Date.now())}`;
    frame.innerHTML =
      result.type === "video"
        ? `<video src="${escapeHtml(mediaId)}" controls playsinline preload="metadata"></video>`
        : `<img src="${escapeHtml(mediaId)}" alt="${escapeHtml(result.prompt)}" loading="eager" />`;

    const badge = $("[data-result-badge]");
    if (badge) {
      badge.textContent = qualityLabel(result.quality);
    }
  }

  function currentStageLabel() {
    const stages = [
      "استلام الطلب",
      "تحليل الوصف",
      "اختيار النموذج",
      "إنشاء الصورة",
      "تحسين الجودة",
      "حفظ النتيجة",
    ];
    return stages[state.currentIndex % stages.length];
  }

  function renderStages(result) {
    const list = $("[data-stage-list]");
    if (!list) return;
    const stages = [
      ["استلام الطلب", true],
      ["تحليل الوصف", true],
      ["اختيار النموذج", true],
      [result.status === "completed" ? "إنشاء الصورة" : "إنشاء الصورة", result.status === "completed"],
      ["تحسين الجودة", result.status === "completed"],
      ["حفظ النتيجة", result.status === "completed"],
    ];
    list.innerHTML = `
      <h3>مراحل التنفيذ</h3>
      <p>نُحدّث الحالة بشكل حي أثناء المعالجة.</p>
      ${stages
        .map(([label, done], index) => {
          const active = !done && index === Math.min(state.currentIndex, stages.length - 1);
          return `
            <div class="result-stage ${done ? "is-done" : active ? "is-active" : ""}">
              <strong>${escapeHtml(label)}</strong>
              <span>${done ? "تم" : active ? "جاري الآن" : "في الانتظار"}</span>
            </div>
          `;
        })
        .join("")}
    `;
  }

  function renderDetails(result) {
    const list = $("[data-details-list]");
    if (!list || !result) return;
    list.innerHTML = `
      <div class="result-detail"><dt>الوصف المستخدم</dt><dd>${escapeHtml(result.prompt || "-")}</dd></div>
      <div class="result-detail"><dt>النموذج</dt><dd>${escapeHtml(result.model || "-")}</dd></div>
      <div class="result-detail"><dt>الجودة</dt><dd>${escapeHtml(qualityLabel(result.quality))}</dd></div>
      <div class="result-detail"><dt>الأبعاد</dt><dd>${escapeHtml(result.aspectRatio || "-")}</dd></div>
      <div class="result-detail"><dt>التكلفة</dt><dd>${formatNumber(result.creditsUsed)} XP</dd></div>
      <div class="result-detail"><dt>تاريخ الإنشاء</dt><dd>${escapeHtml(formatDate(result.createdAt))}</dd></div>
      <div class="result-detail"><dt>الحالة</dt><dd>${escapeHtml(result.status === "completed" ? "مكتمل" : result.status === "failed" ? "فشل الإنشاء" : "قيد المعالجة")}</dd></div>
      <div class="result-detail"><dt>رقم المشروع / Generation ID</dt><dd>${escapeHtml(String(result.id || "-"))}</dd></div>
      <div class="result-detail"><dt>الوقت منذ الإنشاء</dt><dd>${escapeHtml(relativeTime(result.createdAt))}</dd></div>
    `;
  }

  function renderThumbs() {
    const grid = $("[data-result-thumbs]");
    const current = state.result;
    if (!grid) return;
    const list = state.results.filter((item) => String(item.id) !== String(current?.id)).slice(0, 6);
    if (!list.length) {
      grid.innerHTML = `<div class="result-thumb"><div class="placeholder">لا توجد نتائج أخرى</div></div>`;
      return;
    }
    grid.innerHTML = list
      .map((item) => {
        const media = item.type === "video"
          ? `<video src="${escapeHtml(item.thumbnailUrl || item.resultUrl)}" muted playsinline preload="metadata"></video>`
          : `<img src="${escapeHtml(item.thumbnailUrl || item.resultUrl)}" alt="${escapeHtml(item.prompt)}" loading="lazy" />`;
        return `
          <button class="result-thumb" type="button" data-thumb-id="${escapeHtml(item.id)}">
            ${media}
          </button>
        `;
      })
      .join("");
  }

  function updateHeader(result) {
    const title = $("[data-page-title]");
    const copy = $("[data-page-copy]");
    const download = $("[data-action-download]");
    const page = document.body;
    const isVideo = result?.type === "video";
    title.textContent =
      result?.status === "completed"
        ? `تم إنشاء ${isVideo ? "الفيديو" : "صورتك"} بنجاح!`
        : result?.status === "failed"
          ? "فشل الإنشاء"
          : `جارٍ إنشاء ${isVideo ? "الفيديو" : "صورتك"}...`;
    copy.textContent =
      result?.status === "completed"
        ? `تم إنشاء ${isVideo ? "الفيديو" : "الصورة"} بناءً على وصفك`
        : result?.status === "failed"
          ? "تعذر إكمال الإنشاء. يمكنك إعادة المحاولة الآن."
          : "الذكاء الاصطناعي يعمل الآن على تحويل فكرتك إلى صورة أو فيديو.";
    download.textContent = isVideo ? "تحميل الفيديو" : "تحميل الصورة";
    page.dataset.resultState = result?.status || "loading";
  }

  function updateActions(result) {
    const download = $("[data-action-download]");
    const copy = $("[data-action-copy]");
    const share = $("[data-action-share]");
    const regenerate = $("[data-action-regenerate]");
    if (!result) return;

    if (result.resultUrl) {
      download.href = result.resultUrl;
      download.download = "";
      download.removeAttribute("aria-disabled");
    } else {
      download.href = "#";
      download.removeAttribute("download");
      download.setAttribute("aria-disabled", "true");
    }

    copy.onclick = async (event) => {
      event.preventDefault();
      if (!result.resultUrl) return;
      await navigator.clipboard?.writeText(result.resultUrl).catch(() => {});
      showToast("تم نسخ الرابط");
    };

    share.onclick = async (event) => {
      event.preventDefault();
      if (!result.resultUrl) return;
      if (navigator.share) {
        await navigator.share({
          title: "PixiGenl",
          text: result.prompt,
          url: result.resultUrl,
        }).catch(() => {});
      } else {
        await navigator.clipboard?.writeText(result.resultUrl).catch(() => {});
        showToast("تم نسخ الرابط");
      }
    };

    regenerate.onclick = (event) => {
      event.preventDefault();
      window.location.href = "/dashboard#create";
    };
  }

  async function loadKey() {
    try {
      const data = await requestJson("/api/me/key");
      state.key = normalizeKey(data);
    } catch {
      state.key = normalizeKey({});
    }
  }

  async function loadRecentGenerations() {
    try {
      const data = await requestJson("/api/generate");
      const list = (data.generations || data.items || data.results || []).map(normalizeGeneration);
      state.results = list;
    } catch {
      state.results = [];
    }
  }

  async function loadResult() {
    const id = getGenerationId();
    if (!id) {
      renderError("لم يتم تحديد معرف النتيجة.");
      return;
    }

    try {
      const data = await requestJson(`/api/generations/${encodeURIComponent(id)}`);
      state.result = normalizeGeneration(data.generation || data.result || data);
      renderCurrent();
      if (state.result.status !== "completed") {
        startPolling();
      }
    } catch (error) {
      if (error.status === 404) {
        try {
          const statusData = await requestJson(`/api/generations/${encodeURIComponent(id)}/status`);
          state.result = normalizeGeneration(statusData.generation || statusData.result || statusData);
          renderCurrent();
          if (state.result.status !== "completed") startPolling();
          return;
        } catch {
          // fall through
        }
      }
      renderError(error.message || "تعذر تحميل النتيجة.");
    }
  }

  async function refreshGenerationSilently() {
    if (!state.result?.id) return;
    try {
      const data = await requestJson(`/api/generations/${encodeURIComponent(state.result.id)}`);
      const next = normalizeGeneration(data.generation || data.result || data);
      state.result = { ...state.result, ...next };
      if (state.result.status === "completed") {
        stopPolling();
      }
      renderCurrent();
    } catch (error) {
      console.warn("POLLING ERROR:", error);
    }
  }

  function startPolling() {
    stopPolling();
    state.pollingTimer = window.setInterval(() => {
      if (state.result?.status !== "completed") {
        state.currentIndex = (state.currentIndex + 1) % 6;
        renderCurrent();
        refreshGenerationSilently();
      }
    }, 3000);
  }

  function stopPolling() {
    if (state.pollingTimer) {
      window.clearInterval(state.pollingTimer);
      state.pollingTimer = null;
    }
  }

  function renderCurrent() {
    const result = state.result;
    if (!result) return;
    updateHeader(result);
    setPageState(result);
    renderMedia(result);
    renderDetails(result);
    renderThumbs();
    updateFavoriteState(result);
    updateRatingUi(result.userRating);
    updateActionLabels(result);
  }

  function updateActionLabels(result) {
    const download = $("[data-action-download]");
    if (!download) return;
    download.textContent = result.type === "video" ? "تحميل الفيديو" : "تحميل الصورة";
  }

  function updateFavoriteState(result) {
    const existing = $("[data-action-favorite]");
    if (!existing) return;
    existing.dataset.active = String(Boolean(result.isFavorite));
  }

  function updateRatingUi(rating) {
    $$("[data-rating]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.rating === rating);
    });
    const msg = $("[data-rating-message]");
    if (msg) {
      msg.textContent = rating ? "تم حفظ تقييمك لهذه النتيجة." : "";
    }
  }

  async function submitRating(rating) {
    if (!state.result?.id) return;
    try {
      const payload = await requestJson(`/api/generations/${encodeURIComponent(state.result.id)}/rating`, {
        method: "POST",
        body: JSON.stringify({ rating }),
      });
      state.result.userRating = payload.feedback?.rating || rating;
      updateRatingUi(state.result.userRating);
      showToast("تم حفظ التقييم");
    } catch (error) {
      showToast(error.message || "تعذر حفظ التقييم");
    }
  }

  function renderError(message) {
    const frame = $("[data-media-frame]");
    const details = $("[data-details-list]");
    const similar = $("[data-similar-grid]");
    const title = $("[data-page-title]");
    const copy = $("[data-page-copy]");

    if (frame) {
      frame.innerHTML = `<div class="result-placeholder">${escapeHtml(message)}</div>`;
    }
    if (details) {
      details.innerHTML = `<div class="result-detail"><dt>خطأ</dt><dd>${escapeHtml(message)}</dd></div>`;
    }
    if (similar) {
      similar.innerHTML = "";
    }
    if (title) title.textContent = "تعذر تحميل النتيجة";
    if (copy) copy.textContent = message;
    showToast(message);
  }

  function bindEvents() {
    document.addEventListener("click", async (event) => {
      const thumbButton = event.target.closest("[data-thumb-id]");
      if (thumbButton) {
        event.preventDefault();
        const next = state.results.find((item) => String(item.id) === String(thumbButton.dataset.thumbId));
        if (next) {
          state.result = next;
          renderCurrent();
        }
        return;
      }

      const ratingButton = event.target.closest("[data-rating]");
      if (ratingButton) {
        event.preventDefault();
        event.stopPropagation();
        await submitRating(ratingButton.dataset.rating);
        return;
      }

      const favoriteButton = event.target.closest("[data-action-favorite]");
      if (favoriteButton) {
        event.preventDefault();
        event.stopPropagation();
        if (!state.result?.id) return;
        try {
          const payload = await requestJson(`/api/generations/${encodeURIComponent(state.result.id)}/favorite`, {
            method: "PATCH",
            body: JSON.stringify({ isFavorite: !state.result.isFavorite }),
          });
          state.result.isFavorite = Boolean(payload.isFavorite);
          favoriteButton.dataset.active = String(state.result.isFavorite);
          showToast(state.result.isFavorite ? "تمت الإضافة للمفضلة" : "تمت الإزالة من المفضلة");
        } catch (error) {
          showToast(error.message || "تعذر تحديث المفضلة");
        }
        return;
      }

      const extra = event.target.closest("[data-extra-action]");
      if (extra) {
        event.preventDefault();
        event.stopPropagation();
        const action = extra.dataset.extraAction;
        if (action === "enhance") showToast("سيتم تفعيل تحسين الجودة قريبًا");
        if (action === "remove-bg") showToast("سيتم تفعيل إزالة الخلفية قريبًا");
        if (action === "colorize") showToast("سيتم تفعيل التلوين قريبًا");
        if (action === "video") showToast("سيتم تفعيل إنشاء فيديو من الصورة قريبًا");
        return;
      }

      const moreResults = event.target.closest("[data-more-results]");
      if (moreResults) {
        event.preventDefault();
        event.stopPropagation();
        window.location.href = "/dashboard#projects";
      }
    });

    $("[data-action-prev]")?.addEventListener("click", () => {
      if (!state.results.length) return;
      state.currentIndex = (state.currentIndex - 1 + state.results.length) % state.results.length;
      const next = state.results[state.currentIndex];
      if (next) {
        state.result = next;
        renderCurrent();
      }
    });

    $("[data-action-next]")?.addEventListener("click", () => {
      if (!state.results.length) return;
      state.currentIndex = (state.currentIndex + 1) % state.results.length;
      const next = state.results[state.currentIndex];
      if (next) {
        state.result = next;
        renderCurrent();
      }
    });
  }

  async function init() {
    bindEvents();
    await Promise.all([loadKey(), loadRecentGenerations()]);
    await loadResult();
  }

  init();
})();
