const siteConfig = {
  storeUrl: "https://advproai.com",
  supportWhatsapp: "966556915980",
  supportWhatsappMessage: "السلام عليكم أبغى الاشتراك في Advanced Pro",
};

const appConfig = {
  apiBaseUrl:
    window.AdvancedProConfig?.apiBaseUrl || "",
};

const THEME_STORAGE_KEY = "advancedpro-theme";
const THEME_MEDIA_QUERY = "(prefers-color-scheme: dark)";

function getStoredTheme() {
  try {
    const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    return savedTheme === "dark" || savedTheme === "light" ? savedTheme : "";
  } catch (error) {
    return "";
  }
}

function getSystemTheme() {
  return window.matchMedia && window.matchMedia(THEME_MEDIA_QUERY).matches ? "dark" : "light";
}

function setDocumentTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

function getThemeToggleIcon(theme) {
  if (theme === "dark") {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="currentColor"
          d="M12 4.1a1 1 0 0 1 1 1v1.6a1 1 0 1 1-2 0V5.1a1 1 0 0 1 1-1m0 12.2a1 1 0 0 1 1 1v1.6a1 1 0 1 1-2 0v-1.6a1 1 0 0 1 1-1m7.9-5.1a1 1 0 0 1 0 2h-1.6a1 1 0 1 1 0-2zm-14.2 0a1 1 0 1 1 0 2H4.1a1 1 0 1 1 0-2zm9.02-4.9a1 1 0 0 1 1.42 0l1.13 1.13a1 1 0 1 1-1.42 1.42l-1.13-1.13a1 1 0 0 1 0-1.42m-7.32 7.32a1 1 0 0 1 1.42 0a1 1 0 0 1 0 1.42l-1.13 1.13a1 1 0 1 1-1.42-1.42zm10.87 1.42a1 1 0 0 1 1.42 0l1.13 1.13a1 1 0 1 1-1.42 1.42l-1.13-1.13a1 1 0 0 1 0-1.42m-10.87-8.74a1 1 0 0 1 0 1.42L6.36 8.87a1 1 0 1 1-1.42-1.42l1.13-1.13a1 1 0 0 1 1.42 0M12 8a4 4 0 1 1 0 8a4 4 0 0 1 0-8"
        />
      </svg>
    `;
  }

  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M14.8 3.3c.4 0 .73.27.84.65a8.2 8.2 0 0 0 4.04 4.9c.3.17.47.5.43.84a8.77 8.77 0 1 1-10.8-6.75a.9.9 0 0 1 1.06.94a5.98 5.98 0 0 0 7.14 5.86a.9.9 0 0 1 .74 1.53a7 7 0 1 1-8.6-5.53a7.83 7.83 0 0 0 5.02 5.3a7.77 7.77 0 0 0 3.1.19a9.9 9.9 0 0 1-3.95-5.76a.9.9 0 0 1 .88-1.17"
      />
    </svg>
  `;
}

function renderThemeToggle(button, theme) {
  const label = theme === "dark" ? "تفعيل الوضع الشمسي" : "تفعيل الوضع الليلي";
  button.innerHTML = getThemeToggleIcon(theme);
  button.setAttribute("aria-label", label);
  button.setAttribute("title", label);
  button.dataset.mode = theme;
}

function applyTheme(theme, persist = false) {
  const resolvedTheme = theme || getStoredTheme() || getSystemTheme();
  setDocumentTheme(resolvedTheme);

  if (persist) {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, resolvedTheme);
    } catch (error) {
      // Ignore storage failures and keep the theme applied for this session.
    }
  }

  const toggle = document.querySelector("[data-theme-toggle]");

  if (toggle) {
    renderThemeToggle(toggle, resolvedTheme);
  }
}

