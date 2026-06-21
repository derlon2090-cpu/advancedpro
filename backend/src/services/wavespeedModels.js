export const IMAGE_MODELS = {
  normal: {
    provider: "wavespeed",
    model: "wavespeed-ai/z-image/turbo",
    xpCost: 5,
    endpoint: "https://api.wavespeed.ai/api/v3/wavespeed-ai/z-image/turbo",
  },
  high: {
    provider: "wavespeed",
    model: "bytedance/seedream-v4.5",
    xpCost: 10,
    endpoint: "https://api.wavespeed.ai/api/v3/bytedance/seedream-v4.5",
  },
  ultra: {
    provider: "wavespeed",
    model: "google/nano-banana-pro",
    xpCost: 20,
    endpoint: "https://api.wavespeed.ai/api/v3/google/nano-banana-pro/text-to-image",
  },
};

export const VIDEO_MODELS = {
  normal: {
    provider: "wavespeed",
    model: "wavespeed-ai/wan-2.2/t2v-480p-ultra-fast",
    xpPerSecond: 10,
    minXp: 50,
    endpoint: "https://api.wavespeed.ai/api/v3/wavespeed-ai/wan-2.2/t2v-480p-ultra-fast",
  },
  high: {
    provider: "wavespeed",
    model: "wavespeed-ai/wan-2.2-animate/text-to-video",
    xpPerSecond: 20,
    minXp: 100,
    endpoint: "https://api.wavespeed.ai/api/v3/wavespeed-ai/wan-2.2-animate/text-to-video",
  },
  ultra: {
    provider: "wavespeed",
    model: "kwaivgi/kling-v3.0-std/text-to-video",
    xpPerSecond: 40,
    minXp: 200,
    endpoint: "https://api.wavespeed.ai/api/v3/kwaivgi/kling-v3.0-std/text-to-video",
  },
};

export const USER_FACING_MODEL_NAMES = {
  image: {
    normal: "وميض",
    high: "رؤية",
    ultra: "إتقان برو",
  },
  video: {
    normal: "وميض موشن",
    high: "رؤية موشن",
    ultra: "إتقان موشن",
  },
};

const RAW_MODEL_NAME_PATTERNS = [
  ["wavespeed-ai/z-image/turbo", USER_FACING_MODEL_NAMES.image.normal],
  ["wavespeed-ai/z-image-turbo", USER_FACING_MODEL_NAMES.image.normal],
  ["bytedance/seedream-v4.5", USER_FACING_MODEL_NAMES.image.high],
  ["bytedance/seedream-4.5", USER_FACING_MODEL_NAMES.image.high],
  ["google/nano-banana-pro", USER_FACING_MODEL_NAMES.image.ultra],
  ["google/nano-banana/pro", USER_FACING_MODEL_NAMES.image.ultra],
  ["wavespeed-ai/wan-2.2/t2v-480p-ultra-fast", USER_FACING_MODEL_NAMES.video.normal],
  ["wan-2.2/t2v-480p-ultra-fast", USER_FACING_MODEL_NAMES.video.normal],
  ["wavespeed-ai/wan-2.2-animate/text-to-video", USER_FACING_MODEL_NAMES.video.high],
  ["wavespeed-ai/wan-2.7/text-to-video", USER_FACING_MODEL_NAMES.video.high],
  ["wan-2.2-animate", USER_FACING_MODEL_NAMES.video.high],
  ["wan-2.7", USER_FACING_MODEL_NAMES.video.high],
  ["kwaivgi/kling-v3.0-std/text-to-video", USER_FACING_MODEL_NAMES.video.ultra],
  ["kling-v3.0-std", USER_FACING_MODEL_NAMES.video.ultra],
];

