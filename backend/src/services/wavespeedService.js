function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function serviceError(message, statusCode = 502) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function randomSeed() {
  return Math.floor(Math.random() * 1_000_000_000);
}

function compactForLog(value, maxLength = 500) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function requireApiKey() {
  const apiKey = String(process.env.WAVESPEED_API_KEY || "").trim();
  if (!apiKey) {
    throw serviceError(
      "مفتاح توليد الفيديو غير مضبوط في الخادم. أضف WAVESPEED_API_KEY في Render Environment Variables.",
      500
    );
  }
  return apiKey;
}

function isHttpUrl(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

function isLikelyVideoFileUrl(value) {
  if (!isHttpUrl(value)) return false;

  try {
    const parsed = new URL(value);
    const url = `${parsed.pathname}${parsed.search}`.toLowerCase();

    if (/(^|\/)(predictions?|tasks?|jobs?)(\/|$)/i.test(parsed.pathname)) {
      return false;
    }

    if (/poll|status|result\/?$|\/get\/?$/i.test(parsed.pathname)) {
      return false;
    }

    return /\.(mp4|webm|mov|m4v|m3u8)(\?|$)/i.test(url) || /video|output|cdn|storage|files?/i.test(value);
  } catch (error) {
    return false;
  }
}

function firstVideoUrlFrom(value) {
  if (!value) return null;

  if (isLikelyVideoFileUrl(value)) {
    return value;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstVideoUrlFrom(item);
      if (found) return found;
    }
    return null;
  }

  if (typeof value === "object") {
    for (const key of [
      "video_url",
      "videoUrl",
      "video",
      "videos",
      "output_url",
      "outputUrl",
      "resultUrl",
      "url",
      "file",
      "files",
      "outputs",
    ]) {
      const found = firstVideoUrlFrom(value[key]);
      if (found) return found;
    }

    for (const key of ["result", "output", "data"]) {
      const found = firstVideoUrlFrom(value[key]);
      if (found) return found;
    }
  }

  return null;
}

async function readJsonResponse(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch (error) {
    return { raw: text };
  }
}

function getWaveSpeedModelConfig(quality) {
  if (quality === "ultra") {
    return {
      endpoint: process.env.WAVESPEED_ULTRA_API_URL || process.env.WAVESPEED_API_URL,
      model: process.env.WAVESPEED_ULTRA_MODEL || "wavespeed-video-ultra",
    };
  }

  if (quality === "high") {
    return {
      endpoint: process.env.WAVESPEED_HIGH_API_URL || process.env.WAVESPEED_API_URL,
      model: process.env.WAVESPEED_HIGH_MODEL || "wavespeed-video-high",
    };
  }

  return {
    endpoint:
      process.env.WAVESPEED_NORMAL_API_URL ||
      process.env.WAVESPEED_FAST_API_URL ||
      process.env.WAVESPEED_API_URL,
    model: process.env.WAVESPEED_NORMAL_MODEL || "wavespeed-video-normal",
  };
}

const ALLOWED_DURATIONS_BY_MODEL = {
  "wan-2.2-ultra-fast": [5, 8],
  "wan-2.7": [5, 8],
  "veo-3.1-fast": [5, 8],
  "kling-3.0-std": [5, 8],
};

function allowedDurationsForModel(model, endpoint) {
  const haystack = `${model || ""} ${endpoint || ""}`.toLowerCase();
  const match = Object.entries(ALLOWED_DURATIONS_BY_MODEL).find(([name]) => haystack.includes(name));
  return match?.[1] || [5, 8];
}

function validateDuration(model, endpoint, duration) {
  const normalizedDuration = Number(duration || 5);
  const allowed = allowedDurationsForModel(model, endpoint);

  if (!allowed.includes(normalizedDuration)) {
    throw serviceError(`مدة الفيديو غير مدعومة لهذا النموذج. اختر: ${allowed.join(" أو ")} ثواني`, 400);
  }

  return normalizedDuration;
}

