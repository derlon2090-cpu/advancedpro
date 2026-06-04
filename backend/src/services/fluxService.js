function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function serviceError(message, statusCode = 502) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function hasArabicText(value) {
  return /[\u0600-\u06ff]/.test(String(value || ""));
}

function compactForLog(value, maxLength = 500) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function envFlag(name, fallback = false) {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(String(raw).trim().toLowerCase());
}

function randomSeed() {
  return Math.floor(Math.random() * 1_000_000_000);
}

const IMAGE_NEGATIVE_PROMPT = [
  "text",
  "words",
  "letters",
  "arabic text",
  "watermark",
  "logo",
  "captions",
  "subtitles",
  "grid",
  "grid lines",
  "lines",
  "overlay",
  "UI",
  "blurry",
  "distorted face",
  "extra fingers",
  "deformed hands",
  "random woman",
  "random man",
  "food",
  "animals",
  "rabbit",
  "pet",
].join(", ");

function arabicPromptHints(userPrompt) {
  const text = String(userPrompt || "").toLowerCase();
  const hints = [];

  const addIf = (patterns, hint) => {
    if (patterns.some((pattern) => pattern.test(text))) {
      hints.push(hint);
    }
  };

  addIf([/رجل\s*أعمال/, /رجل اعمال/, /businessman/], "male businessman");
  addIf([/وسيم/, /handsome/], "handsome");
  addIf([/بدلة/, /بذلة/, /suit/], "formal suit");
  addIf([/مكتب\s*حديث/, /مكتب/, /office/], "modern luxury office");
  addIf([/روبوت/, /robot/], "friendly robot assistant");
  addIf([/سيارة/, /car/], "car");
  addIf([/منزل/, /بيت/, /house/, /villa/], "modern house");
  addIf([/أنمي/, /انمي/, /anime/], "anime style character");
  addIf([/سينمائي/, /cinematic/], "cinematic lighting");
  addIf([/واقعي/, /realistic/], "realistic professional photo");
  addIf([/امرأة|مرأة|بنت|فتاة|سيدة/, "woman", "female"].map((item) => (item instanceof RegExp ? item : new RegExp(item))), "female subject");

  if (/رجل|ذكر|شاب/.test(text) && !hints.includes("male businessman")) {
    hints.push("male subject");
  }

  return [...new Set(hints)];
}

function buildImagePrompt({ prompt, quality, style }) {
  const userPrompt = String(prompt || "").trim();
  const styleText = String(style || "").trim();
  const hints = arabicPromptHints(userPrompt);
  const qualityHints = {
    normal: "clean composition, clear subject, good lighting",
    high: "high quality, realistic details, sharp focus, professional lighting",
    ultra: "ultra detailed, premium composition, realistic textures, cinematic lighting",
  };

  return [
    "Create a high quality image that follows this user request exactly:",
    `"${userPrompt}"`,
    "",
    hints.length ? `Interpreted English intent: ${hints.join(", ")}.` : "",
    hasArabicText(userPrompt)
      ? "The request is Arabic. Translate its meaning accurately into English before generating, and follow that translated meaning exactly."
      : "Follow the user's request exactly.",
    "Important subject rules:",
    "- If the request says رجل, generate a male person only.",
    "- If the request says امرأة, generate a female person only.",
    "- If the request mentions businessman or رجل أعمال, create a male businessman wearing a formal suit.",
    "- Do not create random women, food, animals, rabbits, pets, landscapes, or unrelated scenes unless explicitly requested.",
    "- Do not add any written text inside the image.",
    "- Do not add Arabic letters, captions, subtitles, watermarks, logos, grid lines, UI overlays, or frames.",
    "- Avoid blurry output, distorted faces, extra fingers, and deformed hands.",
    "Keep the requested main subject clear, centered, fully visible, and not cropped.",
    "Professional realistic photography, clean composition, cinematic professional lighting.",
    `Quality direction: ${qualityHints[quality] || qualityHints.normal}.`,
    styleText ? `Visual style: ${styleText}.` : "",
    `Negative prompt guidance: ${IMAGE_NEGATIVE_PROMPT}.`,
  ]
    .filter(Boolean)
    .join("\n");
}

function requireApiKey() {
  const apiKey = String(process.env.BFL_API_KEY || "").trim();
  if (!apiKey) {
    throw serviceError(
      "مفتاح توليد الصور غير مضبوط في الخادم. أضف BFL_API_KEY في Render Environment Variables.",
      500
    );
  }
  return apiKey;
}

