(function () {
  if (document.querySelector("[data-pixi-assistant]")) return;

  const API_BASE_URL = window.AdvancedProConfig?.apiBaseUrl || "";
  const history = [];
  const root = document.createElement("div");
  root.className = "pixi-assistant";
  root.dataset.pixiAssistant = "";
  root.innerHTML = `
    <section class="pixi-assistant__panel" data-assistant-panel hidden aria-label="مساعد PixiGenI">
      <header>
        <img src="/assets/pixigen-robot-avatar.svg" alt="" />
        <div><strong>إيسو</strong><span>ذكاء المنصة <i></i></span></div>
        <button type="button" data-assistant-close aria-label="إغلاق">×</button>
      </header>
      <div class="pixi-assistant__messages" data-assistant-messages>
        <article class="is-assistant"><img src="/assets/pixigen-robot-avatar.svg" alt="" /><p>مرحبًا، أنا إيسو. اسألني عن التفعيل، الرصيد، التوليد أو أقسام المنصة.</p></article>
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
      <img src="/assets/pixigen-robot-avatar.svg" alt="" />
    </button>
    <button class="pixi-assistant__collapse" type="button" data-assistant-collapse aria-label="إغلاق المساعد">⌄</button>
  `;
  document.body.appendChild(root);

  const panel = root.querySelector("[data-assistant-panel]");
  const input = root.querySelector("[data-assistant-input]");
  const messages = root.querySelector("[data-assistant-messages]");
  const submit = root.querySelector('form button[type="submit"]');

  function setOpen(open) {
    panel.hidden = !open;
    root.classList.toggle("is-open", open);
    if (open) setTimeout(() => input.focus(), 40);
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
      ? `<img src="/assets/pixigen-robot-avatar.svg" alt="" /><p>${escapeHtml(content)}</p>`
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
    pending.innerHTML = `<img src="/assets/pixigen-robot-avatar.svg" alt="" /><p>أفكر في أفضل إجابة...</p>`;
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
      input.focus();
    }
  }

  root.querySelector("[data-assistant-toggle]").addEventListener("click", () => setOpen(panel.hidden));
  root.querySelector("[data-assistant-close]").addEventListener("click", () => setOpen(false));
  root.querySelector("[data-assistant-collapse]").addEventListener("click", () => setOpen(false));
  root.querySelectorAll("[data-assistant-quick]").forEach((button) => {
    button.addEventListener("click", () => sendMessage(button.dataset.assistantQuick));
  });
  root.querySelector("[data-assistant-form]").addEventListener("submit", (event) => {
    event.preventDefault();
    sendMessage(input.value);
  });
})();
