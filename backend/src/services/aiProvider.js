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

function getKeyFor(feature) {
  const aliasNames = KEY_ALIASES[feature] || [];
  return requireKey(resolveKey(aliasNames), featureLabel(feature), aliasNames);
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
    gemini: resolveKey(KEY_ALIASES.gemini)?.envName || null,
    image: resolveKey(KEY_ALIASES.image)?.envName || null,
    video: resolveKey(KEY_ALIASES.video)?.envName || null,
  };
}

export async function generateText({ prompt }) {
  getKeyFor("gemini");

  return {
    text: `تم استلام الطلب: ${prompt}`,
  };
}

export async function generateImage({ prompt }) {
  getKeyFor("image");

  return {
    resultUrl: "https://example.com/image-result",
    prompt,
  };
}

export async function generateVideo({ prompt }) {
  getKeyFor("video");

  return {
    resultUrl: null,
    prompt,
  };
}
