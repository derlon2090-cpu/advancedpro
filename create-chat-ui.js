(() => {
  window.__advancedProDedicatedCreateChat = true;

  const PAGE = document.body?.dataset?.page || "";
  if (!new Set(["student", "dashboard"]).has(PAGE)) {
    return;
  }

  const API_BASE_URL =
    window.AdvancedProConfig?.apiBaseUrl || "https://advancedpro.onrender.com";
  const AUTH_TOKEN_KEY = "advancedpro_token";
  const ACCESS_CODE_STORAGE_KEY = "advancedpro_access_code";
  const DASHBOARD_REFRESH_EVENT = "advancedpro:request-dashboard-refresh";
  const VIDEO_POLL_INTERVAL_MS = 6000;
  const VIDEO_POLL_ATTEMPTS = 12;

  const refs = {
    lock: document.querySelector("[data-create-lock]"),
    gateMessage: document.querySelector("[data-create-gate]"),
    createMessage: document.querySelector("[data-create-message]"),
    chatStream: document.querySelector("[data-create-chat-stream]"),
    modeNote: document.querySelector("[data-create-mode-note]"),
    balanceStrip: document.querySelector("[data-create-balance]"),
    imageBalance: document.querySelector("[data-image-balance]"),
    videoBalance: document.querySelector("[data-video-balance]"),
    imageCounter: document.querySelector("[data-image-word-count]"),
    videoCounter: document.querySelector("[data-video-word-count]"),
    imageForm: document.querySelector("#imageCreateForm"),
    videoForm: document.querySelector("#videoCreateForm"),
    imagePrompt: document.querySelector("#imagePrompt"),
    videoTitle: document.querySelector("#videoTitle"),
    videoDuration: document.querySelector("#videoDuration"),
    videoSummary: document.querySelector("#videoSummary"),
    scenesWrap: document.querySelector("[data-video-scenes-wrap]"),
    sceneFields: Array.from(document.querySelectorAll("[data-video-scenes] textarea")),
    tabButtons: Array.from(document.querySelectorAll("[data-create-tab]")),
    panels: Array.from(document.querySelectorAll("[data-create-panel]")),
  };

  let activeTab = "image";
  let currentState = null;
  let chatBooted = false;

  function getStoredToken() {
    try {
      const local = window.localStorage.getItem(AUTH_TOKEN_KEY);
      if (local) return local;
    } catch (error) {
      // ignore
    }

    try {
      const session = window.sessionStorage.getItem(AUTH_TOKEN_KEY);
      if (session) return session;
    } catch (error) {
      // ignore
    }

    const cookieMatch = document.cookie.match(
      new RegExp(`(?:^|; )${AUTH_TOKEN_KEY}=([^;]*)`)
    );
    return cookieMatch ? decodeURIComponent(cookieMatch[1]) : null;
  }

  async function requestJson(path, options = {}) {
    const token = getStoredToken();
    const response = await fetch(`${API_BASE_URL}${path}`, {
      credentials: "include",
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
      throw new Error(payload.message || payload.error || "تعذر تنفيذ الطلب.");
    }

    return payload;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function setMessage(target, message, type = "info") {
    if (!target) {
      return;
    }

    if (!message) {
      target.hidden = true;
      target.textContent = "";
      target.className = "status-message";
      return;
    }

    target.hidden = false;
    target.textContent = message;
    target.className = `status-message is-${type}`;
  }

  function setButtonBusy(button, busy, busyText = "جارٍ التنفيذ...") {
    if (!button) {
      return;
    }

    if (!button.dataset.originalLabel) {
      button.dataset.originalLabel = button.textContent.trim();
    }

    button.disabled = busy;
    button.textContent = busy ? busyText : button.dataset.originalLabel;
  }

  function countWords(value) {
    return String(value || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean).length;
  }

  function formatDate(value) {
    if (!value) return "غير محدد";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "غير محدد";
    return new Intl.DateTimeFormat("ar-SA", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(parsed);
  }

  function formatRemainingDuration(value) {
    if (!value) return "غير محدد";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "غير محدد";

    const diff = date.getTime() - Date.now();
    if (diff <= 0) return "منتهي";

    const totalHours = Math.ceil(diff / (1000 * 60 * 60));
    if (totalHours < 24) {
      return `${totalHours} ساعة`;
    }

    return `${Math.ceil(totalHours / 24)} يوم`;
  }

  function persistState(state) {
    try {
      if (state) {
        window.localStorage.setItem(ACCESS_CODE_STORAGE_KEY, JSON.stringify(state));
      } else {
        window.localStorage.removeItem(ACCESS_CODE_STORAGE_KEY);
      }
    } catch (error) {
      // ignore
    }
  }

  function readStoredState() {
    try {
      const raw = window.localStorage.getItem(ACCESS_CODE_STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }

  function normalizeState(rawInfo = {}) {
    const packageName =
      rawInfo.packageName ||
      rawInfo.ownerName ||
      (rawInfo.code ? `كود ${rawInfo.code}` : "الباقة الحالية");
    const imageAvailable = Number(
      rawInfo.imageAvailable ?? rawInfo.imageBalance ?? rawInfo.remainingImages ?? 0
    );
    const videoAvailable = Number(
      rawInfo.videoAvailable ?? rawInfo.videoBalance ?? rawInfo.remainingVideos ?? 0
    );
    const imageUsed = Number(rawInfo.imageUsed ?? 0);
    const videoUsed = Number(rawInfo.videoUsed ?? 0);
    const endAt = rawInfo.endAt || rawInfo.expiresAt || null;
    const expired = endAt ? new Date(endAt).getTime() <= Date.now() : false;
    const approved =
      rawInfo.approved !== false &&
      rawInfo.isActive !== false &&
      rawInfo.status !== "expired" &&
      rawInfo.statusKey !== "expired" &&
      !expired;

    return {
      code: rawInfo.code || "",
      packageName,
      imageAvailable,
      videoAvailable,
      imageUsed,
      videoUsed,
      isRenewable: Boolean(rawInfo.isRenewable),
      renewalLabel: rawInfo.renewalLabel || "",
      endAt,
      email: rawInfo.email || null,
      accessTypeLabel: rawInfo.accessTypeLabel || (rawInfo.email ? "مخصص" : "عام"),
      statusLabel: rawInfo.statusLabel || (approved ? "صالح" : expired ? "منتهي" : "غير مفعل"),
      approved,
      videoMaxDurationSeconds: Number(rawInfo.videoMaxDurationSeconds || 60),
    };
  }

  function deriveFromDashboard(payload) {
    const dashboard = payload?.dashboard;
    if (!dashboard) return null;

    if (dashboard.accessCode) {
      return normalizeState(dashboard.accessCode);
    }

    if (dashboard.subscription) {
      return normalizeState({
        code: dashboard.subscription.code,
        packageName: dashboard.subscription.packageName,
        imageBalance: dashboard.subscription.imageBalance,
        videoBalance: dashboard.subscription.videoBalance,
        imageUsed: dashboard.subscription.imageUsed,
        videoUsed: dashboard.subscription.videoUsed,
        isRenewable: dashboard.subscription.isRenewable,
        renewalLabel: dashboard.subscription.renewalLabel,
        endAt: dashboard.subscription.endAt,
        email: dashboard.subscription.email,
        accessTypeLabel: dashboard.subscription.accessTypeLabel,
        status: dashboard.subscription.status,
        statusLabel: dashboard.subscription.status === "active" ? "صالح" : "منتهي",
        videoMaxDurationSeconds: dashboard.subscription.videoMaxDurationSeconds,
      });
    }

    return null;
  }

  function scrollChatToBottom() {
    if (!refs.chatStream) {
      return;
    }

    refs.chatStream.scrollTo({
      top: refs.chatStream.scrollHeight,
      behavior: "smooth",
    });
  }

  function renderBubble(
    bubble,
    {
      role = "assistant",
      state = "info",
      label = role === "assistant" ? "المساعد الذكي" : "أنت",
      title = "",
      body = "",
      meta = [],
      mediaUrl = "",
      mediaType = "",
      actions = [],
      loading = false,
    } = {}
  ) {
    const stateLabels = {
      info: "معلومة",
      pending: "بانتظار الإعداد",
      processing: "جارٍ المعالجة",
      success: "تم الإنشاء",
      error: "فشل الإنشاء",
    };

    const safeMeta = Array.isArray(meta) ? meta.filter(Boolean) : [];
    const safeActions = Array.isArray(actions) ? actions.filter(Boolean) : [];
    const mediaMarkup = mediaUrl
      ? mediaType === "video"
        ? `<div class="create-chat-bubble__media"><video controls preload="metadata" src="${escapeHtml(
            mediaUrl
          )}"></video></div>`
        : `<div class="create-chat-bubble__media"><img src="${escapeHtml(
            mediaUrl
          )}" alt="${escapeHtml(title || "النتيجة")}" loading="lazy" /></div>`
      : "";
    const metaMarkup = safeMeta.length
      ? `<div class="create-chat-bubble__meta">${safeMeta
          .map((item) => `<span>${escapeHtml(item)}</span>`)
          .join("")}</div>`
      : "";
    const actionsMarkup = safeActions.length
      ? `<div class="create-chat-bubble__actions">${safeActions
          .map(
            (action) =>
              `<a class="create-chat-link" href="${escapeHtml(action.href || "#")}" ${
                action.external ? 'target="_blank" rel="noopener noreferrer"' : ""
              }>${escapeHtml(action.label || "فتح")}</a>`
          )
          .join("")}</div>`
      : "";
    const loaderMarkup = loading
      ? `<div class="chat-loader" aria-hidden="true"><span class="chat-loader__dot"></span><span class="chat-loader__dot"></span><span class="chat-loader__dot"></span></div>`
      : "";

    bubble.className = `create-chat-bubble create-chat-bubble--${role} create-chat-bubble--${state}`;
    bubble.innerHTML = `
      <div class="create-chat-bubble__top">
        <span class="create-chat-bubble__label">${escapeHtml(label)}</span>
        <span class="create-chat-bubble__state">${escapeHtml(stateLabels[state] || stateLabels.info)}</span>
      </div>
      ${title ? `<h3 class="create-chat-bubble__title">${escapeHtml(title)}</h3>` : ""}
      ${body ? `<p class="create-chat-bubble__body">${escapeHtml(body)}</p>` : ""}
      ${loaderMarkup}
      ${metaMarkup}
      ${mediaMarkup}
      ${actionsMarkup}
    `;
  }

  function appendBubble(config = {}) {
    if (!refs.chatStream) {
      return null;
    }

    ensureIntro();
    const bubble = document.createElement("article");
    renderBubble(bubble, config);
    refs.chatStream.appendChild(bubble);
    scrollChatToBottom();
    return bubble;
  }

  function updateBubble(bubble, config = {}) {
    if (!bubble) {
      return;
    }

    renderBubble(bubble, config);
    scrollChatToBottom();
  }

  function ensureIntro() {
    if (!refs.chatStream || chatBooted) {
      return;
    }

    chatBooted = true;
    appendBubble({
      role: "assistant",
      state: "info",
      title: "جاهز للإنشاء",
      body:
        "بدّل بسهولة بين صورة ومقطع. عند اختيار صورة ستكتب وصفًا فقط، وعند اختيار مقطع ستظهر لك المدة والسيناريوهات داخل نفس الواجهة.",
      meta: ["كل شيء يتم هنا بدون تحديث الصفحة"],
    });
  }

  function activateTab(tab) {
    activeTab = tab === "video" ? "video" : "image";
    refs.tabButtons.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.createTab === activeTab);
    });
    refs.panels.forEach((panel) => {
      panel.classList.toggle("is-active", panel.dataset.createPanel === activeTab);
    });
    updateModeNote();
  }

  function updateModeNote() {
    if (!refs.modeNote) {
      return;
    }

    const duration = Number(refs.videoDuration?.value || 60);
    if (activeTab === "video") {
      refs.modeNote.innerHTML =
        duration === 60
          ? 'وضع <strong>المقطع</strong> مفعّل. أكمل <strong>6 سيناريوهات</strong>، كل سيناريو يمثل 10 ثوانٍ من المقطع.'
          : 'وضع <strong>المقطع</strong> مفعّل. اختر المدة ثم اكتب الوصف العام وابدأ الإنشاء مباشرة.';
      return;
    }

    refs.modeNote.innerHTML =
      'وضع <strong>الصورة</strong> مفعّل. اكتب وصفًا واضحًا ثم اضغط <strong>بدء الإنشاء</strong>.';
  }

  function updateScenesVisibility() {
    if (!refs.scenesWrap) {
      return;
    }

    const duration = Number(refs.videoDuration?.value || 60);
    refs.scenesWrap.style.display = activeTab === "video" && duration === 60 ? "grid" : "none";
    updateModeNote();
  }

  function updateWordCounters() {
    if (refs.imageCounter) {
      refs.imageCounter.textContent = `عدد الكلمات: ${countWords(refs.imagePrompt?.value)}`;
    }

    const totalVideoWords =
      countWords(refs.videoTitle?.value) +
      countWords(refs.videoSummary?.value) +
      refs.sceneFields.reduce((total, field) => total + countWords(field?.value), 0);

    if (refs.videoCounter) {
      refs.videoCounter.textContent = `عدد الكلمات: ${totalVideoWords}`;
    }
  }

  function updateBalances(state) {
    const imageText = `الرصيد المتاح: ${state?.imageAvailable ?? 0} صورة`;
    const videoText = `الرصيد المتاح: ${state?.videoAvailable ?? 0} مقطع`;

    if (refs.imageBalance) {
      refs.imageBalance.textContent = imageText;
    }
    if (refs.videoBalance) {
      refs.videoBalance.textContent = videoText;
    }
    if (refs.balanceStrip) {
      refs.balanceStrip.innerHTML = `
        <div class="balance-pill">
          <span>رصيد الصور</span>
          <strong>${escapeHtml(state?.imageAvailable ?? 0)} صورة</strong>
        </div>
        <div class="balance-pill">
          <span>رصيد المقاطع</span>
          <strong>${escapeHtml(state?.videoAvailable ?? 0)} مقطع</strong>
        </div>
      `;
    }
  }

  function applyTabAccess(state) {
    const allowedByType = {
      image: Boolean(state && Number(state.imageAvailable || 0) > 0),
      video: Boolean(state && Number(state.videoAvailable || 0) > 0),
    };

    refs.tabButtons.forEach((button) => {
      const type = button.dataset.createTab;
      const allowed = Boolean(type && allowedByType[type]);
      button.disabled = !allowed;
      button.classList.toggle("is-disabled", !allowed);
      button.setAttribute("aria-disabled", String(!allowed));
    });

    if (!allowedByType[activeTab]) {
      if (allowedByType.image) {
        activeTab = "image";
      } else if (allowedByType.video) {
        activeTab = "video";
      }
    }

    if (!allowedByType.image && !allowedByType.video) {
      refs.panels.forEach((panel) => panel.classList.remove("is-active"));
      return;
    }

    activateTab(activeTab);
  }

  function toggleChat(enabled, state = null) {
    if (refs.lock) {
      refs.lock.hidden = Boolean(enabled);
    }

    if (refs.gateMessage) {
      if (enabled) {
        refs.gateMessage.hidden = true;
        refs.gateMessage.textContent = "";
      } else {
        refs.gateMessage.hidden = false;
        refs.gateMessage.className = "status-message is-error";
        refs.gateMessage.textContent = state?.message || "فعّل كودًا صالحًا أولًا لفتح الشات.";
      }
    }

    applyTabAccess(enabled ? state : null);

    refs.panels.forEach((panel) => {
      const type = panel.dataset.createPanel;
      const panelAllowed =
        enabled &&
        ((type === "image" && Number(state?.imageAvailable || 0) > 0) ||
          (type === "video" && Number(state?.videoAvailable || 0) > 0));

      panel.classList.toggle("create-disabled", !panelAllowed);
      panel.querySelectorAll("input, textarea, select, button").forEach((input) => {
        input.disabled = !panelAllowed;
      });
    });

    updateBalances(state);
    updateScenesVisibility();
    updateWordCounters();
  }

  async function refreshStateFromDashboard({ preserveStoredState = true } = {}) {
    try {
      const payload = await requestJson("/api/dashboard", { method: "GET" });
      const state = deriveFromDashboard(payload);
      if (state) {
        currentState = state;
        persistState(state);
        toggleChat(state.approved, state);
        document.dispatchEvent(
          new CustomEvent("advancedpro:access-code-state", { detail: { state } })
        );
      } else if (!preserveStoredState) {
        currentState = null;
        persistState(null);
        toggleChat(false, {
          approved: false,
          message: "لم يتم تفعيل أي كود بعد.",
        });
      }
    } catch (error) {
      if (!preserveStoredState) {
        throw error;
      }
    }
  }

  async function pollVideoResult({ generationId, bubble, summary }) {
    for (let attempt = 1; attempt <= VIDEO_POLL_ATTEMPTS; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, VIDEO_POLL_INTERVAL_MS));

      try {
        const payload = await requestJson(`/api/ai/video/${generationId}`, {
          method: "GET",
        });

        if (payload.resultUrl) {
          await refreshStateFromDashboard();
          document.dispatchEvent(new CustomEvent(DASHBOARD_REFRESH_EVENT));
          updateBubble(bubble, {
            role: "assistant",
            state: "success",
            title: "تم إنشاء المقطع",
            body: "المقطع أصبح جاهزًا الآن، وتم تحديث الرصيد وسجل أعمالك مباشرة.",
            meta: [
              summary ? `الوصف: ${summary}` : "",
              `المعرف: #${generationId}`,
              `الرصيد الحالي: ${currentState?.imageAvailable ?? 0} صورة / ${
                currentState?.videoAvailable ?? 0
              } مقطع`,
            ],
            mediaUrl: payload.resultUrl,
            mediaType: "video",
            actions: [
              {
                label: "فتح النتيجة",
                href: payload.resultUrl,
                external: true,
              },
            ],
          });
          return;
        }

        updateBubble(bubble, {
          role: "assistant",
          state: "processing",
          title: "جارٍ معالجة المقطع",
          body: "المقطع يحتاج بعض الوقت الإضافي. نرتب المشاهد ونحسن الإخراج لك الآن...",
          meta: [`محاولة التحديث ${attempt} من ${VIDEO_POLL_ATTEMPTS}`],
          loading: true,
        });
      } catch (error) {
        if (attempt === VIDEO_POLL_ATTEMPTS) {
          updateBubble(bubble, {
            role: "assistant",
            state: "error",
            title: "تعذر تحديث حالة المقطع",
            body: error.message || "لم نتمكن من متابعة حالة المقطع الآن.",
          });
        }
      }
    }
  }

  function buildVideoPayload(values) {
    const duration = Number(values.durationSeconds || 60);
    const title = String(values.title || "").trim();
    const summary = String(values.summary || "").trim();
    const scenes =
      duration === 60
        ? refs.sceneFields.map((field) => String(field.value || "").trim()).filter(Boolean)
        : [];

    return {
      duration,
      summary,
      scenes,
      prompt: `
عنوان: ${title || "مقطع جديد"}
وصف عام: ${summary}
المدة: ${duration} ثانية
${scenes.length ? `المشاهد:\n${scenes.map((scene, index) => `المشهد ${index + 1}: ${scene}`).join("\n")}` : ""}
      `.trim(),
    };
  }

  async function handleImageSubmit(event) {
    event.preventDefault();
    const button = refs.imageForm?.querySelector('button[type="submit"]');
    let progressBubble = null;
    let processingTimer = null;

    try {
      if (!currentState?.approved) {
        throw new Error("فعّل كودك أولًا للبدء في الإنشاء.");
      }
      if (Number(currentState.imageAvailable || 0) <= 0) {
        throw new Error("رصيد الصور انتهى، فعّل كودًا جديدًا أو حدّث باقتك.");
      }

      const prompt = String(refs.imagePrompt?.value || "").trim();
      if (!prompt) {
        throw new Error("أدخل وصفًا واضحًا للصورة قبل الإرسال.");
      }

      appendBubble({
        role: "user",
        state: "info",
        label: "أنت",
        title: "طلب صورة",
        body: prompt,
        meta: [`${countWords(prompt)} كلمة`],
      });

      setButtonBusy(button, true, "جارٍ الإنشاء...");
      setMessage(refs.createMessage, "");
      progressBubble = appendBubble({
        role: "assistant",
        state: "pending",
        title: "بانتظار الإعداد",
        body: "انتظر 10 ثوانٍ لنجهز لك أفضل نتيجة ✨",
        loading: true,
      });

      processingTimer = window.setTimeout(() => {
        updateBubble(progressBubble, {
          role: "assistant",
          state: "processing",
          title: "جارٍ معالجة الصورة",
          body: "جارٍ إعداد طلبك وتحسين النتيجة لك، انتظر قليلًا...",
          loading: true,
        });
      }, 700);

      const payload = await requestJson("/api/ai/image", {
        method: "POST",
        body: JSON.stringify({ prompt }),
      });

      if (processingTimer) {
        window.clearTimeout(processingTimer);
      }

      refs.imageForm?.reset();
      updateWordCounters();
      await refreshStateFromDashboard();
      document.dispatchEvent(new CustomEvent(DASHBOARD_REFRESH_EVENT));

      updateBubble(progressBubble, {
        role: "assistant",
        state: "success",
        title: "تم إنشاء الصورة",
        body: "الصورة أصبحت جاهزة، وتم تحديث الرصيد وسجل أعمالك مباشرة.",
        meta: [
          payload.generationId ? `المعرف: #${payload.generationId}` : "",
          `الرصيد الحالي: ${currentState?.imageAvailable ?? 0} صورة / ${
            currentState?.videoAvailable ?? 0
          } مقطع`,
        ],
        mediaUrl: payload.resultUrl || "",
        mediaType: "image",
        actions: payload.resultUrl
          ? [{ label: "فتح الصورة", href: payload.resultUrl, external: true }]
          : [],
      });
    } catch (error) {
      if (processingTimer) {
        window.clearTimeout(processingTimer);
      }
      if (progressBubble) {
        updateBubble(progressBubble, {
          role: "assistant",
          state: "error",
          title: "فشل إنشاء الصورة",
          body: error.message,
        });
      }
      setMessage(refs.createMessage, error.message, "error");
    } finally {
      setButtonBusy(button, false);
    }
  }

  async function handleVideoSubmit(event) {
    event.preventDefault();
    const button = refs.videoForm?.querySelector('button[type="submit"]');
    let progressBubble = null;
    let processingTimer = null;

    try {
      if (!currentState?.approved) {
        throw new Error("فعّل كودك أولًا للبدء في الإنشاء.");
      }
      if (Number(currentState.videoAvailable || 0) <= 0) {
        throw new Error("رصيد المقاطع انتهى، فعّل كودًا جديدًا أو حدّث باقتك.");
      }

      const values = Object.fromEntries(new FormData(refs.videoForm).entries());
      const summary = String(values.summary || "").trim();
      if (!summary) {
        throw new Error("أدخل وصفًا عامًا للمقطع قبل الإرسال.");
      }

      const { prompt, duration, scenes } = buildVideoPayload(values);
      if (duration === 60 && scenes.length < 6) {
        throw new Error("الرجاء تعبئة جميع السيناريوهات الستة للمقطع 60 ثانية.");
      }

      appendBubble({
        role: "user",
        state: "info",
        label: "أنت",
        title: "طلب مقطع",
        body: summary,
        meta: [
          `المدة: ${duration} ثانية`,
          `${countWords(
            `${values.title || ""} ${summary} ${scenes.join(" ")}`
          )} كلمة`,
          duration === 60 ? `${scenes.length} / 6 سيناريوهات` : "مقطع قصير",
        ],
      });

      setButtonBusy(button, true, "جارٍ الإنشاء...");
      setMessage(refs.createMessage, "");
      progressBubble = appendBubble({
        role: "assistant",
        state: "pending",
        title: "بانتظار الإعداد",
        body: "استلمنا تفاصيل المقطع. نرتب السيناريو والمشاهد لك الآن...",
        loading: true,
      });

      processingTimer = window.setTimeout(() => {
        updateBubble(progressBubble, {
          role: "assistant",
          state: "processing",
          title: "جارٍ معالجة المقطع",
          body: "المقطع يحتاج وقتًا أطول قليلًا. نراجع المشاهد ونبدأ الإخراج الآن...",
          loading: true,
        });
      }, 700);

      const payload = await requestJson("/api/ai/video", {
        method: "POST",
        body: JSON.stringify({
          prompt,
          durationSeconds: duration,
        }),
      });

      if (processingTimer) {
        window.clearTimeout(processingTimer);
      }

      refs.videoForm?.reset();
      updateScenesVisibility();
      updateWordCounters();
      await refreshStateFromDashboard();
      document.dispatchEvent(new CustomEvent(DASHBOARD_REFRESH_EVENT));

      updateBubble(progressBubble, {
        role: "assistant",
        state: payload.status === "completed" ? "success" : "processing",
        title: payload.status === "completed" ? "تم إنشاء المقطع" : "جارٍ معالجة المقطع",
        body:
          payload.status === "completed"
            ? "المقطع أصبح جاهزًا وتم تحديث الرصيد وسجل أعمالك."
            : "تم استلام طلبك بنجاح. المقطع الآن قيد المعالجة وسأتابع حالته لك هنا.",
        meta: [
          payload.generationId ? `المعرف: #${payload.generationId}` : "",
          `الرصيد الحالي: ${currentState?.imageAvailable ?? 0} صورة / ${
            currentState?.videoAvailable ?? 0
          } مقطع`,
        ],
        loading: payload.status !== "completed",
      });

      if (payload.resultUrl) {
        updateBubble(progressBubble, {
          role: "assistant",
          state: "success",
          title: "تم إنشاء المقطع",
          body: "المقطع أصبح جاهزًا وتم تحديث الرصيد وسجل أعمالك.",
          meta: [
            payload.generationId ? `المعرف: #${payload.generationId}` : "",
            `الرصيد الحالي: ${currentState?.imageAvailable ?? 0} صورة / ${
              currentState?.videoAvailable ?? 0
            } مقطع`,
          ],
          mediaUrl: payload.resultUrl,
          mediaType: "video",
          actions: [{ label: "فتح النتيجة", href: payload.resultUrl, external: true }],
        });
      } else if (payload.generationId) {
        pollVideoResult({
          generationId: payload.generationId,
          bubble: progressBubble,
          summary,
        }).catch(() => {
          // ignore async poll errors here
        });
      }
    } catch (error) {
      if (processingTimer) {
        window.clearTimeout(processingTimer);
      }
      if (progressBubble) {
        updateBubble(progressBubble, {
          role: "assistant",
          state: "error",
          title: "فشل إنشاء المقطع",
          body: error.message,
        });
      }
      setMessage(refs.createMessage, error.message, "error");
    } finally {
      setButtonBusy(button, false);
    }
  }

  function bindEvents() {
    refs.tabButtons.forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        if (button.disabled) {
          return;
        }
        activateTab(button.dataset.createTab || "image");
        updateScenesVisibility();
      });
    });

    refs.videoDuration?.addEventListener("change", updateScenesVisibility);
    refs.imagePrompt?.addEventListener("input", updateWordCounters);
    refs.videoTitle?.addEventListener("input", updateWordCounters);
    refs.videoSummary?.addEventListener("input", updateWordCounters);
    refs.sceneFields.forEach((field) => field.addEventListener("input", updateWordCounters));

    refs.imageForm?.addEventListener("submit", handleImageSubmit);
    refs.videoForm?.addEventListener("submit", handleVideoSubmit);

    document.addEventListener("advancedpro:access-code-state", (event) => {
      const nextState = event.detail?.state ? normalizeState(event.detail.state) : null;
      currentState = nextState;
      persistState(nextState);
      toggleChat(Boolean(nextState?.approved), nextState);
    });
  }

  function bootstrap() {
    ensureIntro();
    bindEvents();
    activateTab(activeTab);
    updateScenesVisibility();
    updateWordCounters();

    const stored = readStoredState();
    if (stored) {
      currentState = normalizeState(stored);
      toggleChat(Boolean(currentState?.approved), currentState);
    } else {
      toggleChat(false, {
        approved: false,
        message: "فعّل كودًا صالحًا أولًا لفتح الشات.",
      });
    }

    refreshStateFromDashboard().catch(() => {
      // ignore initial load failures
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap);
  } else {
    bootstrap();
  }
})();