async function postToWaveSpeed({ apiKey, prompt, duration, quality, style }) {
  const config = getWaveSpeedModelConfig(quality);
  const endpoint =
    config.endpoint || "https://api.wavespeed.ai/api/v3/wavespeed-ai/wan-2.2/t2v-480p-ultra-fast";
  const safeDuration = validateDuration(config.model, endpoint, duration);
  const finalPrompt = style ? `${String(prompt || "").trim()}\nStyle: ${String(style || "").trim()}` : String(prompt || "").trim();
  const seed = randomSeed();
  const payload = {
    prompt: finalPrompt,
    duration: safeDuration,
    quality,
    seed,
  };

  console.log("MODEL:", config.model);
  console.log("PROMPT SENT:", prompt);
  console.log("FINAL PROMPT SENT TO API:", payload.prompt);
  console.log("SEED:", seed);
  console.log("API_BODY:", JSON.stringify({ ...payload, prompt: compactForLog(payload.prompt, 1400) }));

  const response = await fetch(endpoint, {
    method: "POST",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await readJsonResponse(response);
  if (!response.ok) {
    const message = data?.message || data?.error || data?.detail || "فشل طلب توليد الفيديو من WaveSpeed.";
    throw serviceError(typeof message === "string" ? message : JSON.stringify(message), response.status >= 500 ? 502 : 400);
  }

  return { data, model: config.model, finalPrompt: payload.prompt, seed };
}

async function pollWaveSpeedResult({ apiKey, initial }) {
  const immediateUrl = firstVideoUrlFrom(initial?.result || initial?.output || initial?.data || initial?.video);
  if (immediateUrl) return immediateUrl;

  const pollingUrl =
    initial?.polling_url ||
    initial?.pollingUrl ||
    initial?.urls?.get ||
    initial?.data?.urls?.get;
  const taskId =
    initial?.id ||
    initial?.task_id ||
    initial?.request_id ||
    initial?.data?.request_id ||
    initial?.data?.id ||
    initial?.data?.task_id;
  const resultEndpoint = process.env.WAVESPEED_RESULT_URL || "https://api.wavespeed.ai/api/v3/predictions";

  if (!pollingUrl && !taskId) {
    throw serviceError("لم يرجع مزود الفيديو رابط نتيجة أو رقم طلب.");
  }

  for (let attempt = 1; attempt <= Number(process.env.WAVESPEED_POLL_ATTEMPTS || 60); attempt += 1) {
    await wait(Number(process.env.WAVESPEED_POLL_INTERVAL_MS || 3000));

    const url = pollingUrl || `${resultEndpoint.replace(/\/$/, "")}/${encodeURIComponent(taskId)}/result`;
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
    });
    const data = await readJsonResponse(response);

    if (!response.ok) {
      continue;
    }

    const status = String(data?.status || data?.state || data?.data?.status || "").toLowerCase();
    if (["failed", "error", "canceled", "cancelled"].includes(status)) {
      throw serviceError(data?.message || data?.error || data?.data?.error || "فشل توليد الفيديو.");
    }

    const resultUrl = firstVideoUrlFrom(data?.result || data?.output || data?.data || data);
    if (resultUrl && ["completed", "succeeded", "success", "done", ""].includes(status)) {
      return resultUrl;
    }
  }

  throw serviceError("انتهت مهلة انتظار نتيجة الفيديو.", 504);
}

export async function generateWaveSpeedVideo({ prompt, duration = 5, quality = "normal", style = "" }) {
  const apiKey = requireApiKey();
  const { data: initial, model, finalPrompt, seed } = await postToWaveSpeed({ apiKey, prompt, duration, quality, style });
  const resultUrl = await pollWaveSpeedResult({ apiKey, initial });

  console.log(
    "VIDEO_GENERATION_RESULT:",
    JSON.stringify({
      userPrompt: compactForLog(prompt),
      finalPrompt: compactForLog(finalPrompt, 1400),
      model,
      seed,
      resultUrl,
    })
  );

  return {
    provider: "wavespeed",
    model,
    finalPrompt,
    seed,
    resultUrl,
    raw: initial,
  };
}
