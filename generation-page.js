(function () {
  const API_BASE_URL = window.AdvancedProConfig?.apiBaseUrl || "";
  const PROCESSING_STAGES = [
    "استلام الطلب",
    "تحليل الوصف",
    "اختيار النموذج",
    "إنشاء النتيجة",
    "تحسين الجودة",
    "تجهيز النتيجة",
  ];

  const state = {
    currentId: "",
    result: null,
    results: [],
    pollingTimer: null,
    menuOpen: false,
    processingStageIndex: 0,
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  function apiUrl(path) {
    return `${API_BASE_URL}${path}`;
  }

  function sanitizeMessage(message, fallback = "تعذر إتمام الطلب مؤقتًا، حاول لاحقًا.") {
    const text = String(message || "").trim();
    if (!text) return fallback;
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

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.success === false) {
      const error = new Error(
        sanitizeMessage(payload.message || payload.error || "تعذر تحميل البيانات.", "تعذر تحميل البيانات.")
      );
      error.status = response.status;
      throw error;
    }

    return payload;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function getGenerationId() {
    const params = new URLSearchParams(window.location.search);
    const queryId = params.get("id");
    if (queryId) return queryId;
    const match = window.location.pathname.match(/\/generations\/([^/?#]+)/);
    return match ? decodeURIComponent(match[1]) : "";
  }

  function formatDateValue(value) {
    const time = Date.parse(value || "");
    return Number.isFinite(time) ? time : 0;
  }

  function mediaUrlWithVersion(item) {
    const base = item?.resultUrl || item?.thumbnailUrl || "";
    if (!base) return "";
    const version = encodeURIComponent(item.requestId || item.id || Date.now());
    return `${base}${base.includes("?") ? "&" : "?"}v=${version}`;
  }

  function isPending(result) {
    return Boolean(result && ["queued", "processing", "pending"].includes(result.status));
  }

  function isFailed(result) {
    return Boolean(result && result.status === "failed");
  }

  function isCompleted(result) {
    return Boolean(result && result.status === "completed" && result.resultUrl);
  }

  function qualityLabel(value) {
    return (
      {
        normal: "عادية",
        high: "عالية",
        ultra: "فائقة",
      }[String(value || "normal").toLowerCase()] || "عالية"
    );
  }

  function normalizeGeneration(item) {
    const raw = item?.generation || item?.result || item || {};
    return {
      id: raw.id || raw.generationId || raw.generation_id || null,
      requestId: raw.requestId || raw.request_id || null,
      type: raw.type === "video" ? "video" : "image",
      prompt: raw.userPrompt || raw.prompt || raw.description || "",
      quality: raw.quality || "normal",
      status: raw.status || (raw.resultUrl || raw.result_url ? "completed" : "processing"),
      resultUrl:
        raw.resultUrl ||
        raw.result_url ||
        raw.url ||
        raw.outputUrl ||
        raw.output_url ||
        raw.imageUrl ||
        raw.videoUrl ||
        "",
      thumbnailUrl:
        raw.thumbnailUrl ||
        raw.thumbnail_url ||
        raw.resultUrl ||
        raw.result_url ||
        raw.outputUrl ||
        raw.output_url ||
        raw.url ||
        "",
      createdAt: raw.createdAt || raw.created_at || null,
      completedAt: raw.completedAt || raw.completed_at || null,
      isFavorite: Boolean(raw.isFavorite || raw.is_favorite),
    };
  }

  function fileBaseName(result) {
    return `pixigen-${result?.type === "video" ? "video" : "image"}-${result?.id || Date.now()}`;
  }

  function setPageCopy(result) {
    const title = $("[data-page-title]");
    const copy = $("[data-page-copy]");
    const createLabel = $("[data-create-label]");
    const enhanceLabel = $("[data-enhance-label]");

    if (!title || !copy) return;

    if (!result) {
      title.textContent = "تعذر تحميل النتيجة";
      copy.textContent = "تعذر العثور على المشروع المطلوب. حاول العودة إلى مشاريعي.";
      if (createLabel) createLabel.textContent = "إنشاء صورة جديدة";
      if (enhanceLabel) enhanceLabel.textContent = "تحسين الصورة";
      return;
    }

    if (isFailed(result)) {
      title.textContent = "تعذر إكمال الإنشاء";
      copy.textContent = "تعذر إتمام الطلب مؤقتًا، حاول لاحقًا أو أعد المحاولة من لوحة التحكم.";
    } else if (isPending(result)) {
      title.textContent = result.type === "video" ? "جاري إنشاء الفيديو..." : "جاري إنشاء صورتك...";
      copy.textContent =
        result.type === "video"
          ? "نعالج طلبك الآن وسنُحدّث الصفحة تلقائيًا فور اكتمال الفيديو"
          : "نعالج طلبك الآن وسنُحدّث الصفحة تلقائيًا فور اكتمال الصورة";
    } else {
      title.textContent = result.type === "video" ? "تم إنشاء الفيديو بنجاح!" : "تم إنشاء صورتك بنجاح!";
      copy.textContent = result.type === "video" ? "تم إنشاء الفيديو بناءً على وصفك" : "تم إنشاء الصورة بناءً على وصفك";
    }

    if (createLabel) createLabel.textContent = result.type === "video" ? "إنشاء فيديو جديد" : "إنشاء صورة جديدة";
    if (enhanceLabel) enhanceLabel.textContent = result.type === "video" ? "تحسين الفيديو" : "تحسين الصورة";
  }

  function showToast(message) {
    const toast = $("[data-toast]");
    if (!toast) return;
    toast.textContent = sanitizeMessage(message, "تم تنفيذ الطلب");
    toast.hidden = false;
    clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => {
      toast.hidden = true;
    }, 2800);
  }

  async function copyText(value, successMessage = "تم نسخ الرابط") {
    const text = String(value || "").trim();
    if (!text) return;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        throw new Error("Clipboard API unavailable");
      }
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "true");
      textarea.style.position = "fixed";
      textarea.style.top = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }

    showToast(successMessage);
  }

  function triggerDownload(url, filename) {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.target = "_blank";
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  async function fetchBlob(url) {
    const response = await fetch(url, { mode: "cors" });
    if (!response.ok) {
      throw new Error("Failed to fetch asset");
    }
    return response.blob();
  }

  function loadImageFromBlob(blob) {
    return new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(blob);
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Failed to decode image"));
      };
      image.src = objectUrl;
    });
  }

  async function downloadImageAs(format) {
    const result = state.result;
    if (!isCompleted(result)) return;

    const extension = format === "jpeg" ? "jpg" : format;
    const filename = `${fileBaseName(result)}.${extension}`;

    try {
      const sourceBlob = await fetchBlob(result.resultUrl);
      const image = await loadImageFromBlob(sourceBlob);
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth || image.width;
      canvas.height = image.naturalHeight || image.height;
      const context = canvas.getContext("2d");

      if (!context || !canvas.width || !canvas.height) {
        throw new Error("Canvas unavailable");
      }

      context.drawImage(image, 0, 0);
      const mimeType = format === "jpeg" ? "image/jpeg" : `image/${format}`;
      const quality = format === "jpeg" || format === "webp" ? 0.95 : undefined;
      const convertedBlob = await new Promise((resolve, reject) => {
        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob);
            else reject(new Error("Blob conversion failed"));
          },
          mimeType,
          quality
        );
      });

      const objectUrl = URL.createObjectURL(convertedBlob);
      triggerDownload(objectUrl, filename);
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      showToast(`بدأ تنزيل ${extension.toUpperCase()}`);
    } catch {
      triggerDownload(result.resultUrl, filename);
      showToast("بدأ تنزيل الملف");
    }
  }

  function openShareWindow(url) {
    const popup = window.open(url, "_blank", "noopener,noreferrer,width=760,height=640");
    if (!popup) {
      showToast("اسمح بفتح النافذة لإكمال المشاركة");
    }
  }

  function buildShareLink(service, result) {
    const url = encodeURIComponent(result.resultUrl);
    const text = encodeURIComponent(result.prompt || "تم الإنشاء عبر PixiGenI");

    if (service === "x") {
      return `https://x.com/intent/tweet?url=${url}&text=${text}`;
    }
    if (service === "whatsapp") {
      return `https://wa.me/?text=${text}%20${url}`;
    }
    return `https://www.facebook.com/sharer/sharer.php?u=${url}`;
  }

  function closeMenu() {
    const toggle = $("[data-menu-toggle]");
    const menu = $("[data-menu]");
    state.menuOpen = false;
    if (toggle) toggle.setAttribute("aria-expanded", "false");
    if (menu) menu.hidden = true;
  }

  function toggleMenu() {
    const menu = $("[data-menu]");
    const toggle = $("[data-menu-toggle]");
    if (!menu || !toggle || toggle.disabled) return;

    state.menuOpen = !state.menuOpen;
    toggle.setAttribute("aria-expanded", String(state.menuOpen));
    menu.hidden = !state.menuOpen;
  }

  function updateFavoriteControls(result) {
    const button = $("[data-action-favorite]");
    const label = $("[data-favorite-label]");
    if (!button || !label) return;

    const active = Boolean(result?.isFavorite);
    button.dataset.active = String(active);
    button.disabled = !result || isPending(result) || isFailed(result);
    label.textContent = active ? "في المفضلة" : "إضافة للمفضلة";
  }

  function updateBadge(result) {
    const badge = $("[data-result-quality]");
    if (!badge) return;
    if (!result || isFailed(result)) {
      badge.hidden = true;
      return;
    }
    badge.hidden = false;
    badge.textContent = qualityLabel(result.quality);
  }

  function renderMenu(result) {
    const menu = $("[data-menu]");
    const toggle = $("[data-menu-toggle]");
    if (!menu || !toggle) return;

    if (!isCompleted(result)) {
      menu.innerHTML = "";
      toggle.disabled = true;
      closeMenu();
      return;
    }

    toggle.disabled = false;

    if (result.type === "video") {
      menu.innerHTML = `
        <div class="gr-menu-group">
          <p class="gr-menu-heading">حفظ الفيديو</p>
          <button class="gr-menu-item" type="button" data-menu-action="download-video">
            <span>تحميل الفيديو</span>
            <b>MP4</b>
          </button>
        </div>
        <div class="gr-menu-group">
          <p class="gr-menu-heading">مشاركة الفيديو</p>
          <button class="gr-menu-item" type="button" data-menu-action="copy-link">
            <span>نسخ الرابط</span>
            <i><svg><use href="#gr-link"></use></svg></i>
          </button>
          <button class="gr-menu-item" type="button" data-menu-action="share-x">
            <span>مشاركة عبر إكس</span>
            <i><svg><use href="#gr-x"></use></svg></i>
          </button>
          <button class="gr-menu-item" type="button" data-menu-action="share-whatsapp">
            <span>مشاركة عبر واتساب</span>
            <i><svg><use href="#gr-whatsapp"></use></svg></i>
          </button>
          <button class="gr-menu-item" type="button" data-menu-action="share-facebook">
            <span>مشاركة عبر فيسبوك</span>
            <i><svg><use href="#gr-facebook"></use></svg></i>
          </button>
        </div>
      `;
      return;
    }

    menu.innerHTML = `
      <div class="gr-menu-group">
        <p class="gr-menu-heading">حفظ الصورة</p>
        <button class="gr-menu-item" type="button" data-menu-action="download-png">
          <span>حفظ ك PNG</span>
          <b>PNG</b>
        </button>
        <button class="gr-menu-item" type="button" data-menu-action="download-jpg">
          <span>حفظ ك JPG</span>
          <b>JPG</b>
        </button>
        <button class="gr-menu-item" type="button" data-menu-action="download-webp">
          <span>حفظ ك WEBP</span>
          <b>WEBP</b>
        </button>
      </div>
      <div class="gr-menu-group">
        <p class="gr-menu-heading">مشاركة الصورة</p>
        <button class="gr-menu-item" type="button" data-menu-action="copy-link">
          <span>نسخ الرابط</span>
          <i><svg><use href="#gr-link"></use></svg></i>
        </button>
        <button class="gr-menu-item" type="button" data-menu-action="share-x">
          <span>مشاركة عبر إكس</span>
          <i><svg><use href="#gr-x"></use></svg></i>
        </button>
        <button class="gr-menu-item" type="button" data-menu-action="share-whatsapp">
          <span>مشاركة عبر واتساب</span>
          <i><svg><use href="#gr-whatsapp"></use></svg></i>
        </button>
        <button class="gr-menu-item" type="button" data-menu-action="share-facebook">
          <span>مشاركة عبر فيسبوك</span>
          <i><svg><use href="#gr-facebook"></use></svg></i>
        </button>
      </div>
    `;
  }

  function renderMedia(result) {
    const frame = $("[data-media-frame]");
    if (!frame) return;

    if (!result) {
      frame.innerHTML = `
        <div class="gr-empty-state" role="status" aria-live="polite">
          <div class="gr-spinner" aria-hidden="true"></div>
          <h2>تعذر تحميل النتيجة</h2>
          <p>لم نتمكن من العثور على هذا المشروع. جرّب العودة إلى صفحة مشاريعي ثم افتح النتيجة من جديد.</p>
        </div>
      `;
      return;
    }

    if (isFailed(result)) {
      frame.innerHTML = `
        <div class="gr-empty-state" role="alert">
          <h2>تعذر إكمال الإنشاء</h2>
          <p>تعذر إتمام الطلب مؤقتًا، حاول لاحقًا أو أعد المحاولة من لوحة التحكم.</p>
        </div>
      `;
      return;
    }

    if (isPending(result)) {
      const previewMedia = mediaUrlWithVersion(result)
        ? result.type === "video"
          ? `<video src="${escapeHtml(mediaUrlWithVersion(result))}" muted playsinline preload="metadata"></video>`
          : `<img src="${escapeHtml(mediaUrlWithVersion(result))}" alt="${escapeHtml(result.prompt)}" loading="eager" />`
        : "";

      frame.innerHTML = `
        <div class="gr-processing-state" role="status" aria-live="polite">
          <div class="gr-processing-preview">${previewMedia}</div>
          <div class="gr-spinner" aria-hidden="true"></div>
          <h2>${result.type === "video" ? "جاري إنشاء الفيديو..." : "جاري إنشاء صورتك..."}</h2>
          <p>${result.type === "video"
            ? "يمكنك ترك الصفحة مفتوحة، وسنقوم بتحديث النتيجة تلقائيًا فور اكتمال الفيديو."
            : "يمكنك ترك الصفحة مفتوحة، وسنقوم بتحديث النتيجة تلقائيًا فور اكتمال الصورة."}</p>
          <div class="gr-processing-stage">
            <i aria-hidden="true"></i>
            <span>${escapeHtml(PROCESSING_STAGES[state.processingStageIndex % PROCESSING_STAGES.length])}</span>
          </div>
        </div>
      `;
      return;
    }

    const assetUrl = mediaUrlWithVersion(result);
    frame.innerHTML =
      result.type === "video"
        ? `<video class="gr-ready-asset" src="${escapeHtml(assetUrl)}" controls playsinline preload="metadata"></video>`
        : `<img class="gr-ready-asset" src="${escapeHtml(assetUrl)}" alt="${escapeHtml(result.prompt)}" loading="eager" />`;
  }

  function renderLatestGrid() {
    const grid = $("[data-latest-grid]");
    if (!grid) return;

    const items = state.results
      .filter((item) => String(item.id) !== String(state.result?.id))
      .filter((item) => isCompleted(item))
      .slice(0, 5);

    if (!items.length) {
      grid.innerHTML = `<div class="gr-latest-empty">لا توجد نتائج مكتملة أخرى حتى الآن.</div>`;
      return;
    }

    grid.innerHTML = items
      .map((item) => {
        const media = item.type === "video"
          ? `<video src="${escapeHtml(mediaUrlWithVersion(item))}" muted playsinline preload="metadata"></video>`
          : `<img src="${escapeHtml(mediaUrlWithVersion(item))}" alt="${escapeHtml(item.prompt)}" loading="lazy" />`;

        return `
          <article class="gr-latest-item">
            <button
              class="gr-latest-favorite"
              type="button"
              data-card-favorite="${escapeHtml(item.id)}"
              data-active="${String(Boolean(item.isFavorite))}"
              aria-label="${item.isFavorite ? "إزالة من المفضلة" : "إضافة للمفضلة"}"
            >
              <svg><use href="#gr-heart"></use></svg>
            </button>
            <a class="gr-latest-link" href="/generation?id=${encodeURIComponent(item.id)}">
              ${media}
              <span class="gr-latest-chip">${escapeHtml(qualityLabel(item.quality))}</span>
              <span class="gr-sr-only">${escapeHtml(item.prompt || "نتيجة حديثة")}</span>
            </a>
          </article>
        `;
      })
      .join("");
  }

  function renderCurrent() {
    setPageCopy(state.result);
    updateBadge(state.result);
    updateFavoriteControls(state.result);
    renderMenu(state.result);
    renderMedia(state.result);
    renderLatestGrid();
  }

  function mergeCurrentIntoResults() {
    if (!state.result?.id) return;

    const currentId = String(state.result.id);
    const next = state.results.filter((item) => String(item.id) !== currentId);
    next.unshift(state.result);
    next.sort((a, b) => formatDateValue(b.createdAt || b.completedAt) - formatDateValue(a.createdAt || a.completedAt));
    state.results = next;
  }

  async function loadResult() {
    state.currentId = getGenerationId();
    if (!state.currentId) {
      state.result = null;
      renderCurrent();
      return;
    }

    try {
      const payload = await requestJson(`/api/generations/${encodeURIComponent(state.currentId)}`);
      state.result = normalizeGeneration(payload);
      mergeCurrentIntoResults();
      renderCurrent();
      if (isPending(state.result)) startPolling();
    } catch (error) {
      if (error.status === 404) {
        try {
          const payload = await requestJson(`/api/generations/${encodeURIComponent(state.currentId)}/status`);
          state.result = normalizeGeneration(payload);
          mergeCurrentIntoResults();
          renderCurrent();
          if (isPending(state.result)) startPolling();
          return;
        } catch (statusError) {
          state.result = null;
          setPageCopy(null);
          renderMedia(null);
          showToast(statusError.message || "تعذر تحميل النتيجة");
          return;
        }
      }

      state.result = null;
      setPageCopy(null);
      renderMedia(null);
      showToast(error.message || "تعذر تحميل النتيجة");
    }
  }

  async function loadRecentGenerations() {
    try {
      const payload = await requestJson("/api/generate");
      const rawItems = payload.generations || payload.items || payload.results || [];
      state.results = rawItems
        .map(normalizeGeneration)
        .sort((a, b) => formatDateValue(b.createdAt || b.completedAt) - formatDateValue(a.createdAt || a.completedAt));
      mergeCurrentIntoResults();
      renderLatestGrid();
    } catch {
      mergeCurrentIntoResults();
      renderLatestGrid();
    }
  }

  async function refreshGenerationSilently() {
    if (!state.result?.id) return;

    try {
      const path = isPending(state.result)
        ? `/api/generations/${encodeURIComponent(state.result.id)}/status`
        : `/api/generations/${encodeURIComponent(state.result.id)}`;
      const payload = await requestJson(path);
      const next = normalizeGeneration(payload);
      const wasPending = isPending(state.result);
      state.result = { ...state.result, ...next };
      mergeCurrentIntoResults();

      if (wasPending && isCompleted(state.result)) {
        stopPolling();
        renderCurrent();
        showToast(state.result.type === "video" ? "تم إنشاء الفيديو بنجاح" : "تم إنشاء الصورة بنجاح");
        await loadRecentGenerations();
        return;
      }

      if (wasPending && isFailed(state.result)) {
        stopPolling();
      }

      renderCurrent();
    } catch {
      // Keep the current state visible and try again on the next polling cycle.
    }
  }

  function startPolling() {
    stopPolling();
    state.pollingTimer = window.setInterval(() => {
      if (!isPending(state.result)) {
        stopPolling();
        return;
      }
      state.processingStageIndex = (state.processingStageIndex + 1) % PROCESSING_STAGES.length;
      renderMedia(state.result);
      refreshGenerationSilently();
    }, 3000);
  }

  function stopPolling() {
    if (state.pollingTimer) {
      window.clearInterval(state.pollingTimer);
      state.pollingTimer = null;
    }
  }

  async function setFavorite(id, nextValue) {
    const payload = await requestJson(`/api/generations/${encodeURIComponent(id)}/favorite`, {
      method: "PATCH",
      body: JSON.stringify({ isFavorite: nextValue }),
    });

    const isFavorite = Boolean(payload.isFavorite);
    state.results = state.results.map((item) =>
      String(item.id) === String(id) ? { ...item, isFavorite } : item
    );

    if (String(state.result?.id) === String(id) && state.result) {
      state.result = { ...state.result, isFavorite };
    }

    renderCurrent();
    showToast(isFavorite ? "تمت الإضافة للمفضلة" : "تمت الإزالة من المفضلة");
  }

  function navigateToCreate() {
    try {
      if (state.result) {
        sessionStorage.setItem(
          "pixigen:create-intent",
          JSON.stringify({
            type: state.result.type,
            prompt: state.result.prompt,
          })
        );
      }
    } catch {
      // Optional enhancement only.
    }

    window.location.href = "/dashboard#create";
  }

  async function handleMenuAction(action) {
    const result = state.result;
    if (!isCompleted(result)) return;

    if (action === "download-png") {
      await downloadImageAs("png");
    } else if (action === "download-jpg") {
      await downloadImageAs("jpeg");
    } else if (action === "download-webp") {
      await downloadImageAs("webp");
    } else if (action === "download-video") {
      triggerDownload(result.resultUrl, `${fileBaseName(result)}.mp4`);
      showToast("بدأ تنزيل الفيديو");
    } else if (action === "copy-link") {
      await copyText(result.resultUrl, "تم نسخ الرابط");
    } else if (action === "share-x") {
      openShareWindow(buildShareLink("x", result));
    } else if (action === "share-whatsapp") {
      openShareWindow(buildShareLink("whatsapp", result));
    } else if (action === "share-facebook") {
      openShareWindow(buildShareLink("facebook", result));
    }
  }

  function handleBack() {
    if (document.referrer && new URL(document.referrer, window.location.origin).origin === window.location.origin) {
      window.history.back();
      return;
    }
    window.location.href = "/dashboard#projects";
  }

  function bindEvents() {
    document.addEventListener("click", async (event) => {
      const backButton = event.target.closest("[data-back-button]");
      if (backButton) {
        event.preventDefault();
        handleBack();
        return;
      }

      const menuToggle = event.target.closest("[data-menu-toggle]");
      if (menuToggle) {
        event.preventDefault();
        event.stopPropagation();
        toggleMenu();
        return;
      }

      const menuAction = event.target.closest("[data-menu-action]");
      if (menuAction) {
        event.preventDefault();
        event.stopPropagation();
        await handleMenuAction(menuAction.dataset.menuAction);
        closeMenu();
        return;
      }

      const favoriteButton = event.target.closest("[data-action-favorite]");
      if (favoriteButton) {
        event.preventDefault();
        event.stopPropagation();
        if (!state.result?.id) return;
        try {
          await setFavorite(state.result.id, !state.result.isFavorite);
        } catch (error) {
          showToast(error.message || "تعذر تحديث المفضلة");
        }
        return;
      }

      const cardFavorite = event.target.closest("[data-card-favorite]");
      if (cardFavorite) {
        event.preventDefault();
        event.stopPropagation();
        const item = state.results.find((entry) => String(entry.id) === String(cardFavorite.dataset.cardFavorite));
        if (!item) return;
        try {
          await setFavorite(item.id, !item.isFavorite);
        } catch (error) {
          showToast(error.message || "تعذر تحديث المفضلة");
        }
        return;
      }

      const enhanceButton = event.target.closest("[data-action-enhance]");
      if (enhanceButton) {
        event.preventDefault();
        event.stopPropagation();
        navigateToCreate();
        return;
      }

      const createButton = event.target.closest("[data-action-create-new]");
      if (createButton) {
        event.preventDefault();
        event.stopPropagation();
        navigateToCreate();
        return;
      }

      if (state.menuOpen && !event.target.closest("[data-menu]")) {
        closeMenu();
      }
    });

    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeMenu();
      }
    });

    window.addEventListener("beforeunload", stopPolling);
  }

  async function init() {
    bindEvents();
    await loadResult();
    await loadRecentGenerations();
    renderCurrent();
  }

  init();
})();