function firstUrlFrom(value) {
  if (!value) return null;

  if (typeof value === "string" && /^https?:\/\//i.test(value)) {
    return value;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstUrlFrom(item);
      if (found) return found;
    }
    return null;
  }

  if (typeof value === "object") {
    for (const key of ["url", "image", "image_url", "sample", "signed_url", "resultUrl", "outputs"]) {
      const found = firstUrlFrom(value[key]);
      if (found) return found;
    }

    for (const nested of Object.values(value)) {
      const found = firstUrlFrom(nested);
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

function getFluxModelConfig(quality) {
  if (quality === "ultra") {
    return {
      endpoint: process.env.BFL_ULTRA_API_URL || process.env.BFL_API_URL || "https://api.bfl.ai/v1/flux-pro-1.1-ultra",
      model: process.env.BFL_ULTRA_MODEL || "flux-pro-1.1-ultra",
    };
  }

  if (quality === "high") {
    return {
      endpoint: process.env.BFL_HIGH_API_URL || process.env.BFL_API_URL || "https://api.bfl.ai/v1/flux-pro-1.1",
      model: process.env.BFL_HIGH_MODEL || "flux-pro-1.1",
    };
  }

  return {
    endpoint:
      process.env.BFL_NORMAL_API_URL ||
      process.env.BFL_FAST_API_URL ||
      process.env.BFL_API_URL ||
      "https://api.bfl.ai/v1/flux-dev",
    model: process.env.BFL_NORMAL_MODEL || "flux-dev",
  };
}

async function postToBfl({ apiKey, prompt, quality, style, requestId }) {
  const { endpoint, model } = getFluxModelConfig(quality);
  const finalPrompt = buildImagePrompt({ prompt, quality, style });
  const negativePrompt = IMAGE_NEGATIVE_PROMPT;
  const seed = randomSeed();
  const payload = {
    prompt: finalPrompt,
    width: Number(process.env.BFL_IMAGE_WIDTH || 1024),
    height: Number(process.env.BFL_IMAGE_HEIGHT || 1024),
    output_format: process.env.BFL_OUTPUT_FORMAT || "jpeg",
    prompt_upsampling: envFlag("BFL_PROMPT_UPSAMPLING", false),
    safety_tolerance: Number(process.env.BFL_SAFETY_TOLERANCE || 2),
    seed,
  };

  const negativePromptField = String(process.env.BFL_NEGATIVE_PROMPT_FIELD || "").trim();
  if (negativePromptField) {
    payload[negativePromptField] = negativePrompt;
  }

  console.log("USER_PROMPT:", prompt);
  console.log("FINAL_PROMPT:", payload.prompt);
  console.log("NEGATIVE_PROMPT:", negativePrompt);
  console.log("MODEL:", model);
  console.log("SEED:", seed);
  console.log(
    "API_BODY:",
    JSON.stringify({
      ...payload,
      prompt: compactForLog(payload.prompt, 1400),
      [negativePromptField || "negativePromptAppliedInFinalPrompt"]: negativePromptField
        ? compactForLog(negativePrompt, 700)
        : true,
    })
  );

  console.log(
    "[BFL_IMAGE_REQUEST]",
    JSON.stringify({
      model,
      requestId,
      quality,
      seed,
      width: payload.width,
      height: payload.height,
      originalPrompt: compactForLog(prompt),
      promptSent: compactForLog(payload.prompt),
      negativePromptSentAsField: Boolean(negativePromptField),
    })
  );

  const response = await fetch(endpoint, {
    method: "POST",
    cache: "no-store",
    headers: {
      accept: "application/json",
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "x-key": apiKey,
    },
    body: JSON.stringify(payload),
  });

  const data = await readJsonResponse(response);
  console.log(
    "[BFL_IMAGE_RESPONSE]",
    JSON.stringify({
      model,
      ok: response.ok,
      status: response.status,
      responseKeys: data && typeof data === "object" ? Object.keys(data).slice(0, 12) : [],
    })
  );
  if (!response.ok) {
    const message = data?.detail || data?.message || data?.error || "فشل طلب توليد الصورة من BFL.";
    throw serviceError(typeof message === "string" ? message : JSON.stringify(message), response.status >= 500 ? 502 : 400);
  }

  return { data, model, finalPrompt: payload.prompt, seed };
}

async function pollBflResult({ apiKey, initial }) {
  const immediateUrl = firstUrlFrom(initial?.result || initial?.output || initial?.data || initial?.image);
  if (immediateUrl) return immediateUrl;

  const pollingUrl = initial?.polling_url || initial?.pollingUrl || initial?.urls?.get || initial?.data?.polling_url;
  const requestId = initial?.id || initial?.request_id || initial?.task_id || initial?.data?.id || initial?.data?.request_id;
  const resultEndpoint = process.env.BFL_RESULT_URL || "https://api.bfl.ai/v1/get_result";

  if (!pollingUrl && !requestId) {
    throw serviceError("لم يرجع مزود الصور رابط نتيجة أو رقم طلب.");
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

    const status = String(data?.status || data?.state || data?.data?.status || "").toLowerCase();
    if (["failed", "error", "canceled", "cancelled", "request moderated", "content moderated"].includes(status)) {
      throw serviceError(data?.message || data?.error || data?.data?.error || "فشل توليد الصورة.");
    }

    const resultUrl = firstUrlFrom(data?.result || data?.output || data?.data || data);
    if (resultUrl && ["ready", "completed", "succeeded", "success", "done", ""].includes(status)) {
      return resultUrl;
    }
  }

  throw serviceError("انتهت مهلة انتظار نتيجة الصورة.", 504);
}

export async function generateFluxImage({ prompt, quality = "normal", style = "", requestId = "" }) {
  const apiKey = requireApiKey();
  const { data: initial, model, finalPrompt, seed } = await postToBfl({ apiKey, prompt, quality, style, requestId });
  const resultUrl = await pollBflResult({ apiKey, initial });

  console.log(
    "IMAGE_GENERATION_RESULT:",
    JSON.stringify({
      userPrompt: compactForLog(prompt),
      finalPrompt: compactForLog(finalPrompt, 1400),
      model,
      seed,
      resultUrl,
    })
  );

  return {
    provider: "bfl",
    model,
    finalPrompt,
    seed,
    resultUrl,
    raw: initial,
  };
}
