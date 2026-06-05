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
    xpCost: 12,
    endpoint: "https://api.wavespeed.ai/api/v3/bytedance/seedream-v4.5",
  },
  ultra: {
    provider: "wavespeed",
    model: "google/nano-banana-pro",
    xpCost: 35,
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
    xpPerSecond: 25,
    minXp: 120,
    endpoint: "https://api.wavespeed.ai/api/v3/wavespeed-ai/wan-2.2-animate/text-to-video",
  },
  ultra: {
    provider: "wavespeed",
    model: "kwaivgi/kling-v3.0-std/text-to-video",
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
