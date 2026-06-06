(function () {
  const API_BASE_URL = window.AdvancedProConfig?.apiBaseUrl || "";
  const $ = (selector) => document.querySelector(selector);
  const nf = new Intl.NumberFormat("en-US");
  let searchTimer = null;

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function loginPath() {
    const configured = String(window.AdvancedProConfig?.adminSecretPath || "advanced-pro-control")
      .replace(/^\/+|\/+$/g, "");
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
      const error = new Error(payload.message || "تعذر تحميل بيانات التشخيص.");
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

  function statusLabel(status) {
    return {
      completed: "مكتمل",
      failed: "فشل",
      processing: "قيد المعالجة",
      queued: "في الانتظار",
    }[status] || status || "غير محدد";
  }

  function showToast(message, kind = "success") {
    const toast = $("[data-prompt-debug-toast]");
    toast.textContent = message;
    toast.dataset.kind = kind;
    toast.hidden = false;
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => {
      toast.hidden = true;
    }, 3200);
  }

  async function copyText(value, label) {
    if (!value) {
      showToast("لا توجد قيمة لنسخها.", "error");
      return;
    }
    await navigator.clipboard.writeText(value);
    showToast(`تم نسخ ${label}.`);
  }

  function renderStats(summary = {}) {
    const stats = [
      ["العمليات المكتملة", summary.completed || 0, "✓"],
      ["العمليات الفاشلة", summary.failed || 0, "×"],
      ["قيد المعالجة", summary.processing || 0, "◷"],
      ["في الانتظار", summary.queued || 0, "…"],
    ];

    $("[data-prompt-debug-stats]").innerHTML = stats
      .map(
        ([label, value, icon]) => `
          <article>
            <span>${icon}</span>
            <div>
              <small>${label}</small>
              <strong>${nf.format(value)}</strong>
            </div>
          </article>
        `
      )
      .join("");
  }

  function renderGeneration(item) {
    const preview = item.resultUrl
      ? item.type === "video"
        ? `<video src="${escapeHtml(item.resultUrl)}" controls preload="metadata"></video>`
        : `<img src="${escapeHtml(item.resultUrl)}" alt="" loading="lazy" />`
      : `<div class="admin-prompt-debug-no-result">لا توجد نتيجة محفوظة</div>`;

    return `
      <article class="admin-prompt-debug-card">
        <header>
          <div>
            <span class="admin-prompt-debug-status admin-prompt-debug-status--${escapeHtml(item.status)}">
              ${escapeHtml(statusLabel(item.status))}
            </span>
            <strong>#${escapeHtml(item.id)}</strong>
            <small>${escapeHtml(formatDate(item.createdAt))}</small>
          </div>
          <div class="admin-prompt-debug-meta">
            <span>${escapeHtml(item.type === "video" ? "فيديو" : "صورة")}</span>
            <span>${escapeHtml(item.quality || "غير محدد")}</span>
            <span>${escapeHtml(item.model || "موديل غير مسجل")}</span>
          </div>
        </header>

        <div class="admin-prompt-debug-grid">
          <section>
            <div class="admin-prompt-debug-field">
              <div>
                <b>USER_PROMPT</b>
                <button type="button" data-copy-value="${escapeHtml(item.userPrompt)}" data-copy-label="وصف المستخدم">نسخ</button>
              </div>
              <p dir="auto">${escapeHtml(item.userPrompt || "لا يوجد وصف مستخدم محفوظ.")}</p>
            </div>

            <div class="admin-prompt-debug-field admin-prompt-debug-field--final">
              <div>
                <b>FINAL_PROMPT</b>
                <button type="button" data-copy-value="${escapeHtml(item.finalPrompt)}" data-copy-label="البرومبت النهائي">نسخ</button>
              </div>
              <pre>${escapeHtml(item.finalPrompt || "لا يوجد برومبت نهائي محفوظ.")}</pre>
            </div>

            ${item.errorMessage ? `<p class="admin-prompt-debug-error">${escapeHtml(item.errorMessage)}</p>` : ""}
          </section>

          <aside>
            <div class="admin-prompt-debug-preview">${preview}</div>
            <dl>
              <div><dt>MODEL</dt><dd>${escapeHtml(item.model || "-")}</dd></div>
              <div><dt>SEED</dt><dd>${escapeHtml(item.seed || "-")}</dd></div>
              <div><dt>REQUEST ID</dt><dd>${escapeHtml(item.requestId || "-")}</dd></div>
              <div><dt>PROVIDER</dt><dd>${escapeHtml(item.provider || "-")}</dd></div>
              <div><dt>XP</dt><dd>${nf.format(item.creditsUsed || 0)}</dd></div>
            </dl>
            <button
              type="button"
              data-copy-value="${escapeHtml(item.resultUrl || "")}"
              data-copy-label="رابط النتيجة"
            >
              نسخ RESULT_URL
            </button>
          </aside>
        </div>
      </article>
    `;
  }

  function renderList(items) {
    const list = $("[data-prompt-debug-list]");
    if (!items.length) {
      list.innerHTML = `
        <div class="admin-v2-empty">
          لا توجد عمليات توليد مطابقة. جرّب تغيير البحث أو الحالة.
        </div>
      `;
      return;
    }
    list.innerHTML = items.map(renderGeneration).join("");
  }

  function queryString() {
    const params = new URLSearchParams({
      search: $("[data-prompt-debug-search]").value.trim(),
      status: $("[data-prompt-debug-status]").value,
      limit: $("[data-prompt-debug-limit]").value,
    });
    return params.toString();
  }

  async function loadAdminSession() {
    const payload = await requestJson("/api/admin/session");
    const profile = $("[data-admin-profile]");
    profile.querySelector("strong").textContent = payload.admin?.name || "مرحبًا";
    profile.querySelector("small").textContent = payload.admin?.role || "Admin";
    profile.querySelector(".admin-v2-avatar").textContent =
      String(payload.admin?.name || "A").trim().charAt(0).toUpperCase() || "A";
  }

  async function loadPromptDebug() {
    const list = $("[data-prompt-debug-list]");
    list.setAttribute("aria-busy", "true");
    try {
      const payload = await requestJson(`/api/admin/prompt-debug?${queryString()}`);
      renderStats(payload.summary);
      renderList(payload.generations || []);
      $("[data-prompt-debug-total]").textContent = `${nf.format(payload.total || 0)} عملية مطابقة`;
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        window.location.href = error.redirectTo || loginPath();
        return;
      }
      renderStats({});
      list.innerHTML = `<div class="admin-v2-empty admin-prompt-debug-load-error">${escapeHtml(error.message)}</div>`;
    } finally {
      list.removeAttribute("aria-busy");
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
    $("[data-prompt-debug-refresh]")?.addEventListener("click", loadPromptDebug);
    $("[data-prompt-debug-status]")?.addEventListener("change", loadPromptDebug);
    $("[data-prompt-debug-limit]")?.addEventListener("change", loadPromptDebug);
    $("[data-prompt-debug-search]")?.addEventListener("input", () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(loadPromptDebug, 350);
    });
    document.addEventListener("click", (event) => {
      const copyButton = event.target.closest("[data-copy-value]");
      if (!copyButton) return;
      copyText(copyButton.dataset.copyValue, copyButton.dataset.copyLabel || "القيمة");
    });
  }

  async function init() {
    bindEvents();
    try {
      await loadAdminSession();
      await loadPromptDebug();
    } catch (error) {
      window.location.href = error.redirectTo || loginPath();
    }
  }

  init();
})();
