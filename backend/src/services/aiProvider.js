const KEY_ALIASES = {
  gemini: [
    "GEMINI_API_KEY",
    "GOOGLE_API_KEY",
    "GOOGLE_GENERATIVE_AI_API_KEY",
    "GENAI_API_KEY",
  ],
  image: [
    "GEMINI_IMAGE_API_KEY",
    "IMAGEN_API_KEY",
    "GOOGLE_IMAGE_API_KEY",
    "GOOGLE_IMAGEN_API_KEY",
    "GEMINI_API_KEY",
    "GOOGLE_API_KEY",
    "GOOGLE_GENERATIVE_AI_API_KEY",
    "GENAI_API_KEY",
  ],
  video: [
    "VEO_API_KEY",
    "GOOGLE_VEO_API_KEY",
    "GEMINI_VIDEO_API_KEY",
    "GEMINI_API_KEY",
    "GOOGLE_API_KEY",
    "GOOGLE_GENERATIVE_AI_API_KEY",
    "GENAI_API_KEY",
  ],
};

const warnedFeatures = new Set();
const GEMINI_IMAGE_MODEL =
  process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image-preview";

function isPlaceholder(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return (
    !normalized ||
    normalized.includes("your-api-key") ||
    normalized.includes("your_key") ||
    normalized.includes("replace-me") ||
    normalized.includes("changeme") ||
    normalized === "test" ||
    normalized === "placeholder"
  );
}

function resolveKey(aliasNames) {
  for (const envName of aliasNames) {
    const value = process.env[envName];
    if (value && !isPlaceholder(value)) {
      return {
        envName,
        value: String(value).trim(),
      };
    }
  }

  return null;
}

function requireKey(resolved, label, aliasNames) {
  if (!resolved) {
    const error = new Error(
      `مفتاح ${label} غير مضبوط في الخادم. أضف أحد المتغيرات التالية: ${aliasNames.join(" أو ")}`
    );
    error.statusCode = 500;
    error.code = "AI_KEY_MISSING";
    throw error;
  }

  return resolved;
}

function getKeyFor(feature, { required = true } = {}) {
  const aliasNames = KEY_ALIASES[feature] || [];
  const resolved = resolveKey(aliasNames);

  if (!required) {
    if (!resolved && !warnedFeatures.has(feature)) {
      warnedFeatures.add(feature);
      console.warn(
        `[advancedpro] ${featureLabel(feature)} key missing. Falling back to mock mode. Accepted env vars: ${aliasNames.join(
          ", "
        )}`
      );
    }
    return resolved;
  }

  return requireKey(resolved, featureLabel(feature), aliasNames);
}

function featureLabel(feature) {
  if (feature === "gemini") {
    return "Gemini";
  }

  if (feature === "image") {
    return "Imagen/Gemini Image";
  }

  if (feature === "video") {
    return "Veo";
  }

  return feature;
}

export function getAiKeyStatus() {
  return {
    gemini: resolveKey(KEY_ALIASES.gemini)?.envName || "mock",
    image: resolveKey(KEY_ALIASES.image)?.envName || "mock",
    video: resolveKey(KEY_ALIASES.video)?.envName || "mock",
  };
}

function buildMockImageDataUrl(prompt) {
  const title = String(prompt || "صورة تجريبية").trim().slice(0, 140) || "صورة تجريبية";
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#2f80ff" />
          <stop offset="100%" stop-color="#d958c7" />
        </linearGradient>
      </defs>
      <rect width="1280" height="720" fill="url(#bg)" rx="36" />
      <rect x="60" y="60" width="1160" height="600" rx="32" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.28)" />
      <text x="640" y="250" text-anchor="middle" fill="#ffffff" font-size="42" font-family="Arial, sans-serif" font-weight="700">
        Advanced Pro - Mock Image
      </text>
      <text x="640" y="340" text-anchor="middle" fill="#ffffff" font-size="28" font-family="Arial, sans-serif">
        ${String(title)
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")}
      </text>
      <text x="640" y="430" text-anchor="middle" fill="#eef4ff" font-size="22" font-family="Arial, sans-serif">
        أضف GOOGLE_API_KEY أو GEMINI_API_KEY لتفعيل التوليد الحقيقي
      </text>
    </svg>
  `.trim();

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function extractInlineImagePart(payload) {
  const candidates = Array.isArray(payload?.candidates) ? payload.candidates : [];

  for (const candidate of candidates) {
    const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
    for (const part of parts) {
      const inlineData = part?.inlineData || part?.inline_data || null;
      const data = inlineData?.data || null;
      const mimeType = inlineData?.mimeType || inlineData?.mime_type || "image/png";
      if (data) {
        return {
          data,
          mimeType,
        };
      }
    }
  }

  return null;
}

function extractTextParts(payload) {
  const candidates = Array.isArray(payload?.candidates) ? payload.candidates : [];
  const texts = [];

  for (const candidate of candidates) {
    const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
    for (const part of parts) {
      if (part?.text) {
        texts.push(String(part.text));
      }
    }
  }

  return texts.filter(Boolean);
}

export async function generateText({ prompt }) {
  getKeyFor("gemini", { required: false });

  return {
    text: `تم استلام الطلب: ${prompt}`,
  };
}

export async function generateImage({ prompt }) {
  const resolved = getKeyFor("image", { required: false });

  if (resolved) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        GEMINI_IMAGE_MODEL
      )}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": resolved.value,
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: String(prompt || "").trim(),
                },
              ],
            },
          ],
        }),
      }
    );

    let payload = {};
    try {
      payload = await response.json();
    } catch (error) {
      payload = {};
    }

    if (!response.ok) {
      const error = new Error(
        payload?.error?.message ||
          payload?.message ||
          "فشل الاتصال بخدمة Gemini Image."
      );
      error.statusCode = response.status;
      throw error;
    }

    const imagePart = extractInlineImagePart(payload);
    if (!imagePart?.data) {
      const providerText = extractTextParts(payload).join(" ");
      throw new Error(
        providerText || "لم ترجع خدمة Gemini Image صورة فعلية لهذا الطلب."
      );
    }

    return {
      resultUrl: `data:${imagePart.mimeType};base64,${imagePart.data}`,
      prompt,
      providerMode: "configured",
      model: GEMINI_IMAGE_MODEL,
    };
  }

  return {
    resultUrl: buildMockImageDataUrl(prompt),
    prompt,
    providerMode: "mock",
  };
}

export async function generateVideo({ prompt }) {
  const resolved = getKeyFor("video", { required: false });

  return {
    resultUrl: null,
    prompt,
    providerMode: resolved ? "configured" : "mock",
  };
}
