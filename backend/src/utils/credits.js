const IMAGE_CREDIT_COST = {
  normal: 5,
  high: 10,
  ultra: 20,
};

const VIDEO_BASE_CREDIT_COST = {
  5: 50,
  8: 80,
};

const VIDEO_QUALITY_MULTIPLIER = {
  normal: 1,
  high: 2,
  ultra: 4,
};

export const SUPPORTED_VIDEO_DURATIONS = [5, 8];

const QUALITY_ALIASES = {
  normal: "normal",
  عادية: "normal",
  high: "high",
  عالية: "high",
  ultra: "ultra",
  فائقة: "ultra",
};

export function normalizeGenerationType(value) {
  const type = String(value || "").trim().toLowerCase();
  if (type === "image" || type === "video") {
    return type;
  }
  const error = new Error("نوع التوليد غير صالح.");
  error.statusCode = 400;
  throw error;
}

export function normalizeQuality(value) {
  const normalized = String(value || "normal").trim().toLowerCase();
  return QUALITY_ALIASES[normalized] || "normal";
}

export function normalizeDuration(value) {
  const duration = Number(value || 5);
  if (SUPPORTED_VIDEO_DURATIONS.includes(duration)) {
    return duration;
  }
  const error = new Error("مدة الفيديو غير مدعومة لهذا النموذج. اختر: 5 أو 8 ثواني.");
  error.statusCode = 400;
  throw error;
}

export function calculateRequiredCredits(typeValue, qualityValue = "normal", durationValue = 5) {
  const type = normalizeGenerationType(typeValue);
  const quality = normalizeQuality(qualityValue);

  if (type === "image") {
    return IMAGE_CREDIT_COST[quality];
  }

  const duration = normalizeDuration(durationValue);
  const base = VIDEO_BASE_CREDIT_COST[duration];
  const multiplier = VIDEO_QUALITY_MULTIPLIER[quality];
  return Math.ceil(base * multiplier);
}

export function calculateCredits(typeValue, qualityValue = "normal", durationValue = 5) {
  return calculateRequiredCredits(typeValue, qualityValue, durationValue);
}

export function calculateDefaultKeyCredits({ imageLimit = 0, videoLimit = 0 } = {}) {
  const images = Math.max(Number(imageLimit || 0), 0);
  const videos = Math.max(Number(videoLimit || 0), 0);

  // Give every image/video slot enough credits for the most expensive allowed option.
  return images * IMAGE_CREDIT_COST.ultra + videos * calculateCredits("video", "ultra", 8);
}

export function assertValidPrompt(prompt) {
  const normalized = String(prompt || "").trim();

  if (!normalized) {
    const error = new Error("اكتب وصفًا واضحًا قبل الإرسال.");
    error.statusCode = 400;
    throw error;
  }

  if (normalized.length < 8) {
    const error = new Error("الوصف قصير جدًا. اكتب وصفًا لا يقل عن 8 أحرف.");
    error.statusCode = 400;
    throw error;
  }

  return normalized;
}

export const CREDIT_RULES = {
  IMAGE_CREDIT_COST,
  VIDEO_BASE_CREDIT_COST,
  VIDEO_QUALITY_MULTIPLIER,
};
