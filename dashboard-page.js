(function () {
  const API_BASE_URL =
    window.AdvancedProConfig?.apiBaseUrl || "";
  const TOKEN_KEY = "advancedpro_token";
  const state = {
    user: null,
    key: null,
    selectedType: null,
    duration: 5,
    quality: "high",
    loading: false,
  };

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function appendChatMessage({ role = "assistant", title = "المساعد الذكي", text = "", html = "" }) {
    const stream = $("[data-chat-stream]");
    if (!stream) return null;

    const message = document.createElement("article");
    message.className = `chat-bubble ${role === "user" ? "is-user" : "is-assistant"}`;
    message.innerHTML = `
      <span class="bubble-avatar">${
        role === "user" ? "أنت" : '<img src="/ap-mark.svg" alt="" aria-hidden="true" />'
      }</span>
      <div class="bubble-content">
        <strong>${escapeHtml(title)}</strong>
        ${html || `<p>${escapeHtml(text)}</p>`}
      </div>
    `;
    stream.appendChild(message);
    message.scrollIntoView({ behavior: "smooth", block: "nearest" });
    return message;
  }

  function renderPending(type) {
    const note =
      type === "video"
        ? "جاري إنشاء الفيديو، قد يستغرق بعض الوقت..."
        : "جاري إنشاء الصورة...";
    return appendChatMessage({
      role: "assistant",
      title: "المساعد الذكي",
      html: `<p>${note}</p><div class="dashboard-spinner" aria-label="${escapeHtml(note)}"></div>`,
    });
  }

  function token() {
    try {
      return (
        window.localStorage.getItem(TOKEN_KEY) ||
        window.sessionStorage.getItem(TOKEN_KEY) ||
        ""
      );
    } catch (error) {
      return "";
    }
  }

  async function requestJson(path, options = {}) {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      credentials: "include",
      cache: "no-store",
      ...options,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        Pragma: "no-cache",
        ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
        ...(options.headers || {}),
      },
    });

    let payload = {};
    try {
      payload = await response.json();
    } catch (error) {
      payload = {};
    }

    if (!response.ok) {
      const error = new Error(payload.message || "تعذر تنفيذ الطلب.");
      error.status = response.status;
      throw error;
    }

    return payload;
  }

  function formatDate(value) {
    if (!value) {
      return "--";
    }

    try {
      return new Intl.DateTimeFormat("ar-SA", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value));
    } catch (error) {
      return "--";
    }
  }

  function percentage(remaining, total) {
    if (!total) {
      return 0;
    }
    return Math.max(0, Math.min(100, Math.round((remaining / total) * 100)));
  }

  function setText(selector, value) {
    const element = $(selector);
    if (element) {
      element.textContent = value;
    }
  }

  function setProgress(selector, remaining, total) {
    const element = $(selector);
    if (element) {
      element.style.width = `${percentage(remaining, total)}%`;
    }
  }

  function setStatusText(value) {
    const status = value === "active" ? "نشط" : value || "غير مفعل";
    setText("[data-key-status]", status);
    setText("[data-key-status-inline]", status);
  }

  function renderKey() {
    const key = state.key || {};
    const imagesRemaining = Number(key.imagesRemaining || 0);
    const videosRemaining = Number(key.videosRemaining || 0);
    const imagesLimit = Number(key.imagesLimit || 0);
    const videosLimit = Number(key.videosLimit || 0);

    const imagesPercent = percentage(imagesRemaining, imagesLimit);
    const videosPercent = percentage(videosRemaining, videosLimit);

    setStatusText(key.status);
    setText("[data-images-counter]", `${imagesRemaining} / ${imagesLimit}`);
    setText("[data-videos-counter]", `${videosRemaining} / ${videosLimit}`);
    setText("[data-images-percent]", `${imagesPercent}%`);
    setText("[data-videos-percent]", `${videosPercent}%`);
    setText("[data-key-code]", key.codeMasked || "لا يوجد مفتاح مفعّل");
    setText("[data-key-activated]", formatDate(key.activatedAt));
    setText("[data-key-expires]", formatDate(key.expiresAt));
    setText("[data-key-expires-short]", formatDate(key.expiresAt));
    setText("[data-key-plan]", key.planName || "--");
    setProgress("[data-images-progress]", imagesRemaining, imagesLimit);
    setProgress("[data-videos-progress]", videosRemaining, videosLimit);
    setText("[data-customer-initial]", (key.customerName || key.planName || "J").trim().charAt(0).toUpperCase() || "J");
    updateCreditEstimate();
  }

  function updateWordCount() {
    const value = $("#dashboardPrompt")?.value || "";
    const count = value.trim() ? value.trim().split(/\s+/).length : 0;
    setText("[data-word-counter]", `${count} كلمة`);
  }

  function setMessage(text, type) {
    const message = $("[data-create-message]");
    if (!message) {
      return;
    }
    message.hidden = !text;
    message.textContent = text || "";
    message.dataset.type = type || "";
  }

  function calculateCredits(type, quality, duration) {
    const imageCosts = {
      normal: 10,
      high: 20,
      ultra: 40,
    };
    const videoBaseCosts = {
      5: 50,
      8: 80,
    };
    const videoMultipliers = {
      normal: 1,
      high: 3,
      ultra: 5,
    };

    if (type === "image") {
      return imageCosts[quality] || imageCosts.normal;
    }

    return Math.ceil((videoBaseCosts[duration] || videoBaseCosts[5]) * (videoMultipliers[quality] || 1));
  }

  function createRequestId() {
    if (window.crypto?.randomUUID) {
      return window.crypto.randomUUID();
    }

    return `req-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function updateCreditEstimate() {
    const estimate = $("[data-credit-estimate]");
    if (!estimate) {
      return;
    }

    if (!state.selectedType) {
      estimate.hidden = true;
      estimate.textContent = "";
      return;
    }

    const credits = calculateCredits(state.selectedType, state.quality, state.duration);
    const hasCredits = state.key && Object.prototype.hasOwnProperty.call(state.key, "creditsRemaining");
    const remaining = Number(state.key?.creditsRemaining || 0);
    const remainingText = hasCredits ? `رصيدك الحالي: ${remaining} نقطة.` : "";
    estimate.hidden = false;
    estimate.dataset.type = !hasCredits || remaining >= credits ? "info" : "error";
    estimate.textContent = `سيتم خصم ${credits} رصيد من حسابك عند نجاح التوليد. ${remainingText}`;
  }

  function showFormForType(type) {
    state.selectedType = type;
    $$("[data-create-kind]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.createKind === type);
    });

    const form = $("#dashboardCreateForm");
    const videoOptions = $("[data-video-options]");
    if (form) {
      form.hidden = false;
    }
    if (videoOptions) {
      videoOptions.hidden = type !== "video";
    }

    setText(
      "[data-prompt-label]",
      type === "video" ? "اكتب وصف الفيديو" : "اكتب وصف الصورة"
    );
    setText("[data-submit-label]", "إرسال");
    setText("[data-mode-chip]", type === "video" ? "فيديو" : "صورة");
    const prompt = $("#dashboardPrompt");
    if (prompt) {
      prompt.placeholder = type === "video" ? "اكتب وصف الفيديو هنا..." : "اكتب وصف الصورة هنا...";
    }
    setMessage("", "");
    updateWordCount();
    updateCreditEstimate();
  }

  function setActiveChip(groupSelector, attribute, value) {
    $$(`${groupSelector} button`).forEach((button) => {
      button.classList.toggle("is-active", button.dataset[attribute] === String(value));
    });
  }

  function setLoading(isLoading) {
    state.loading = isLoading;
    const button = $(".dashboard-submit");
    if (button) {
      button.disabled = isLoading;
      button.textContent = isLoading
        ? state.selectedType === "video"
          ? "جاري إنشاء الفيديو، قد يستغرق بعض الوقت..."
          : "جاري إنشاء الصورة..."
        : "إرسال";
    }
    const sendButton = $(".send-button");
    if (sendButton) {
      sendButton.disabled = isLoading;
      sendButton.innerHTML = isLoading
        ? `<span class="button-spinner" aria-hidden="true"></span>${state.selectedType === "video" ? "جاري إنشاء الفيديو" : "جاري إنشاء الصورة"}`
        : `إرسال <span aria-hidden="true">↗</span>`;
    }
  }

  function assertCanGenerate(type) {
    if (!state.key || state.key.status !== "active") {
      throw new Error("لا يوجد مفتاح نشط لهذا الحساب.");
    }

    if (type === "image" && Number(state.key.imagesRemaining || 0) <= 0) {
      throw new Error("لا يوجد رصيد صور كافٍ");
    }

    if (type === "video" && Number(state.key.videosRemaining || 0) <= 0) {
      throw new Error("لا يوجد رصيد فيديو كافٍ");
    }

    const requiredCredits = calculateCredits(type, state.quality, state.duration);
    if (
      Object.prototype.hasOwnProperty.call(state.key, "creditsRemaining") &&
      Number(state.key.creditsRemaining || 0) < requiredCredits
    ) {
      throw new Error("رصيدك غير كافٍ لإتمام هذا الطلب.");
    }
  }

  function resultMediaUrl(payload, inline = false) {
    if (payload?.generationId) {
      return `${API_BASE_URL}/api/download/${encodeURIComponent(payload.generationId)}${inline ? "?inline=1" : ""}`;
    }
    return payload?.resultUrl || payload?.url || "";
  }

  function setResultPlaceholder(hidden) {
    const placeholder = $("[data-result-placeholder]");
    if (placeholder) {
      placeholder.hidden = Boolean(hidden);
    }
  }

  function attachVideoPlaybackGuards(scope = document) {
    scope.querySelectorAll("video.result-media").forEach((video) => {
      if (video.dataset.playbackGuard === "true") return;
      video.dataset.playbackGuard = "true";

      const showWarning = () => {
        if (video.dataset.playbackWarning === "true") return;
        video.dataset.playbackWarning = "true";
        const warning = document.createElement("p");
        warning.className = "video-playback-warning";
        warning.textContent =
          "تم استلام رابط الفيديو، لكن المتصفح لم يتمكن من تشغيله مباشرة. جرّب زر التحميل أو أعد الإنشاء.";
        video.insertAdjacentElement("afterend", warning);
      };

      video.addEventListener("error", showWarning, { once: true });
      window.setTimeout(() => {
        if (video.readyState === 0 || Number.isNaN(video.duration) || video.duration === 0) {
          showWarning();
        }
      }, 6000);
    });
  }

  function renderResult(type, payload) {
    const card = $("[data-result-card]");
    const preview = $("[data-result-preview]");
    const link = $("[data-download-link]");
    const resultUrl = payload.resultUrl || payload.url || "";
    const mediaUrl = resultMediaUrl(payload, true);
    const downloadUrl = resultMediaUrl(payload, false);

    if (!card || !preview) {
      return;
    }

    card.hidden = false;
    setResultPlaceholder(true);

    if (type === "image" && resultUrl) {
      preview.innerHTML = `
        <p class="result-success-line">تم إنشاء الصورة بنجاح!</p>
        <img class="result-media" src="${escapeHtml(mediaUrl || resultUrl)}" alt="نتيجة الصورة" />
        <div class="result-actions">
          <a href="${escapeHtml(downloadUrl)}" target="_blank" rel="noreferrer">تحميل</a>
          <button type="button" data-copy-result="${escapeHtml(resultUrl)}">نسخ</button>
          <button type="button" data-regenerate>إعادة إنشاء</button>
          <button type="button" data-enhance-result>تحسين الجودة</button>
        </div>
      `;
      preview.innerHTML = preview.innerHTML.replace(
        '<img class="result-media"',
        '<img class="result-media generated-image" loading="eager"'
      );
    } else if (type === "video" && resultUrl) {
      preview.innerHTML = `
        <p class="result-success-line">تم إنشاء الفيديو بنجاح!</p>
        <video class="result-media" src="${escapeHtml(mediaUrl || resultUrl)}" controls playsinline preload="metadata"></video>
        <div class="result-actions">
          <a href="${escapeHtml(downloadUrl)}" target="_blank" rel="noreferrer">تحميل</a>
          <button type="button" data-copy-result="${escapeHtml(resultUrl)}">نسخ الرابط</button>
          <button type="button" data-regenerate>إعادة إنشاء</button>
        </div>
      `;
      attachVideoPlaybackGuards(preview);
    } else {
      preview.innerHTML = `<div class="processing-result">تم إرسال طلبك بنجاح، وستظهر النتيجة عند اكتمال المعالجة.</div>`;
    }

    if (link) {
      link.hidden = !downloadUrl;
      link.href = downloadUrl || "#";
    }
  }

  function renderResultLoading(type) {
    const card = $("[data-result-card]");
    const preview = $("[data-result-preview]");
    if (!card || !preview) return;

    card.hidden = false;
    setResultPlaceholder(true);
    preview.className = "";
    preview.innerHTML = `
      <div class="result-loading">
        <div class="dashboard-spinner" aria-hidden="true"></div>
        <strong>${type === "video" ? "جاري إنشاء الفيديو" : "جاري إنشاء الصورة"}</strong>
        <p>${type === "video" ? "جاري التواصل مع المعالجة، قد يستغرق ذلك بعض الوقت..." : "جاري التواصل مع المعالجة وإنشاء الصورة..."}</p>
        <button type="button" disabled>إيقاف العملية</button>
      </div>
    `;
  }

  async function refreshKey() {
    const payload = await requestJson("/api/me/key");
    state.key = payload;
    renderKey();
  }

  async function init() {
    try {
      await refreshKey();
      showFormForType("image");
    } catch (error) {
      if (error.status === 401) {
        window.location.href = "/activate";
        return;
      }
      setMessage(error.message || "تعذر تحميل بيانات لوحة المستخدم.", "error");
    }
  }

  $$("[data-create-kind]").forEach((button) => {
    button.addEventListener("click", () => showFormForType(button.dataset.createKind));
  });

  $("[data-duration-group]")?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-duration]");
    if (!button) {
      return;
    }
    state.duration = Number(button.dataset.duration || 5);
    setActiveChip("[data-duration-group]", "duration", state.duration);
    updateCreditEstimate();
  });

  $("[data-quality-group]")?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-quality]");
    if (!button) {
      return;
    }
    state.quality = button.dataset.quality || "high";
    setActiveChip("[data-quality-group]", "quality", state.quality);
    const labels = { normal: "جودة عادية", high: "جودة عالية", ultra: "جودة فائقة" };
    setText("[data-quality-label]", labels[state.quality] || "جودة عالية");
    updateCreditEstimate();
  });

  $("#dashboardPrompt")?.addEventListener("input", updateWordCount);

  $("#dashboardCreateForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();

    try {
      const type = state.selectedType;
      if (!type) {
        throw new Error("اختر صورة أو فيديو أولًا.");
      }

      assertCanGenerate(type);

      const prompt = String($("#dashboardPrompt")?.value || "").trim();
      if (!prompt || prompt.length < 3) {
        throw new Error("اكتب وصفًا واضحًا قبل الإرسال.");
      }

      const requestId = createRequestId();
      const model = "server-selected";
      console.log("FINAL PROMPT SENT TO API:", prompt);
      console.log("SELECTED TYPE:", type);
      console.log("SELECTED QUALITY:", state.quality);
      console.log("MODEL:", model);
      console.log("REQUEST ID:", requestId);

      setLoading(true);
      setMessage("", "");
      appendChatMessage({
        role: "user",
        title: type === "video" ? "طلب فيديو" : "طلب صورة",
        text: prompt,
      });
      const pendingMessage = renderPending(type);
      renderResultLoading(type);

      const payload = await requestJson("/api/generate", {
        method: "POST",
        body: JSON.stringify({
          type,
          prompt,
          model,
          requestId,
          duration: type === "video" ? state.duration : undefined,
          durationSeconds: type === "video" ? state.duration : undefined,
          quality: state.quality,
          style: $("#styleSelect")?.value || "",
        }),
      });

      setMessage("تم الإنشاء بنجاح", "success");
      if (pendingMessage) pendingMessage.remove();
      appendChatMessage({
        role: "assistant",
        title: "تم الإنشاء بنجاح",
        html:
          type === "video"
            ? `<p>تم إنشاء الفيديو بنجاح. ستجد النتيجة كاملة في قسم نتيجتك.</p>`
            : `<p>تم إنشاء الصورة بنجاح. ستجد النتيجة كاملة في قسم نتيجتك.</p>`,
      });
      renderResult(type, payload);
      attachVideoPlaybackGuards();
      await refreshKey();
    } catch (error) {
      setMessage(error.message || "فشل الإنشاء، حاول مرة أخرى.", "error");
      appendChatMessage({
        role: "assistant",
        title: "تعذر الإنشاء",
        text: error.message || "فشل الإنشاء، حاول مرة أخرى.",
      });
    } finally {
      setLoading(false);
    }
  });

  function logoutDashboard() {
    try {
      window.localStorage.removeItem(TOKEN_KEY);
      window.sessionStorage.removeItem(TOKEN_KEY);
      document.cookie = "advancedpro_token=; Path=/; Max-Age=0; SameSite=Lax";
      document.cookie = "token=; Path=/; Max-Age=0; SameSite=Lax";
    } catch (error) {
      // ignore
    }
    window.location.href = "/";
  }

  document.addEventListener("click", (event) => {
    if (!event.target.closest("[data-dashboard-logout]")) return;
    logoutDashboard();
  });

  document.addEventListener("click", async (event) => {
    const copyKey = event.target.closest("[data-copy-key]");
    const copyResult = event.target.closest("[data-copy-result]");
    if (!copyKey && !copyResult) return;

    const value = copyResult?.dataset.copyResult || $("[data-key-code]")?.textContent || "";
    try {
      await navigator.clipboard.writeText(value.trim());
      setMessage("تم النسخ بنجاح", "success");
    } catch (error) {
      setMessage("تعذر النسخ، حاول مرة أخرى.", "error");
    }
  });

  init();
})();