function createThemeToggle() {
  if (document.querySelector("[data-theme-toggle]")) {
    return;
  }

  let toggleHost = document.querySelector(".header-theme");

  if (!toggleHost) {
    const headerInner = document.querySelector(".header-inner");

    if (headerInner) {
      toggleHost = document.createElement("div");
      toggleHost.className = "header-theme";
      headerInner.prepend(toggleHost);
    }
  }

  if (!toggleHost) {
    const adminToolbar = document.querySelector(".admin-toolbar");

    if (adminToolbar) {
      toggleHost = document.createElement("div");
      toggleHost.className = "header-actions header-actions--theme";
      adminToolbar.appendChild(toggleHost);
    }
  }

  if (!toggleHost) {
    toggleHost = document.createElement("div");
    toggleHost.className = "floating-theme-toggle";
    document.body.appendChild(toggleHost);
  }

  if (!toggleHost) {
    return;
  }

  const button = document.createElement("button");
  button.type = "button";
  button.className = "theme-toggle";
  button.setAttribute("data-theme-toggle", "");
  button.addEventListener("click", () => {
    const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(nextTheme, true);
  });

  toggleHost.prepend(button);
  renderThemeToggle(button, document.documentElement.dataset.theme || getSystemTheme());
}

function createScrollTopButton() {
  const existingButton = document.querySelector("[data-scroll-top]");

  const button = existingButton || document.createElement("button");

  if (!existingButton) {
    button.type = "button";
    button.className = "scroll-top-btn";
    button.setAttribute("data-scroll-top", "");
    button.setAttribute("aria-label", "العودة للأعلى");
    button.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="currentColor"
          d="M12 20a1 1 0 0 1-1-1V8.4l-3.7 3.7a1 1 0 1 1-1.4-1.4l5.4-5.4a1 1 0 0 1 1.4 0l5.4 5.4a1 1 0 1 1-1.4 1.4L13 8.4V19a1 1 0 0 1-1 1"
        />
      </svg>
    `;
  }

  if (button.dataset.bound !== "true") {
    button.dataset.bound = "true";
    button.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  const getScrollTop = () =>
    window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;

  const toggleVisibility = () => {
    const threshold = Math.max(120, window.innerHeight * 0.12);
    const shouldShow = getScrollTop() > threshold;
    button.classList.toggle("is-visible", shouldShow);
  };

  toggleVisibility();
  window.addEventListener("scroll", toggleVisibility, { passive: true });
  document.addEventListener("scroll", toggleVisibility, { passive: true });
  window.setTimeout(toggleVisibility, 300);

  if (!existingButton) {
    document.body.appendChild(button);
  }
}

function setupLogoutFallback() {
  if (document.body.dataset.logoutFallbackBound === "true") {
    return;
  }

  document.body.dataset.logoutFallbackBound = "true";

  document.addEventListener("click", (event) => {
    if (event.defaultPrevented) {
      return;
    }

    const trigger = event.target.closest("[data-logout]");
    if (!trigger) {
      return;
    }

    event.preventDefault();

    if (typeof window.performLogout === "function") {
      window.performLogout();
      return;
    }

    try {
      window.localStorage.setItem("advancedpro_force_logout", "1");
      window.localStorage.removeItem("advancedpro_token");
      window.sessionStorage.removeItem("advancedpro_token");
    } catch (error) {
      // ignore
    }

    try {
      document.cookie = "advancedpro_token=; Path=/; Max-Age=0; SameSite=Lax";
      document.cookie = "advancedpro_token=; Path=/; Max-Age=0; SameSite=None; Secure";
      document.cookie = "token=; Path=/; Max-Age=0; SameSite=Lax";
      document.cookie = "token=; Path=/; Max-Age=0; SameSite=None; Secure";
    } catch (error) {
      // ignore
    }

    const isAdmin =
      document.body.dataset.requiresAdmin === "true" ||
      String(document.body.dataset.page || "").startsWith("admin");
    window.location.href = isAdmin ? "/login" : "/";
  });
}

setDocumentTheme(getStoredTheme() || getSystemTheme());

async function loadSiteConfig() {
  try {
    const response = await fetch(`${appConfig.apiBaseUrl}/api/public/settings`, {
      credentials: "omit",
    });

    if (!response.ok) {
      return;
    }

    const payload = await response.json();

    if (payload.settings) {
      siteConfig.storeUrl = payload.settings.storeUrl || siteConfig.storeUrl;
      siteConfig.supportWhatsapp =
        payload.settings.supportWhatsapp || siteConfig.supportWhatsapp;
      siteConfig.supportWhatsappMessage =
        payload.settings.supportWhatsappMessage || siteConfig.supportWhatsappMessage;
    }
  } catch (error) {
    return;
  }
}

function buildWhatsAppLink(plan) {
  const message = plan
    ? `السلام عليكم أبغى باقة ${plan}`
    : siteConfig.supportWhatsappMessage;

  return `https://wa.me/${siteConfig.supportWhatsapp}?text=${encodeURIComponent(message)}`;
}

function createWhatsAppButton() {
  const existingButton = document.querySelector(".whatsapp-float");

  if (existingButton) {
    existingButton.href = buildWhatsAppLink();
    return existingButton;
  }

  const button = document.createElement("a");
  button.className = "whatsapp-float";
  button.href = buildWhatsAppLink();
  button.target = "_blank";
  button.rel = "noreferrer";
  button.setAttribute("aria-label", "تواصل عبر واتساب");
  button.dataset.label = "تواصل معنا";
  button.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 2.8a9.2 9.2 0 0 0-7.86 14l-1 4.4l4.5-1A9.2 9.2 0 1 0 12 2.8m0 16.73a7.5 7.5 0 0 1-3.82-1.04l-.27-.16l-2.67.59l.58-2.6l-.17-.27A7.54 7.54 0 1 1 12 19.53m4.13-5.64c-.23-.12-1.35-.67-1.56-.74c-.2-.08-.35-.12-.5.11c-.14.22-.57.73-.69.88c-.13.15-.26.17-.49.06c-.23-.12-.96-.35-1.83-1.12c-.68-.61-1.14-1.37-1.28-1.6c-.13-.23-.01-.35.1-.46c.11-.11.23-.27.35-.4c.12-.14.15-.23.23-.38c.08-.15.04-.28-.02-.4c-.06-.12-.5-1.23-.69-1.68c-.18-.44-.37-.38-.5-.38h-.43c-.14 0-.38.05-.58.28c-.2.23-.76.74-.76 1.8c0 1.05.77 2.08.88 2.22c.11.14 1.5 2.29 3.63 3.2c2.14.92 2.14.61 2.53.57c.39-.04 1.35-.55 1.54-1.09c.19-.54.19-1 .13-1.09c-.06-.09-.21-.14-.44-.26"
      ></path>
    </svg>
  `;

  document.body.appendChild(button);
  return button;
}

function createPurchaseModal() {
  const modal = document.createElement("div");
  modal.className = "purchase-modal";
  modal.hidden = true;
  modal.innerHTML = `
    <div class="purchase-modal__backdrop" data-modal-close></div>
    <div class="purchase-modal__card" role="dialog" aria-modal="true" aria-labelledby="purchaseTitle">
      <div class="purchase-modal__top">
        <div>
          <span class="section-kicker">الاشتراك</span>
          <h3 id="purchaseTitle">اختر طريقة الاشتراك</h3>
          <p>يمكنك الشراء مباشرة من المتجر أو التواصل معنا عبر واتساب.</p>
        </div>
        <button class="purchase-modal__close" type="button" aria-label="إغلاق" data-modal-close>
          ×
        </button>
      </div>
      <div class="purchase-modal__selected" data-selected-plan>اختر الباقة المناسبة لك.</div>
      <div class="purchase-modal__actions">
        <a
          class="purchase-modal__action purchase-modal__action--store"
          href="${siteConfig.storeUrl}"
          target="_blank"
          rel="noreferrer"
          data-store-link
        >
          <strong>الذهاب إلى المتجر</strong>
          <span>أكمل الاشتراك مباشرة عبر متجر Advanced Pro.</span>
        </a>
        <a
          class="purchase-modal__action purchase-modal__action--whatsapp"
          href="${buildWhatsAppLink()}"
          target="_blank"
          rel="noreferrer"
          data-whatsapp-link
        >
          <strong>مراسلة واتساب</strong>
          <span>افتح محادثة مباشرة معنا والرسالة جاهزة حسب الباقة.</span>
        </a>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  return modal;
}

function createSiteFooter() {
  if (document.querySelector("[data-site-footer]") || document.body.dataset.skipSiteFooter === "true") {
    return;
  }

  const currentYear = new Date().getFullYear();

  const footer = document.createElement("footer");
  footer.className = "site-footer";
  footer.innerHTML = `
    <div class="container">
      <div class="footer-card" data-site-footer>
        <h3>Advanced Pro Nano</h3>
        <p>
          منصة ذكية لإنشاء الصور والمقاطع عبر الباقات والأكواد، مع تحكم واضح في الرصيد والصلاحية
          وسهولة في الاستخدام.
        </p>
        <div class="footer-links">
          <a href="/">الرئيسية</a>
          <a href="/pricing">الباقات</a>
          <a href="/how-it-works">كيف تعمل</a>
          <a href="/activate">التفعيل</a>
          <a href="/legal">قوانين المنصة</a>
          <a href="/terms">الشروط والأحكام</a>
          <a href="/privacy">سياسة الخصوصية</a>
          <a href="/site-policy">سياسة الموقع</a>
          <a href="/refund-policy">سياسة الاسترجاع والاستبدال</a>
          <a href="/about">من نحن</a>
          <a href="/contact">تواصل معنا</a>
          <a href="/login">تسجيل الدخول</a>
        </div>
        <div class="footer-meta">
          <span>Advanced Pro Nano</span>
          <span>AI Media Platform</span>
          <span><a href="${siteConfig.storeUrl}" target="_blank" rel="noreferrer">المتجر</a></span>
          <span><a href="${buildWhatsAppLink()}" target="_blank" rel="noreferrer">الدعم</a></span>
        </div>
        <div class="footer-copy">جميع الحقوق محفوظة © Advanced Pro Nano ${currentYear}</div>
      </div>
    </div>
  `;

  document.body.appendChild(footer);
}

function setupPurchaseModal() {
  const triggers = document.querySelectorAll("[data-purchase-plan]");

  if (!triggers.length) {
    return;
  }

  const modal = createPurchaseModal();
  const selectedPlan = modal.querySelector("[data-selected-plan]");
  const whatsappLink = modal.querySelector("[data-whatsapp-link]");
  const storeLink = modal.querySelector("[data-store-link]");

  const closeModal = () => {
    modal.hidden = true;
    document.body.classList.remove("modal-open");
  };

  const openModal = (plan) => {
    selectedPlan.textContent = plan
      ? `الباقة المحددة: ${plan}`
      : "يمكنك اختيار المتجر أو واتساب.";
    whatsappLink.href = buildWhatsAppLink(plan);
    storeLink.href = siteConfig.storeUrl;
    modal.hidden = false;
    document.body.classList.add("modal-open");
  };

  triggers.forEach((trigger) => {
    trigger.addEventListener("click", (event) => {
      event.preventDefault();
      openModal(trigger.dataset.purchasePlan);
    });
  });

  modal.querySelectorAll("[data-modal-close]").forEach((element) => {
    element.addEventListener("click", closeModal);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.hidden) {
      closeModal();
    }
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  const isAdminExperience =
    document.body.dataset.requiresAdmin === "true" ||
    document.body.dataset.page?.startsWith("admin");

  setupLogoutFallback();
  createWhatsAppButton();
  await loadSiteConfig();
  createThemeToggle();
  applyTheme(document.documentElement.dataset.theme || getStoredTheme() || getSystemTheme());
  createWhatsAppButton();

  const isHome = document.body.dataset.page === "home";

  if (!isAdminExperience && isHome) {
    createScrollTopButton();
  }

  if (!isAdminExperience) {
    setupPurchaseModal();
    createSiteFooter();
  }

  const systemTheme = window.matchMedia ? window.matchMedia(THEME_MEDIA_QUERY) : null;

  if (systemTheme) {
    const handleThemeChange = (event) => {
      if (!getStoredTheme()) {
        applyTheme(event.matches ? "dark" : "light");
      }
    };

    if (typeof systemTheme.addEventListener === "function") {
      systemTheme.addEventListener("change", handleThemeChange);
    } else if (typeof systemTheme.addListener === "function") {
      systemTheme.addListener(handleThemeChange);
    }
  }
});
