const siteConfig = {
  storeUrl: "https://advproai.com",
  supportWhatsapp: "966556915980",
  supportWhatsappMessage: "السلام عليكم أبغى الاشتراك في Advanced Pro",
};

const appConfig = {
  apiBaseUrl: window.AdvancedProConfig?.apiBaseUrl || "/backend",
};

async function loadSiteConfig() {
  try {
    const response = await fetch(`${appConfig.apiBaseUrl}/api/public/settings`, {
      credentials: "same-origin",
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
  if (document.querySelector(".whatsapp-float")) {
    return;
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
  await loadSiteConfig();
  createWhatsAppButton();
  setupPurchaseModal();
});
