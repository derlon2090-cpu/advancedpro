const IMAGE_CREDIT_COST = {
  normal: 5,
  high: 12,
  ultra: 35,
};

const VIDEO_XP_PER_SECOND = {
  normal: 10,
  high: 25,
  ultra: 60,
};

const VIDEO_MINIMUM_XP = {
  normal: 50,
  high: 120,
  ultra: 250,
};

export const SUPPORTED_VIDEO_DURATIONS = [5, 8, 10, 15, 20, 30, 45, 60, 90, 100];

export const MAX_VIDEO_DURATION_BY_QUALITY = {
  normal: 100,
  high: 60,
  ultra: 30,
};

const QUALITY_ALIASES = {
  normal: "normal",
  "\u0639\u0627\u062f\u064a\u0629": "normal",
  high: "high",
  "\u0639\u0627\u0644\u064a\u0629": "high",
  ultra: "ultra",
  "\u0641\u0627\u0626\u0642\u0629": "ultra",
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
  const error = new Error("مدة الفيديو غير مدعومة. اختر مدة من الخيارات المتاحة.");
  error.statusCode = 400;
  throw error;
}

export function assertDurationAllowedForQuality(qualityValue, durationValue) {
  const quality = normalizeQuality(qualityValue);
  const duration = normalizeDuration(durationValue);
  const maxDuration = MAX_VIDEO_DURATION_BY_QUALITY[quality] || MAX_VIDEO_DURATION_BY_QUALITY.normal;

  if (duration > maxDuration) {
    const error = new Error("هذه المدة غير متاحة للجودة المختارة. اختر جودة أقل أو مدة أقصر.");
    error.statusCode = 400;
    throw error;
  }

  return duration;
}

export function calculateImageXp(qualityValue = "normal") {
  const quality = normalizeQuality(qualityValue);
  return IMAGE_CREDIT_COST[quality];
}

export function calculateVideoXp(qualityValue = "normal", durationValue = 5) {
  const quality = normalizeQuality(qualityValue);
  const duration = assertDurationAllowedForQuality(quality, durationValue);
  return Math.max(VIDEO_MINIMUM_XP[quality], duration * VIDEO_XP_PER_SECOND[quality]);
}

export function calculateRequiredCredits(typeValue, qualityValue = "normal", durationValue = 5) {
  const type = normalizeGenerationType(typeValue);
  const quality = normalizeQuality(qualityValue);

  if (type === "image") {
    return calculateImageXp(quality);
  }

  return calculateVideoXp(quality, durationValue);
}

export function calculateCredits(typeValue, qualityValue = "normal", durationValue = 5) {
  return calculateRequiredCredits(typeValue, qualityValue, durationValue);
}

export function calculateDefaultKeyCredits({ imageLimit = 0, videoLimit = 0 } = {}) {
  const images = Math.max(Number(imageLimit || 0), 0);
  const videos = Math.max(Number(videoLimit || 0), 0);
  return images * IMAGE_CREDIT_COST.ultra + videos * calculateCredits("video", "ultra", 30);
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
  VIDEO_XP_PER_SECOND,
  VIDEO_MINIMUM_XP,
  MAX_VIDEO_DURATION_BY_QUALITY,
};
