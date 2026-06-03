(function () {
  const API_BASE_URL = window.AdvancedProConfig?.apiBaseUrl || "";
  const outlet = document.querySelector("#neoPageOutlet");
  const state = {
    key: null,
    route: normalizeRoute(window.location.pathname),
    type: "image",
    quality: "high",
    duration: 5,
    style: "realistic",
    aspect: "16:9",
    loading: false,
    results: [
      {
        id: "sample-1",
        type: "image",
        prompt: "رجل أعمال وسيم يرتدي بدلة داخل مكتب حديث",
        quality: "high",
        creditsUsed: 20,
        createdAt: "2026-06-03",
        favorite: true,
        resultUrl:
          "https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=900&q=80",
      },
      {
        id: "sample-2",
        type: "image",
        prompt: "سيارة مستقبلية في شارع مضاء",
        quality: "high",
        creditsUsed: 20,
        createdAt: "2026-06-02",
        favorite: false,
        resultUrl:
          "https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=900&q=80",
      },
      {
        id: "sample-3",
        type: "image",
        prompt: "واجهة منزل حديثة بإضاءة مسائية",
        quality: "normal",
        creditsUsed: 10,
        createdAt: "2026-06-01",
        favorite: false,
        resultUrl:
          "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=900&q=80",
      },
      {
        id: "sample-4",
        type: "image",
        prompt: "شخصية أنمي بجودة عالية",
        quality: "ultra",
        creditsUsed: 40,
        createdAt: "2026-05-30",
        favorite: true,
        resultUrl:
          "https://images.unsplash.com/photo-1635805737707-575885ab0820?auto=format&fit=crop&w=900&q=80",
      },
    ],
  };

  const routes = {
    "/dashboard": {
      title: "الرئيسية",
      description: "ملخص سريع لرصيدك ومفتاحك وآخر نتائجك.",
      icon: "⌂",
      render: renderHome,
    },
    "/create": {
      title: "إنشاء جديد",
      description: "اكتب وصفك واختر الإعدادات المناسبة وابدأ الإبداع.",
      icon: "✦",
      render: renderCreate,
    },
    "/results": {
      title: "نتائجك",
      description: "كل الصور والفيديوهات التي أنشأتها في مكان واحد.",
      icon: "▧",
      render: () => renderResults({ onlyFavorites: false }),
    },
    "/projects": {
      title: "مشاريعي",
      description: "نظّم نتائجك داخل مشاريع ومجلدات واضحة.",
      icon: "□",
      render: renderProjects,
    },
    "/favorites": {
      title: "المفضلة",
      description: "العناصر التي حفظتها للرجوع إليها بسرعة.",
      icon: "♡",
      render: () => renderResults({ onlyFavorites: true }),
    },
    "/models": {
      title: "الموديلات",
      description: "اختر مستوى الجودة المناسب حسب السرعة والتكلفة.",
      icon: "◇",
      render: renderModels,
    },
    "/billing": {
      title: "الاشتراك والفواتير",
      description: "إدارة رصيدك وباقتك وسجل العمليات.",
      icon: "▣",
      render: renderBilling,
    },
    "/support": {
      title: "الدعم والمساعدة",
      description: "إجابات سريعة وتذاكر دعم عند الحاجة.",
      icon: "☊",
      render: renderSupport,
    },
    "/settings": {
      title: "الإعدادات",
      description: "تحكم بتجربة الحساب والإعدادات الافتراضية.",
      icon: "⚙",
      render: renderSettings,
    },
  };

  function normalizeRoute(pathname) {
    if (pathname === "/" || pathname === "/dashboard.html") return "/dashboard";
    return routes[pathname] ? pathname : "/dashboard";
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatNumber(value) {
    return new Intl.NumberFormat("ar-SA").format(Number(value || 0));
  }

  function formatDate(value) {
    if (!value) return "--";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "--";
    return date.toLocaleDateString("ar-SA", { year: "numeric", month: "2-digit", day: "2-digit" });
  }

  async function requestJson(path, options = {}) {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      credentials: "include",
      cache: "no-store",
      ...options,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        ...(options.headers || {}),
      },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.message || "تعذر تنفيذ الطلب.");
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  function remainingImages() {
    const key = state.key || {};
    return Number(key.imagesRemaining ?? Math.max(0, Number(key.imagesLimit || 0) - Number(key.imagesUsed || 0)));
  }

  function remainingVideos() {
    const key = state.key || {};
    return Number(key.videosRemaining ?? Math.max(0, Number(key.videosLimit || 0) - Number(key.videosUsed || 0)));
  }

  function totalCredits() {
    const key = state.key || {};
    return Number(key.creditsRemaining || key.balance || remainingImages() * 10 + remainingVideos() * 50 || 2450);
  }

  function calculateCredits() {
    if (state.type === "image") {
      return { normal: 10, high: 20, ultra: 40 }[state.quality] || 20;
    }
    const base = { 5: 50, 8: 80 }[state.duration] || 50;
    const multiplier = { normal: 1, high: 3, ultra: 5 }[state.quality] || 3;
    return base * multiplier;
  }

  function updateShellData() {
    const key = state.key || {};
    const credit = totalCredits();
    document.querySelectorAll("[data-total-credit], [data-total-credit-side]").forEach((el) => {
      el.textContent = formatNumber(credit);
    });
    const progress = document.querySelector("[data-credit-progress]");
    if (progress) progress.style.width = `${Math.max(10, Math.min(100, Math.round((credit / 3000) * 100)))}%`;
    setText("[data-key-code]", key.codeMasked || key.code || "APRO-XXXX-XXXX-XXXX");
    setText("[data-key-expires]", formatDate(key.expiresAt) || "2026-05-25");
    setText("[data-customer-name]", `مرحبًا، ${key.customerName || "محمد"}`);
    setText("[data-key-status-text]", key.status === "active" ? "عضو نشط" : "عضو نشط");
  }

  function setText(selector, value) {
    const element = document.querySelector(selector);
    if (element) element.textContent = value;
  }

  function pageHeader(route) {
    return `
      <div class="neo-page-header">
        <div>
          <h1>${escapeHtml(route.title)}</h1>
          <p>${escapeHtml(route.description)}</p>
        </div>
        <span>${route.icon}</span>
      </div>
    `;
  }

  function renderPage() {
    const route = routes[state.route] || routes["/dashboard"];
    document.title = `${route.title} | Advanced Pro`;
    document.querySelectorAll(".neo-user-nav a").forEach((link) => {
      link.classList.toggle("is-active", link.dataset.route === state.route);
    });
    outlet.innerHTML = `${pageHeader(route)}${route.render()}`;
    bindPageEvents();
  }

  function renderHome() {
    return `
      <section class="neo-page-stack">
        <div class="neo-alert-card">
          <strong>مفتاحك نشط وجاهز للاستخدام</strong>
          <span>رصيد الصور: ${formatNumber(remainingImages())} | رصيد الفيديو: ${formatNumber(remainingVideos())}</span>
          <a href="/create" data-spa-link>إنشاء جديد</a>
        </div>
        <div class="neo-stat-grid">
          ${statCard("رصيدك الحالي", formatNumber(totalCredits()), "رصيد متاح", "▣")}
          ${statCard("المفتاح النشط", state.key?.codeMasked || "APRO-XXXX-XXXX-XXXX", "جاهز للتوليد", "⌘")}
          ${statCard("استخدام هذا الشهر", "72%", "نشاط جيد", "◌")}
        </div>
        <section class="neo-panel">
          <div class="neo-section-head">
            <h2>آخر 4 نتائج</h2>
            <a href="/results" data-spa-link>عرض الكل</a>
          </div>
          ${resultsGrid(state.results.slice(0, 4))}
        </section>
      </section>
    `;
  }

  function statCard(title, value, desc, icon) {
    return `
      <article class="neo-stat-card">
        <span>${icon}</span>
        <small>${escapeHtml(title)}</small>
        <strong>${escapeHtml(value)}</strong>
        <em>${escapeHtml(desc)}</em>
      </article>
    `;
  }

  function renderCreate() {
    return `
      <section class="neo-create-layout">
        <form class="neo-create-card" data-generate-form>
          <div class="neo-type-tabs" role="tablist" aria-label="نوع التوليد">
            <button type="button" data-type="image" class="${state.type === "image" ? "is-active" : ""}">صورة ▧</button>
            <button type="button" data-type="video" class="${state.type === "video" ? "is-active" : ""}">فيديو ▦</button>
          </div>

          <label class="neo-prompt-field">
            <span>${state.type === "image" ? "اكتب وصف الصورة" : "اكتب وصف الفيديو"}</span>
            <textarea data-prompt maxlength="2000" placeholder="مثال: رجل أعمال وسيم يرتدي بدلة فاخرة داخل مكتب حديث، إضاءة سينمائية"></textarea>
            <small><b data-prompt-count>0</b> / 2000</small>
          </label>

          <div class="neo-control-grid">
            ${chipGroup("الجودة", "quality", [
              ["normal", "عادية"],
              ["high", "عالية"],
              ["ultra", "فائقة"],
            ], state.quality)}
            ${chipGroup("النمط", "style", [
              ["realistic", "واقعي"],
              ["cinematic", "سينمائي"],
              ["anime", "أنمي"],
              ["3d", "ثلاثي الأبعاد"],
              ["commercial", "إعلاني"],
            ], state.style)}
            ${
              state.type === "image"
                ? chipGroup("المقاس", "aspect", [
                    ["1:1", "1:1"],
                    ["16:9", "16:9"],
                    ["4:5", "4:5"],
                    ["9:16", "9:16"],
                  ], state.aspect)
                : chipGroup("مدة الفيديو", "duration", [
                    ["5", "5 ثواني"],
                    ["8", "8 ثواني"],
                  ], String(state.duration))
            }
          </div>

          <div class="neo-cost-line">
            <span>التكلفة المتوقعة: <b data-cost>${formatNumber(calculateCredits())}</b> رصيد</span>
            <small>سيتم خصمها عند نجاح التوليد فقط</small>
          </div>

          <button class="neo-submit-button" type="submit" data-submit-generate>
            إنشاء الآن ✨
          </button>
          <p class="neo-form-message" data-form-message hidden></p>
        </form>

        <section class="neo-result-live" data-live-result>
          <div class="neo-empty-result">
            <span>✦</span>
            <strong>ستظهر نتيجتك هنا</strong>
            <p>بعد اكتمال التوليد ستظهر المعاينة وأزرار التحميل والنسخ.</p>
          </div>
        </section>
      </section>
    `;
  }

  function chipGroup(title, name, items, active) {
    return `
      <div class="neo-control">
        <strong>${escapeHtml(title)}</strong>
        <div class="neo-chip-group" data-chip-group="${name}">
          ${items
            .map(
              ([value, label]) => `
                <button type="button" data-value="${escapeHtml(value)}" class="${String(value) === String(active) ? "is-active" : ""}">
                  ${escapeHtml(label)}
                </button>
              `
            )
            .join("")}
        </div>
      </div>
    `;
  }

  function renderResults({ onlyFavorites }) {
    const items = onlyFavorites ? state.results.filter((item) => item.favorite) : state.results;
    const empty = onlyFavorites
      ? "لم تقم بإضافة أي نتيجة للمفضلة بعد."
      : "لم تنشئ أي محتوى بعد. ابدأ الآن بإنشاء أول صورة أو فيديو.";
    return `
      <section class="neo-panel">
        <div class="neo-toolbar">
          <input type="search" placeholder="بحث بالوصف..." data-result-search />
          <select data-result-filter>
            <option value="all">الكل</option>
            <option value="image">صور</option>
            <option value="video">فيديو</option>
          </select>
          <select data-result-sort>
            <option value="new">الأحدث</option>
            <option value="old">الأقدم</option>
          </select>
        </div>
        ${items.length ? resultsGrid(items) : emptyState(empty, "✦", "/create", "إنشاء الآن")}
      </section>
    `;
  }

  function resultsGrid(items) {
    return `
      <div class="neo-results-grid" data-results-grid>
        ${items
          .map(
            (item) => `
              <article class="neo-result-card" data-result-id="${escapeHtml(item.id)}">
                ${
                  item.type === "video"
                    ? `<video src="${escapeHtml(item.resultUrl)}" controls playsinline></video>`
                    : `<img src="${escapeHtml(item.resultUrl)}" alt="${escapeHtml(item.prompt)}" />`
                }
                <div>
                  <span>${item.type === "video" ? "فيديو" : "صورة"}</span>
                  <strong>${escapeHtml(item.prompt)}</strong>
                  <small>${formatDate(item.createdAt)} · ${escapeHtml(item.quality)} · ${formatNumber(item.creditsUsed)} رصيد</small>
                </div>
                <div class="neo-result-actions">
                  <a href="${escapeHtml(item.resultUrl)}" target="_blank" rel="noreferrer">تحميل</a>
                  <button type="button" data-copy-result="${escapeHtml(item.resultUrl)}">نسخ</button>
                  <button type="button" data-regenerate="${escapeHtml(item.id)}">إعادة</button>
                  <button type="button">تحسين</button>
                  <button type="button" data-favorite="${escapeHtml(item.id)}">${item.favorite ? "★" : "☆"}</button>
                  <button type="button" data-delete-result="${escapeHtml(item.id)}">حذف</button>
                </div>
              </article>
            `
          )
          .join("")}
      </div>
    `;
  }

  function renderProjects() {
    const projects = [
      ["حملة رمضان", 8, "منذ ساعة"],
      ["صور المنتجات", 14, "أمس"],
      ["إعلانات الفيديو", 5, "منذ أسبوع"],
    ];
    return `
      <section class="neo-panel">
        <div class="neo-section-head">
          <h2>مشاريعك</h2>
          <button type="button">مشروع جديد ＋</button>
        </div>
        <div class="neo-project-grid">
          ${projects.map(([name, count, updated]) => `
            <article class="neo-project-card">
              <div></div>
              <strong>${name}</strong>
              <span>${count} عنصر</span>
              <small>آخر تحديث: ${updated}</small>
            </article>
          `).join("")}
        </div>
      </section>
    `;
  }

  function renderModels() {
    return `
      <section class="neo-model-grid">
        ${modelCard("عادي", "سريع واقتصادي", "سرعة عالية", "جودة جيدة", "10 رصيد للصورة")}
        ${modelCard("عالي", "توازن بين الجودة والسعر", "سرعة متوسطة", "جودة عالية", "20 رصيد للصورة")}
        ${modelCard("فائق", "أعلى جودة للصور والفيديوهات", "أبطأ قليلًا", "جودة فائقة", "40 رصيد للصورة")}
      </section>
    `;
  }

  function modelCard(name, desc, speed, quality, cost) {
    return `
      <article class="neo-card neo-model-card">
        <span>◇</span>
        <h2>${name}</h2>
        <p>${desc}</p>
        <ul>
          <li>${speed}</li>
          <li>${quality}</li>
          <li>${cost}</li>
        </ul>
      </article>
    `;
  }

  function renderBilling() {
    return `
      <section class="neo-page-stack">
        <div class="neo-stat-grid">
          ${statCard("الباقة الحالية", state.key?.planName || "Pro", "نشطة", "◇")}
          ${statCard("الرصيد المتبقي", formatNumber(totalCredits()), "رصيد", "▣")}
          ${statCard("تاريخ انتهاء المفتاح", formatDate(state.key?.expiresAt) || "--", "صلاحية المفتاح", "◷")}
        </div>
        <section class="neo-panel">
          <div class="neo-section-head">
            <h2>سجل العمليات</h2>
            <button type="button">شحن الرصيد</button>
          </div>
          <div class="neo-table">
            <div><b>التاريخ</b><b>النوع</b><b>الرصيد</b><b>السبب</b></div>
            <div><span>2026/06/03</span><span>خصم</span><span>-20</span><span>إنشاء صورة</span></div>
            <div><span>2026/06/02</span><span>إضافة</span><span>+500</span><span>تفعيل مفتاح</span></div>
          </div>
        </section>
      </section>
    `;
  }

  function renderSupport() {
    return `
      <section class="neo-support-grid">
        <article class="neo-panel">
          <h2>أسئلة شائعة</h2>
          <details open><summary>متى يتم خصم الرصيد؟</summary><p>يتم الخصم فقط بعد نجاح التوليد.</p></details>
          <details><summary>هل أستطيع إعادة إنشاء نتيجة؟</summary><p>نعم من صفحة نتائجك.</p></details>
          <a class="neo-gradient-button" href="https://wa.me/" target="_blank" rel="noreferrer">تواصل واتساب</a>
        </article>
        <form class="neo-panel">
          <h2>فتح تذكرة</h2>
          <input placeholder="العنوان" />
          <select><option>نوع المشكلة</option><option>رصيد</option><option>توليد</option></select>
          <textarea placeholder="اكتب رسالتك"></textarea>
          <input type="file" />
          <button class="neo-submit-button" type="button">إرسال التذكرة</button>
        </form>
      </section>
    `;
  }

  function renderSettings() {
    return `
      <section class="neo-settings-grid">
        <form class="neo-panel">
          <h2>الملف الشخصي</h2>
          <input placeholder="الاسم" value="${escapeHtml(state.key?.customerName || "")}" />
          <input placeholder="البريد" value="${escapeHtml(state.key?.customerEmail || "")}" />
          <button class="neo-submit-button" type="button">حفظ</button>
        </form>
        <form class="neo-panel">
          <h2>إعدادات التوليد الافتراضية</h2>
          <select><option>جودة عالية</option><option>عادية</option><option>فائقة</option></select>
          <select><option>واقعي</option><option>سينمائي</option><option>إعلاني</option></select>
          <select><option>عربي</option><option>English</option></select>
          <button class="neo-submit-button" type="button">تحديث الإعدادات</button>
        </form>
      </section>
    `;
  }

  function emptyState(text, icon, href, action) {
    return `
      <div class="neo-empty-state">
        <span>${icon}</span>
        <strong>${text}</strong>
        ${href ? `<a href="${href}" data-spa-link>${action}</a>` : ""}
      </div>
    `;
  }

  function bindPageEvents() {
    outlet.querySelectorAll("[data-type]").forEach((button) => {
      button.addEventListener("click", () => {
        state.type = button.dataset.type || "image";
        renderPage();
      });
    });

    outlet.querySelectorAll("[data-chip-group]").forEach((group) => {
      group.addEventListener("click", (event) => {
        const button = event.target.closest("button[data-value]");
        if (!button) return;
        const name = group.dataset.chipGroup;
        const value = button.dataset.value;
        if (name === "duration") state.duration = Number(value);
        else state[name] = value;
        renderPage();
      });
    });

    const prompt = outlet.querySelector("[data-prompt]");
    prompt?.addEventListener("input", () => {
      const count = outlet.querySelector("[data-prompt-count]");
      if (count) count.textContent = prompt.value.length;
    });

    outlet.querySelector("[data-generate-form]")?.addEventListener("submit", handleGenerate);

    outlet.querySelectorAll("[data-copy-result]").forEach((button) => {
      button.addEventListener("click", async () => {
        await navigator.clipboard.writeText(button.dataset.copyResult || "");
        toast("تم نسخ الرابط بنجاح");
      });
    });

    outlet.querySelectorAll("[data-favorite]").forEach((button) => {
      button.addEventListener("click", () => {
        const item = state.results.find((result) => result.id === button.dataset.favorite);
        if (item) item.favorite = !item.favorite;
        renderPage();
      });
    });

    outlet.querySelectorAll("[data-delete-result]").forEach((button) => {
      button.addEventListener("click", () => {
        state.results = state.results.filter((result) => result.id !== button.dataset.deleteResult);
        renderPage();
      });
    });
  }

  async function handleGenerate(event) {
    event.preventDefault();
    if (state.loading) return;

    const form = event.currentTarget;
    const prompt = String(form.querySelector("[data-prompt]")?.value || "").trim();
    const message = form.querySelector("[data-form-message]");
    if (!prompt || prompt.length < 3) {
      showMessage(message, "اكتب وصفًا واضحًا أولًا", "error");
      return;
    }

    if (state.type === "image" && remainingImages() <= 0) {
      showMessage(message, "لا يوجد رصيد صور كافٍ", "error");
      return;
    }

    if (state.type === "video" && remainingVideos() <= 0) {
      showMessage(message, "لا يوجد رصيد فيديو كافٍ", "error");
      return;
    }

    state.loading = true;
    form.querySelector("[data-submit-generate]").disabled = true;
    form.querySelector("[data-submit-generate]").innerHTML =
      state.type === "video" ? "جاري إنشاء الفيديو..." : "جاري إنشاء الصورة...";
    renderLiveLoading(prompt);

    try {
      const requestId = crypto.randomUUID?.() || `req-${Date.now()}`;
      const payload = await requestJson("/api/generate", {
        method: "POST",
        body: JSON.stringify({
          type: state.type,
          prompt,
          requestId,
          quality: state.quality,
          style: state.style,
          aspect: state.aspect,
          duration: state.type === "video" ? state.duration : undefined,
        }),
      });
      const resultUrl = payload.resultUrl || payload.url || "";
      const generationId = payload.generationId || `local-${Date.now()}`;
      const item = {
        id: generationId,
        type: state.type,
        prompt,
        quality: state.quality,
        creditsUsed: payload.creditsUsed || calculateCredits(),
        createdAt: new Date().toISOString(),
        favorite: false,
        resultUrl: resultUrl || state.results[0]?.resultUrl,
      };
      state.results.unshift(item);
      showMessage(message, "تم الإنشاء بنجاح", "success");
      renderLiveResult(item);
      await refreshKey();
    } catch (error) {
      showMessage(message, error.message || "فشل التوليد، لم يتم خصم أي رصيد.", "error");
      renderLiveFailure(error.message || "فشل التوليد، لم يتم خصم أي رصيد.");
    } finally {
      state.loading = false;
      const submitButton = form.querySelector("[data-submit-generate]");
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.innerHTML = "إنشاء الآن ✨";
      }
    }
  }

  function renderLiveLoading(prompt) {
    const target = outlet.querySelector("[data-live-result]");
    if (!target) return;
    target.innerHTML = `
      <div class="neo-processing-card">
        <div class="neo-spinner"></div>
        <strong>${state.type === "video" ? "جاري إنشاء الفيديو" : "جاري إنشاء الصورة"}</strong>
        <p>جاري معالجة طلبك: ${escapeHtml(prompt)}</p>
      </div>
    `;
  }

  function renderLiveResult(item) {
    const target = outlet.querySelector("[data-live-result]");
    if (!target) return;
    target.innerHTML = `
      <article class="neo-live-result-card">
        <strong>تم الإنشاء بنجاح</strong>
        ${item.type === "video"
          ? `<video src="${escapeHtml(item.resultUrl)}" controls playsinline></video>`
          : `<img src="${escapeHtml(item.resultUrl)}" alt="${escapeHtml(item.prompt)}" />`}
        <div class="neo-result-actions">
          <a href="${escapeHtml(item.resultUrl)}" target="_blank" rel="noreferrer">تحميل</a>
          <button type="button" data-copy-result="${escapeHtml(item.resultUrl)}">نسخ الرابط</button>
          <a href="/results" data-spa-link>عرض النتائج</a>
        </div>
      </article>
    `;
  }

  function renderLiveFailure(text) {
    const target = outlet.querySelector("[data-live-result]");
    if (!target) return;
    target.innerHTML = `
      <div class="neo-empty-result is-error">
        <span>!</span>
        <strong>${escapeHtml(text)}</strong>
        <p>لم يتم خصم أي رصيد من حسابك.</p>
      </div>
    `;
  }

  function showMessage(element, text, type) {
    if (!element) return;
    element.hidden = false;
    element.textContent = text;
    element.dataset.type = type;
  }

  async function refreshKey() {
    try {
      state.key = await requestJson("/api/me/key");
      updateShellData();
    } catch (error) {
      if (error.status === 401) {
        window.location.href = "/activate";
        return;
      }
      state.key = {
        status: "active",
        codeMasked: "APRO-XXXX-XXXX-XXXX",
        customerName: "محمد",
        imagesLimit: 600,
        imagesUsed: 0,
        imagesRemaining: 600,
        videosLimit: 200,
        videosUsed: 0,
        videosRemaining: 200,
        balance: 2450,
        expiresAt: "2026-10-11",
      };
      updateShellData();
    }
  }

  function toast(text) {
    const toastEl = document.createElement("div");
    toastEl.className = "neo-toast";
    toastEl.textContent = text;
    document.body.appendChild(toastEl);
    setTimeout(() => toastEl.remove(), 2200);
  }

  function navigate(path) {
    state.route = normalizeRoute(path);
    window.history.pushState({}, "", state.route);
    renderPage();
  }

  document.addEventListener("click", (event) => {
    const spaLink = event.target.closest("a[data-spa-link], .neo-user-nav a");
    if (!spaLink) return;
    const url = new URL(spaLink.href);
    if (!routes[normalizeRoute(url.pathname)]) return;
    event.preventDefault();
    navigate(url.pathname);
  });

  document.querySelector("[data-sidebar-toggle]")?.addEventListener("click", () => {
    document.body.classList.add("neo-sidebar-open");
  });
  document.querySelector("[data-sidebar-close]")?.addEventListener("click", () => {
    document.body.classList.remove("neo-sidebar-open");
  });

  window.addEventListener("popstate", () => {
    state.route = normalizeRoute(window.location.pathname);
    renderPage();
  });

  refreshKey().then(renderPage);
})();
