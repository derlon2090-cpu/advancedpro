function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requireApiKey() {
  const apiKey = process.env.BFL_API_KEY;
  if (!apiKey) {
    const error = new Error("مفتاح توليد الصور غير مضبوط في الخادم. أضف BFL_API_KEY في Render Environment Variables.");
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
    for (const key of ["url", "image", "image_url", "sample", "signed_url", "resultUrl"]) {
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

function getFluxModelConfig(quality) {
  if (quality === "ultra") {
    return {
      endpoint: process.env.BFL_ULTRA_API_URL || process.env.BFL_API_URL || "https://api.bfl.ai/v1/flux-pro-1.1",
      model: process.env.BFL_ULTRA_MODEL || "flux-pro",
    };
  }

  if (quality === "high") {
    return {
      endpoint: process.env.BFL_HIGH_API_URL || process.env.BFL_API_URL || "https://api.bfl.ai/v1/flux-pro-1.1",
      model: process.env.BFL_HIGH_MODEL || "flux-high",
    };
  }

  return {
    endpoint:
      process.env.BFL_NORMAL_API_URL ||
      process.env.BFL_FAST_API_URL ||
      process.env.BFL_API_URL ||
      "https://api.bfl.ai/v1/flux-pro-1.1",
    model: process.env.BFL_NORMAL_MODEL || "flux-fast",
  };
}

async function postToBfl({ apiKey, prompt, quality, style }) {
  const { endpoint, model } = getFluxModelConfig(quality);
  const payload = {
    prompt,
    width: Number(process.env.BFL_IMAGE_WIDTH || 1024),
    height: Number(process.env.BFL_IMAGE_HEIGHT || 1024),
    output_format: "png",
    prompt_upsampling: quality === "ultra",
    safety_tolerance: 2,
  };

  if (style) {
    payload.prompt = `${prompt}\nStyle: ${style}`;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      accept: "application/json",
      "Content-Type": "application/json",
      "x-key": apiKey,
    },
    body: JSON.stringify(payload),
  });

  const data = await readJsonResponse(response);
  if (!response.ok) {
    const message = data?.detail || data?.message || data?.error || "فشل طلب توليد الصورة.";
    const error = new Error(typeof message === "string" ? message : JSON.stringify(message));
    error.statusCode = response.status >= 500 ? 502 : 400;
    throw error;
  }

  return { data, model };
}

async function pollBflResult({ apiKey, initial }) {
  const immediateUrl = firstUrlFrom(initial?.result || initial?.output || initial?.data || initial?.image);
  if (immediateUrl) {
    return immediateUrl;
  }

  const pollingUrl = initial?.polling_url || initial?.pollingUrl || initial?.urls?.get;
  const requestId = initial?.id || initial?.request_id || initial?.task_id;
  const resultEndpoint = process.env.BFL_RESULT_URL || "https://api.bfl.ai/v1/get_result";

  if (!pollingUrl && !requestId) {
    const error = new Error("لم يرجع مزود الصور رابط نتيجة أو رقم طلب.");
    error.statusCode = 502;
    throw error;
  }

  for (let attempt = 1; attempt <= Number(process.env.BFL_POLL_ATTEMPTS || 35); attempt += 1) {
    await wait(Number(process.env.BFL_POLL_INTERVAL_MS || 2000));

    const url = pollingUrl || `${resultEndpoint}?id=${encodeURIComponent(requestId)}`;
    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "x-key": apiKey,
      },
    });
    const data = await readJsonResponse(response);

    if (!response.ok) {
      continue;
    }

    const status = String(data?.status || data?.state || "").toLowerCase();
    if (
      ["failed", "error", "canceled", "cancelled", "request moderated", "content moderated"].includes(status)
    ) {
      const error = new Error(data?.message || data?.error || "فشل توليد الصورة.");
      error.statusCode = 502;
      throw error;
    }

    const resultUrl = firstUrlFrom(data?.result || data?.output || data?.data || data);
    if (resultUrl && !["pending", "processing", "queued", "running"].includes(status)) {
      return resultUrl;
    }
  }

  const error = new Error("انتهت مهلة انتظار نتيجة الصورة.");
  error.statusCode = 504;
  throw error;
}

export async function generateFluxImage({ prompt, quality = "normal", style = "" }) {
  const apiKey = requireApiKey();
  const { data: initial, model } = await postToBfl({ apiKey, prompt, quality, style });
  const resultUrl = await pollBflResult({ apiKey, initial });

  return {
    provider: "bfl",
    model,
    resultUrl,
    raw: initial,
  };
}