export function resolveUserFacingModelName(model, { type = "image", quality = "high" } = {}) {
  const raw = String(model || "").trim().toLowerCase();
  if (raw) {
    const matched = RAW_MODEL_NAME_PATTERNS.find(([pattern]) => raw.includes(pattern));
    if (matched) {
      return matched[1];
    }
  }

  const group = USER_FACING_MODEL_NAMES[type] || USER_FACING_MODEL_NAMES.image;
  return group[quality] || group.high || USER_FACING_MODEL_NAMES.image.high;
}

export const VIDEO_DURATIONS = [5, 8];

export const MAX_VIDEO_DURATION_BY_QUALITY = {
  normal: 8,
  high: 8,
  ultra: 8,
};

export const ALLOWED_NATIVE_DURATIONS_BY_MODEL = {
  "wan-2.2/t2v-480p-ultra-fast": [5, 8],
  "wan-2.2-ultra-fast": [5, 8],
  "wan-2.2-animate": [5, 8],
  infinitetalk: [5, 8],
  "kling-v3.0-std": [5, 8],
  "kling-3.0-std": [5, 8],
  "wan-2.7": [5, 8],
  "seedance-2.0-fast": [5, 8],
  "veo-3.1-fast": [5, 8],
};

export const WAVE_IMAGE_MODEL_CANDIDATES = {
  normal: [
    {
      model: "wavespeed-ai/z-image/turbo",
      endpoint: "https://api.wavespeed.ai/api/v3/wavespeed-ai/z-image/turbo",
    },
    {
      model: "wavespeed-ai/z-image-turbo",
      endpoint: "https://api.wavespeed.ai/api/v3/wavespeed-ai/z-image-turbo/text-to-image",
    },
  ],
  high: [
    {
      model: "bytedance/seedream-v4.5",
      endpoint: "https://api.wavespeed.ai/api/v3/bytedance/seedream-v4.5",
    },
    {
      model: "bytedance/seedream-4.5",
      endpoint: "https://api.wavespeed.ai/api/v3/bytedance/seedream-4.5/text-to-image",
    },
  ],
  ultra: [
    {
      model: "google/nano-banana-pro",
      endpoint: "https://api.wavespeed.ai/api/v3/google/nano-banana-pro/text-to-image",
    },
    {
      model: "google/nano-banana/pro",
      endpoint: "https://api.wavespeed.ai/api/v3/google/nano-banana/pro",
    },
  ],
};

export const WAVE_VIDEO_MODEL_CANDIDATES = {
  normal: [
    {
      model: "wavespeed-ai/wan-2.2/t2v-480p-ultra-fast",
      endpoint: "https://api.wavespeed.ai/api/v3/wavespeed-ai/wan-2.2/t2v-480p-ultra-fast",
    },
  ],
  high: [
    {
      model: "wavespeed-ai/wan-2.2-animate/text-to-video",
      endpoint: "https://api.wavespeed.ai/api/v3/wavespeed-ai/wan-2.2-animate/text-to-video",
    },
    {
      model: "wavespeed-ai/wan-2.7/text-to-video",
      endpoint: "https://api.wavespeed.ai/api/v3/wavespeed-ai/wan-2.7/text-to-video",
    },
  ],
  ultra: [
    {
      model: "kwaivgi/kling-v3.0-std/text-to-video",
      endpoint: "https://api.wavespeed.ai/api/v3/kwaivgi/kling-v3.0-std/text-to-video",
    },
  ],
};

export const WAVE_IMAGE_MODELS = Object.fromEntries(
  Object.entries(IMAGE_MODELS).map(([quality, config]) => [quality, config.model])
);

export const WAVE_VIDEO_MODELS = Object.fromEntries(
  Object.entries(VIDEO_MODELS).map(([quality, config]) => [quality, config.model])
);

export const WAVE_IMAGE_ENDPOINTS = Object.fromEntries(
  Object.entries(IMAGE_MODELS).map(([quality, config]) => [quality, config.endpoint])
);

export const WAVE_VIDEO_ENDPOINTS = Object.fromEntries(
  Object.entries(VIDEO_MODELS).map(([quality, config]) => [quality, config.endpoint])
);
