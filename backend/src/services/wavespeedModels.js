export const IMAGE_MODELS = {
  normal: {
    provider: "wavespeed",
    model: "z-image-turbo",
    xpCost: 5,
    endpoint: "https://api.wavespeed.ai/api/v3/wavespeed-ai/z-image-turbo/text-to-image",
  },
  high: {
    provider: "wavespeed",
    model: "seedream-4.5",
    xpCost: 12,
    endpoint: "https://api.wavespeed.ai/api/v3/bytedance/seedream-v4.5",
  },
  ultra: {
    provider: "wavespeed",
    model: "nano-banana-pro",
    xpCost: 35,
    endpoint: "https://api.wavespeed.ai/api/v3/google/nano-banana-pro/text-to-image",
  },
};

export const VIDEO_MODELS = {
  normal: {
    provider: "wavespeed",
    model: "wan-2.2-ultra-fast",
    xpPerSecond: 10,
    minXp: 50,
    endpoint: "https://api.wavespeed.ai/api/v3/wavespeed-ai/wan-2.2/t2v-480p-ultra-fast",
  },
  high: {
    provider: "wavespeed",
    model: "wan-2.2-animate",
    xpPerSecond: 25,
    minXp: 120,
    endpoint: "https://api.wavespeed.ai/api/v3/wavespeed-ai/wan-2.2-animate/text-to-video",
  },
  ultra: {
    provider: "wavespeed",
    model: "kling-3.0-std",
    xpPerSecond: 60,
    minXp: 250,
    endpoint: "https://api.wavespeed.ai/api/v3/kwaivgi/kling-v3.0-std/text-to-video",
  },
};

export const VIDEO_DURATIONS = [5, 8, 10, 15, 20, 30, 45, 60, 90, 100];

export const MAX_VIDEO_DURATION_BY_QUALITY = {
  normal: 100,
  high: 60,
  ultra: 30,
};

export const ALLOWED_NATIVE_DURATIONS_BY_MODEL = {
  "wan-2.2-ultra-fast": [5, 8],
  "wan-2.2-animate": [5, 8],
  infinitetalk: [5, 8],
  "kling-3.0-std": [5, 8],
  "wan-2.7": [5, 8],
  "seedance-2.0-fast": [5, 8],
  "veo-3.1-fast": [5, 8],
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
