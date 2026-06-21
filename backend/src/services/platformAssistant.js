const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";

function assistantError(message, statusCode = 500) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function cleanMessages(messages) {
  return (Array.isArray(messages) ? messages : [])
    .slice(-8)
    .map((message) => ({
      role: message?.role === "assistant" ? "assistant" : "user",
      content: String(message?.content || "").trim().slice(0, 1200),
    }))
    .filter((message) => message.content);
}

export async function answerPlatformQuestion({ message, history = [] }) {
  const apiKey = String(process.env.DEEPSEEK_API_KEY || "").trim();
  if (!apiKey) {
    throw assistantError("المساعد غير متاح مؤقتًا. يمكنك التواصل مع الدعم الفني.", 503);
  }

  const userMessage = String(message || "").trim().slice(0, 1200);
  if (userMessage.length < 2) {
    throw assistantError("اكتب سؤالك عن المنصة أولًا.", 400);
  }

  const model = String(process.env.DEEPSEEK_MODEL || "deepseek-chat").trim();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    const response = await fetch(DEEPSEEK_URL, {
      method: "POST",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 420,
        stream: false,
        messages: [
          {
            role: "system",
            content: [
              "أنت مساعد منصة PixiGenI.",
              "أجب بالعربية الواضحة والمختصرة عن تفعيل المفاتيح، رصيد XP، إنشاء الصور والفيديو، المشاريع، المفضلة، الباقات، المعاملات، والإعدادات فقط.",
              "لا تذكر اسم مزود الذكاء الاصطناعي أو أي مفاتيح API.",
              "إذا كان السؤال خارج المنصة، اعتذر واطلب من المستخدم سؤالًا متعلقًا بمنصة PixiGenI.",
              "لا تطلب كلمات مرور أو مفاتيح سرية أو بيانات دفع.",
            ].join(" "),
          },
          ...cleanMessages(history),
          { role: "user", content: userMessage },
        ],
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error("PLATFORM_ASSISTANT_ERROR:", response.status, payload?.error?.message || "unknown");
      throw assistantError("تعذر الحصول على رد الآن. حاول بعد قليل.", 502);
    }

    const answer = String(payload?.choices?.[0]?.message?.content || "").trim();
    if (!answer) {
      throw assistantError("تعذر الحصول على رد الآن. حاول بعد قليل.", 502);
    }

    return answer;
  } catch (error) {
    if (error?.statusCode) throw error;
    console.error("PLATFORM_ASSISTANT_ERROR:", error?.name || "error", error?.message || error);
    throw assistantError("تعذر الحصول على رد الآن. حاول بعد قليل.", 502);
  } finally {
    clearTimeout(timeout);
  }
}
