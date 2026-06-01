(function () {
  const API_BASE_URL =
    window.AdvancedProConfig?.apiBaseUrl || "https://advancedpro.onrender.com";
  const TOKEN_KEY = "advancedpro_token";
  const state = {
    user: null,
    key: null,
    selectedType: null,
    duration: 10,
    quality: "high",
    loading: false,
  };

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));

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
      ...options,
      headers: {
        "Content-Type": "application/json",
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

  function renderKey() {
    const key = state.key || {};
    const imagesRemaining = Number(key.imagesRemaining || 0);
    const videosRemaining = Number(key.videosRemaining || 0);
    const imagesLimit = Number(key.imagesLimit || 0);
    const videosLimit = Number(key.videosLimit || 0);

    setText("[data-key-status]", key.status === "active" ? "نشط" : key.status || "غير مفعل");
    setText("[data-images-counter]", `${imagesRemaining} / ${imagesLimit}`);
    setText("[data-videos-counter]", `${videosRemaining} / ${videosLimit}`);
    setText("[data-key-code]", key.codeMasked || "لا يوجد مفتاح مفعّل");
    setText("[data-key-activated]", formatDate(key.activatedAt));
    setText("[data-key-expires]", formatDate(key.expiresAt));
    setText("[data-key-plan]", key.planName || "--");
    setProgress("[data-images-progress]", imagesRemaining, imagesLimit);
    setProgress("[data-videos-progress]", videosRemaining, videosLimit);
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

  function showFormForType(type) {
    state.selectedType = type;
    $$(".creation-type-card").forEach((button) => {
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
    setText("[data-submit-label]", type === "video" ? "إنشاء الفيديو" : "إنشاء الصورة");
    setMessage("", "");
    updateWordCount();
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
      button.textContent = isLoading ? "جارٍ الإنشاء..." : state.selectedType === "video" ? "إنشاء الفيديو" : "إنشاء الصورة";
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
  }

  function renderResult(type, payload) {
    const card = $("[data-result-card]");
    const preview = $("[data-result-preview]");
    const link = $("[data-download-link]");
    const resultUrl = payload.resultUrl || payload.url || "";

    if (!card || !preview) {
      return;
    }

    card.hidden = false;

    if (type === "image" && resultUrl) {
      preview.innerHTML = `<img class="result-media" src="${resultUrl}" alt="نتيجة الصورة" />`;
    } else if (type === "video" && resultUrl) {
      preview.innerHTML = `<video class="result-media" src="${resultUrl}" controls playsinline></video>`;
    } else {
      preview.innerHTML = `<div class="processing-result">تم إرسال طلبك بنجاح، وستظهر النتيجة عند اكتمال المعالجة.</div>`;
    }

    if (link) {
      link.hidden = !payload.generationId;
      link.href = payload.generationId ? `${API_BASE_URL}/api/download/${payload.generationId}` : "#";
    }
  }

  async function refreshKey() {
    const payload = await requestJson("/api/me/key");
    state.key = payload;
    renderKey();
  }

  async function init() {
    try {
      await refreshKey();
    } catch (error) {
      if (error.status === 401) {
        window.location.href = "/activate";
        return;
      }
      setMessage(error.message || "تعذر تحميل بيانات لوحة المستخدم.", "error");
    }
  }

  $$(".creation-type-card").forEach((button) => {
    button.addEventListener("click", () => showFormForType(button.dataset.createKind));
  });

  $("[data-duration-group]")?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-duration]");
    if (!button) {
      return;
    }
    state.duration = Number(button.dataset.duration || 10);
    setActiveChip("[data-duration-group]", "duration", state.duration);
  });

  $("[data-quality-group]")?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-quality]");
    if (!button) {
      return;
    }
    state.quality = button.dataset.quality || "high";
    setActiveChip("[data-quality-group]", "quality", state.quality);
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
      if (!prompt) {
        throw new Error("اكتب وصفًا واضحًا قبل الإرسال.");
      }

      setLoading(true);
      setMessage("", "");

      const payload = await requestJson("/api/generate", {
        method: "POST",
        body: JSON.stringify({
          type,
          prompt,
          duration: type === "video" ? state.duration : undefined,
          durationSeconds: type === "video" ? state.duration : undefined,
          quality: state.quality,
          style: $("#styleSelect")?.value || "",
        }),
      });

      setMessage("تم الإنشاء بنجاح", "success");
      renderResult(type, payload);
      await refreshKey();
    } catch (error) {
      setMessage(error.message || "فشل الإنشاء، حاول مرة أخرى.", "error");
    } finally {
      setLoading(false);
    }
  });

  $("[data-dashboard-logout]")?.addEventListener("click", () => {
    try {
      window.localStorage.removeItem(TOKEN_KEY);
      window.sessionStorage.removeItem(TOKEN_KEY);
      document.cookie = "advancedpro_token=; Path=/; Max-Age=0; SameSite=Lax";
      document.cookie = "token=; Path=/; Max-Age=0; SameSite=Lax";
    } catch (error) {
      // ignore
    }
    window.location.href = "/";
  });

  init();
})();
