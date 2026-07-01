(function () {
  if (document.querySelector("[data-pixi-assistant]")) return;

  const API_BASE_URL = window.AdvancedProConfig?.apiBaseUrl || "";
  const page = document.body?.dataset?.page || "";
  const isActivationPage = page === "activate-key-v2";
  const isDashboardPage = page === "dashboard-v4";
  const shouldStartVisible = isActivationPage;
  const history = [];
  const root = document.createElement("div");
  root.className = "pixi-assistant";
  if (isDashboardPage) {
    root.classList.add("is-dashboard-assistant");
  }
  root.dataset.pixiAssistant = "";
  root.innerHTML = `
    <section class="pixi-assistant__panel" data-assistant-panel hidden aria-label="مساعد PixiGenI">
      <header>
        <img src="/assets/pixigen-assistant-orb.svg" alt="" />
        <div><strong>إيسو</strong><span>ذكاء المنصة <i></i></span></div>
        <button type="button" data-assistant-close aria-label="إغلاق">×</button>
      </header>
      <div class="pixi-assistant__messages" data-assistant-messages>
        <article class="is-assistant"><img src="/assets/pixigen-assistant-orb.svg" alt="" /><p>مرحبًا، أنا إيسو. اسألني عن التفعيل، الرصيد، التوليد أو أقسام المنصة.</p></article>
      </div>
      <div class="pixi-assistant__quick">
        <button type="button" data-assistant-quick="كيف أفعّل مفتاحي؟">تفعيل المفتاح</button>
        <button type="button" data-assistant-quick="كيف يعمل رصيد XP؟">رصيد XP</button>
      </div>
      <form data-assistant-form>
        <input data-assistant-input maxlength="1200" placeholder="اكتب رسالتك هنا..." autocomplete="off" />
        <button type="submit" aria-label="إرسال">➤</button>
      </form>
      <small>لا تشارك كلمات المرور أو المفاتيح السرية.</small>
    </section>
    <button class="pixi-assistant__launcher" type="button" data-assistant-toggle aria-label="فتح المساعد">
      <img src="/assets/pixigen-assistant-orb.svg" alt="" />
    </button>
    <button class="pixi-assistant__collapse" type="button" data-assistant-collapse aria-label="إغلاق المساعد">⌄</button>
  `;
  document.body.appendChild(root);

  const panel = root.querySelector("[data-assistant-panel]");
  const input = root.querySelector("[data-assistant-input]");
  const messages = root.querySelector("[data-assistant-messages]");
  const submit = root.querySelector('form button[type="submit"]');
  const launcher = root.querySelector("[data-assistant-toggle]");
  const collapse = root.querySelector("[data-assistant-collapse]");
  const closeButton = root.querySelector("[data-assistant-close]");
  const manualOpenTriggers = Array.from(document.querySelectorAll("[data-assistant-open]"));
  const shouldStartHidden = manualOpenTriggers.length > 0 && !isActivationPage && !isDashboardPage;
  const contactLink = isDashboardPage
    ? document.querySelector(".udv3-support-card a")
    : null;

  function setOpen(open) {
    panel.hidden = !open;
    root.classList.toggle("is-open", open);
  }

  function setLauncherVisible(visible) {
    root.classList.toggle("is-hidden", !visible);
  }

  function closeAssistant() {
    setOpen(false);
    if (isDashboardPage || shouldStartHidden) {
      setLauncherVisible(false);
    }
  }

  function openAssistant() {
    setLauncherVisible(true);
    setOpen(true);
    window.setTimeout(() => {
      input.focus({ preventScroll: true });
    }, 80);
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function appendMessage(role, content) {
    const article = document.createElement("article");
    article.className = role === "assistant" ? "is-assistant" : "is-user";
    article.innerHTML = role === "assistant"
      ? `<img src="/assets/pixigen-assistant-orb.svg" alt="" /><p>${escapeHtml(content)}</p>`
      : `<p>${escapeHtml(content)}</p>`;
    messages.appendChild(article);
    messages.scrollTop = messages.scrollHeight;
  }

  async function sendMessage(value) {
    const message = String(value || "").trim();
    if (message.length < 2 || submit.disabled) return;
    appendMessage("user", message);
    input.value = "";
    submit.disabled = true;
    const pending = document.createElement("article");
    pending.className = "is-assistant is-pending";
    pending.innerHTML = `<img src="/assets/pixigen-assistant-orb.svg" alt="" /><p>أفكر في أفضل إجابة...</p>`;
    messages.appendChild(pending);
    messages.scrollTop = messages.scrollHeight;

    try {
      const response = await fetch(`${API_BASE_URL}/api/public/assistant/chat`, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ message, history }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "تعذر الحصول على رد الآن.");
      const answer = data.answer || "تعذر الحصول على رد الآن.";
      pending.remove();
      appendMessage("assistant", answer);
      history.push({ role: "user", content: message }, { role: "assistant", content: answer });
      if (history.length > 8) history.splice(0, history.length - 8);
    } catch (error) {
      pending.remove();
      appendMessage("assistant", error.message || "تعذر الحصول على رد الآن. حاول بعد قليل.");
    } finally {
      submit.disabled = false;
    }
  }

  launcher.addEventListener("click", () => setOpen(panel.hidden));
  closeButton.addEventListener("click", closeAssistant);
  collapse.addEventListener("click", closeAssistant);
  root.querySelectorAll("[data-assistant-quick]").forEach((button) => {
    button.addEventListener("click", () => sendMessage(button.dataset.assistantQuick));
  });
  root.querySelector("[data-assistant-form]").addEventListener("submit", (event) => {
    event.preventDefault();
    sendMessage(input.value);
  });

  function consumeAssistantIntent() {
    let intent = null;
    try {
      const raw = sessionStorage.getItem("pixigen:assistant-intent");
      if (raw) {
        intent = JSON.parse(raw);
        sessionStorage.removeItem("pixigen:assistant-intent");
      }
    } catch {
      intent = null;
    }

    const message = String(intent?.message || "").trim();
    if (message.length < 2) return;

    setLauncherVisible(true);
    setOpen(true);
    input.value = message.slice(0, 1200);
    window.setTimeout(() => {
      sendMessage(input.value);
    }, 250);
  }

  if (contactLink) {
    setLauncherVisible(false);
    contactLink.addEventListener("click", (event) => {
      event.preventDefault();
      openAssistant();
    });
  } else {
    setLauncherVisible(shouldStartVisible || (!isDashboardPage && !shouldStartHidden));
  }

  manualOpenTriggers.forEach((trigger) => {
    trigger.addEventListener("click", (event) => {
      event.preventDefault();
      openAssistant();
    });
  });

  consumeAssistantIntent();
})();
