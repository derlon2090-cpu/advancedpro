function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requireApiKey() {
  const apiKey = process.env.WAVESPEED_API_KEY;
  if (!apiKey) {
    const error = new Error("مفتاح توليد الفيديو غير مضبوط في الخادم. أضف WAVESPEED_API_KEY في Render Environment Variables.");
    error.statusCode = 500;
    throw error;
  }
  return apiKey;
}

function firstUrlFrom(value) {
  if (!value) {
    return null;
  }

  if (typeof value === "string" && /^https?:\/\//i.test(value)) {
    return value;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstUrlFrom(item);
      if (found) {
        return found;
      }
    }
    return null;
  }

  if (typeof value === "object") {
    for (const key of ["url", "video", "video_url", "output_url", "resultUrl"]) {
      const found = firstUrlFrom(value[key]);
      if (found) {
        return found;
      }
    }

    for (const nested of Object.values(value)) {
      const found = firstUrlFrom(nested);
      if (found) {
        return found;
      }
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
      model: process.env.WAVESPEED_ULTRA_MODEL || "kling-3.0",
    };
  }

  if (quality === "high") {
    return {
      endpoint: process.env.WAVESPEED_HIGH_API_URL || process.env.WAVESPEED_API_URL,
      model: process.env.WAVESPEED_HIGH_MODEL || "wan-2.7",
    };
  }

  return {
    endpoint:
      process.env.WAVESPEED_NORMAL_API_URL ||
      process.env.WAVESPEED_FAST_API_URL ||
      process.env.WAVESPEED_API_URL,
    model: process.env.WAVESPEED_NORMAL_MODEL || "wan-2.2-ultra-fast",
  };
}

async function postToWaveSpeed({ apiKey, prompt, duration, quality, style }) {
  const config = getWaveSpeedModelConfig(quality);
  const endpoint =
    config.endpoint || "https://api.wavespeed.ai/api/v3/wavespeed-ai/wan-2.1-t2v-480p";
  const payload = {
    prompt: style ? `${prompt}\nStyle: ${style}` : prompt,
    duration,
    quality,
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await readJsonResponse(response);
  if (!response.ok) {
    const message = data?.message || data?.error || data?.detail || "فشل طلب توليد الفيديو.";
    const error = new Error(typeof message === "string" ? message : JSON.stringify(message));
    error.statusCode = response.status >= 500 ? 502 : 400;
    throw error;
  }

  return { data, model: config.model };
}

async function pollWaveSpeedResult({ apiKey, initial }) {
  const immediateUrl = firstUrlFrom(initial?.result || initial?.output || initial?.data || initial?.video);
  if (immediateUrl) {
    return immediateUrl;
  }

  const pollingUrl =
    initial?.polling_url ||
    initial?.pollingUrl ||
    initial?.urls?.get ||
    initial?.data?.urls?.get;
  const taskId =
    initial?.id ||
    initial?.task_id ||
    initial?.request_id ||
    initial?.data?.id ||
    initial?.data?.task_id;
  const resultEndpoint = process.env.WAVESPEED_RESULT_URL;

  if (!pollingUrl && (!resultEndpoint || !taskId)) {
    const error = new Error("لم يرجع مزود الفيديو رابط نتيجة أو رقم طلب.");
    error.statusCode = 502;
    throw error;
  }

  for (let attempt = 1; attempt <= Number(process.env.WAVESPEED_POLL_ATTEMPTS || 60); attempt += 1) {
    await wait(Number(process.env.WAVESPEED_POLL_INTERVAL_MS || 3000));

    const url = pollingUrl || `${resultEndpoint.replace(/\/$/, "")}/${encodeURIComponent(taskId)}`;
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
      const error = new Error(data?.message || data?.error || data?.data?.error || "فشل توليد الفيديو.");
      error.statusCode = 502;
      throw error;
    }

    const resultUrl = firstUrlFrom(data?.result || data?.output || data?.data || data);
    if (resultUrl && !["pending", "processing", "queued", "running"].includes(status)) {
      return resultUrl;
    }
  }

  const error = new Error("انتهت مهلة انتظار نتيجة الفيديو.");
  error.statusCode = 504;
  throw error;
}

export async function generateWaveSpeedVideo({
  prompt,
  duration = 10,
  quality = "normal",
  style = "",
}) {
  const apiKey = requireApiKey();
  const { data: initial, model } = await postToWaveSpeed({ apiKey, prompt, duration, quality, style });
  const resultUrl = await pollWaveSpeedResult({ apiKey, initial });

  return {
    provider: "wavespeed",
    model,
    resultUrl,
    raw: initial,
  };
}
