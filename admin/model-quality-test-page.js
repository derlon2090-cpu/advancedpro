(function () {
  const API_BASE_URL = window.AdvancedProConfig?.apiBaseUrl || "";
  const $ = (selector) => document.querySelector(selector);
  const nf = new Intl.NumberFormat("en-US");

  const state = {
    config: null,
    tests: [],
    summary: null,
    search: "",
    running: false,
  };

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function loginPath() {
    const configured = String(window.AdvancedProConfig?.adminSecretPath || "advanced-pro-control").replace(/^\/+|\/+$/g, "");
    return `/${configured || "advanced-pro-control"}`;
  }

  async function requestJson(path, options = {}) {
    const response = await fetch(`${API_BASE_URL}${path}`, {
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
    if (!response.ok) {
      const error = new Error(payload.message || "تعذر تنفيذ الطلب.");
      error.status = response.status;
      error.redirectTo = payload.redirectTo;
      throw error;
    }
    return payload;
  }

  function formatDate(value) {
    if (!value) return "غير محدد";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "غير محدد";
    return new Intl.DateTimeFormat("ar-SA", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  }

  function showToast(message, kind = "success") {
    const toast = $("[data-model-quality-toast]");
    toast.textContent = message;
    toast.dataset.kind = kind;
    toast.hidden = false;
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => {
      toast.hidden = true;
    }, 3600);
  }

  async function copyText(value, label = "القيمة") {
    if (!value) {
      showToast("لا توجد قيمة للنسخ.", "error");
      return;
    }
    await navigator.clipboard.writeText(value);
    showToast(`تم نسخ ${label}.`);
  }

  function selectedType() {
    return $("[data-model-quality-type]")?.value === "video" ? "video" : "image";
  }

  function selectedModel() {
    return String($("[data-model-quality-model]")?.value || "").trim();
  }

  function modelOptions() {
    if (!state.config) return [];
    return selectedType() === "video" ? state.config.videoModels || [] : state.config.imageModels || [];
  }

  function renderModelOptions() {
    const select = $("[data-model-quality-model]");
    const options = modelOptions();
    select.innerHTML = options
      .map(
        (model) => `
          <option value="${escapeHtml(model.id)}">
            ${escapeHtml(model.label)} - ${escapeHtml(model.id)}
          </option>
        `
      )
      .join("");
  }

  function statusLabel(status) {
    return {
      passed: "مطابقة",
      failed: "غير مطابقة",
      review: "يحتاج مراجعة",
    }[status] || "يحتاج مراجعة";
  }

  function renderSummary(summary = {}) {
    const cards = [
      ["المطابقة", summary.passed || 0, "✓", "passed"],
      ["غير المطابقة", summary.failed || 0, "×", "failed"],
      ["تحتاج مراجعة", summary.review || 0, "◷", "review"],
      ["المكتملة", `${summary.total || 0}/5`, "▣", "total"],
    ];

    $("[data-model-quality-summary]").innerHTML = cards
      .map(
        ([label, value, icon, kind]) => `
          <article class="admin-model-quality-stat admin-model-quality-stat--${kind}">
            <span>${icon}</span>
            <div>
              <small>${label}</small>
              <strong>${escapeHtml(value)}</strong>
            </div>
          </article>
        `
      )
      .join("");

    const report = $("[data-model-quality-report]");
    report.innerHTML = `
      <strong>تقرير الموديل</strong>
      <p>${escapeHtml(summary.recommendation || "بانتظار تشغيل الاختبارات والتقييم اليدوي.")}</p>
      <div>
        <span>الاستخدام المقترح: ${escapeHtml(summary.usage || "review")}</span>
        <span>الأوصاف المركبة: ${summary.complexPromptsAllowed ? "مسموحة" : "غير معتمدة بعد"}</span>
      </div>
    `;
  }

  function renderPreview(item) {
    if (!item.resultUrl) {
      return `<div class="admin-model-quality-no-preview">لا توجد نتيجة محفوظة لهذا الاختبار</div>`;
    }
    return item.type === "video"
      ? `<video src="${escapeHtml(item.resultUrl)}" controls preload="metadata"></video>`
      : `<img src="${escapeHtml(item.resultUrl)}" alt="" loading="lazy" />`;
  }

  function renderExpectedItems(items = []) {
    if (!items.length) return `<span>لا توجد عناصر متوقعة</span>`;
    return items.map((item) => `<span>${escapeHtml(item)}</span>`).join("");
  }

  function matchesSearch(item) {
    const query = state.search.trim().toLowerCase();
    if (!query) return true;
    const text = [
      item.model,
      item.prompt,
      item.finalPrompt,
      item.status,
      ...(item.expectedItems || []),
    ]
      .join(" ")
      .toLowerCase();
    return text.includes(query);
  }

  function renderTestCard(item) {
    return `
      <article class="admin-model-quality-card" data-test-id="${escapeHtml(item.id)}">
        <div class="admin-model-quality-preview">
          ${renderPreview(item)}
        </div>

        <div class="admin-model-quality-body">
          <header>
            <span class="admin-model-quality-status admin-model-quality-status--${escapeHtml(item.status)}">
              ${escapeHtml(statusLabel(item.status))}
            </span>
            <strong>#${escapeHtml(item.id)} - ${escapeHtml(item.model)}</strong>
            <small>${escapeHtml(formatDate(item.createdAt))}</small>
          </header>

          <section class="admin-model-quality-prompts">
            <div>
              <b>USER_PROMPT</b>
              <p dir="auto">${escapeHtml(item.prompt)}</p>
            </div>
            <div>
              <b>FINAL_PROMPT</b>
              <pre>${escapeHtml(item.finalPrompt || "لم يتم حفظ البرومبت النهائي.")}</pre>
            </div>
          </section>

          <div class="admin-model-quality-expected">
            ${renderExpectedItems(item.expectedItems)}
          </div>

          <label class="admin-model-quality-notes">
            <span>ملاحظات المطابقة</span>
            <textarea data-notes-for="${escapeHtml(item.id)}" placeholder="اكتب ملاحظاتك البصرية هنا...">${escapeHtml(item.notes || "")}</textarea>
          </label>

          <footer>
            <button type="button" data-quality-status="passed" data-quality-id="${escapeHtml(item.id)}">مطابقة</button>
            <button type="button" data-quality-status="review" data-quality-id="${escapeHtml(item.id)}">جزئيًا</button>
            <button type="button" data-quality-status="failed" data-quality-id="${escapeHtml(item.id)}">غير مطابقة</button>
            <button type="button" data-copy-value="${escapeHtml(item.resultUrl || "")}" data-copy-label="رابط النتيجة">نسخ الرابط</button>
          </footer>
        </div>
      </article>
    `;
  }

  function renderTests() {
    const list = $("[data-model-quality-list]");
    const visible = state.tests.filter(matchesSearch);
    if (!visible.length) {
      list.innerHTML = `<div class="admin-v2-empty">لا توجد نتائج مطابقة. شغّل الاختبارات أو غيّر البحث.</div>`;
      return;
    }
    list.innerHTML = visible.map(renderTestCard).join("");
  }

  async function loadAdminSession() {
    const payload = await requestJson("/api/admin/session");
    const profile = $("[data-admin-profile]");
    profile.querySelector("strong").textContent = payload.admin?.name || "مرحبًا";
    profile.querySelector("small").textContent = payload.admin?.role || "Admin";
    profile.querySelector(".admin-v2-avatar").textContent =
      String(payload.admin?.name || "A").trim().charAt(0).toUpperCase() || "A";
  }

  async function loadConfig() {
    state.config = await requestJson("/api/admin/model-quality-test/config");
    renderModelOptions();
  }

  async function loadResults() {
    const list = $("[data-model-quality-list]");
    list.setAttribute("aria-busy", "true");
    try {
      const params = new URLSearchParams({
        type: selectedType(),
        model: selectedModel(),
        limit: "100",
      });
      const payload = await requestJson(`/api/admin/model-quality-test/results?${params}`);
      state.tests = payload.tests || [];
      state.summary = payload.summary || {};
      renderSummary(state.summary);
      renderTests();
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        window.location.href = error.redirectTo || loginPath();
        return;
      }
      renderSummary({});
      list.innerHTML = `<div class="admin-v2-empty admin-model-quality-error">${escapeHtml(error.message)}</div>`;
    } finally {
      list.removeAttribute("aria-busy");
    }
  }

  async function runTests() {
    if (state.running) return;
    const button = $("[data-model-quality-run]");
    state.running = true;
    button.disabled = true;
    button.textContent = "جاري تشغيل 5 اختبارات...";
    $("[data-model-quality-list]").innerHTML = `
      <div class="admin-v2-empty admin-model-quality-running">
        يتم الآن توليد 5 نتائج متتابعة لهذا الموديل. لن يتوقف الاختبار عند أول فشل.
      </div>
    `;

    try {
      const payload = await requestJson("/api/admin/model-quality-test/run", {
        method: "POST",
        body: JSON.stringify({
          type: selectedType(),
          model: selectedModel(),
        }),
      });
      state.tests = payload.tests || [];
      state.summary = payload.summary || {};
      renderSummary(state.summary);
      renderTests();
      showToast(payload.message || "اكتملت اختبارات الموديل.");
    } catch (error) {
      showToast(error.message, "error");
      await loadResults();
    } finally {
      state.running = false;
      button.disabled = false;
      button.textContent = "تشغيل الاختبارات الخمسة";
    }
  }

  async function updateStatus(id, status) {
    const notes = $(`[data-notes-for="${CSS.escape(String(id))}"]`)?.value || "";
    try {
      const payload = await requestJson(`/api/admin/model-quality-test/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ status, notes }),
      });
      state.tests = state.tests.map((item) => (String(item.id) === String(id) ? payload.test : item));
      state.summary = payload.summary || state.summary;
      renderSummary(state.summary);
      renderTests();
      showToast("تم حفظ تقييم الاختبار.");
    } catch (error) {
      showToast(error.message, "error");
    }
  }

  async function logout() {
    try {
      await requestJson("/api/admin/logout", { method: "POST" });
    } finally {
      window.location.href = loginPath();
    }
  }

  function bindEvents() {
    $("[data-admin-drawer-toggle]")?.addEventListener("click", () => {
      $("#adminSidebar")?.classList.toggle("is-open");
    });
    $("[data-logout]")?.addEventListener("click", logout);
    $("[data-model-quality-refresh]")?.addEventListener("click", loadResults);
    $("[data-model-quality-run]")?.addEventListener("click", runTests);
    $("[data-model-quality-type]")?.addEventListener("change", () => {
      renderModelOptions();
      loadResults();
    });
    $("[data-model-quality-model]")?.addEventListener("change", loadResults);
    $("[data-model-quality-search]")?.addEventListener("input", (event) => {
      state.search = event.target.value || "";
      renderTests();
    });
    document.addEventListener("click", (event) => {
      const statusButton = event.target.closest("[data-quality-status]");
      if (statusButton) {
        updateStatus(statusButton.dataset.qualityId, statusButton.dataset.qualityStatus);
        return;
      }

      const copyButton = event.target.closest("[data-copy-value]");
      if (copyButton) {
        copyText(copyButton.dataset.copyValue, copyButton.dataset.copyLabel || "القيمة");
      }
    });
  }

  async function init() {
    bindEvents();
    try {
      await loadAdminSession();
      await loadConfig();
      await loadResults();
    } catch (error) {
      window.location.href = error.redirectTo || loginPath();
    }
  }

  init();
})();
