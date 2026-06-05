import {
  ALLOWED_NATIVE_DURATIONS_BY_MODEL,
  IMAGE_MODELS,
  MAX_VIDEO_DURATION_BY_QUALITY,
  VIDEO_MODELS,
  WAVE_IMAGE_ENDPOINTS,
  WAVE_IMAGE_MODELS,
  WAVE_VIDEO_ENDPOINTS,
  WAVE_VIDEO_MODELS,
} from "./wavespeedModels.js";

const QUALITY_LABELS = {
  normal: "normal",
  high: "high quality",
  ultra: "ultra high quality",
};

const STYLE_LABELS = {
  realistic: "realistic professional photography",
  cinematic: "cinematic lighting and composition",
  anime: "anime illustration style",
  "three-d": "3D rendered style",
  "3d": "3D rendered style",
  commercial: "premium commercial advertising style",
};

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function serviceError(message, statusCode = 502) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function requireApiKey() {
  const apiKey = String(process.env.WAVESPEED_API_KEY || "").trim();
  if (!apiKey) {
    throw serviceError(
      "مفتاح WaveSpeed غير مضبوط في الخادم. أضف WAVESPEED_API_KEY في Render Environment Variables.",
      500
    );
  }
  return apiKey;
}

function compactForLog(value, maxLength = 1200) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function normalizeQuality(quality) {
  return ["normal", "high", "ultra"].includes(quality) ? quality : "normal";
}

function normalizeAspectRatio(aspectRatio) {
  const value = String(aspectRatio || "").trim();
  return ["1:1", "16:9", "9:16", "4:5"].includes(value) ? value : "16:9";
}

function randomSeed(seed) {
  const provided = Number(seed);
  return Number.isFinite(provided) ? provided : Math.floor(Math.random() * 999_999_999);
}

function hasArabicText(value) {
  return /[\u0600-\u06ff]/.test(String(value || ""));
}

function includesAny(value, terms) {
  const text = String(value || "").toLowerCase();
  return terms.some((term) => text.includes(term));
}

function translateArabicToEnglish(userPrompt) {
  const text = String(userPrompt || "").trim();
  const lower = text.toLowerCase();

  const hasCat = includesAny(lower, ["\u0642\u0637", "cat"]);
  const hasDog = includesAny(lower, ["\u0643\u0644\u0628", "dog"]);
  const hasBlack = includesAny(lower, ["\u0623\u0633\u0648\u062f", "\u0627\u0633\u0648\u062f", "black"]);
  const hasGarden = includesAny(lower, ["\u062d\u062f\u064a\u0642\u0629", "garden"]);
  const hasMoon = includesAny(lower, ["\u0627\u0644\u0642\u0645\u0631", "\u0642\u0645\u0631", "moon"]);
  const hasRobot = includesAny(lower, ["\u0631\u0648\u0628\u0648\u062a", "robot"]);
  const hasRobots = includesAny(lower, ["\u0631\u0648\u0628\u0648\u062a\u0627\u062a", "robots"]);
  const hasYellow = includesAny(lower, ["\u0623\u0635\u0641\u0631", "\u0627\u0635\u0641\u0631", "yellow"]);
  const hasGreen = includesAny(lower, ["\u0623\u062e\u0636\u0631", "\u0627\u062e\u0636\u0631", "green"]);
  const hasBeside = includesAny(lower, ["\u0628\u062c\u0627\u0646\u0628", "\u0645\u0639", "next to", "beside"]);
  const hasBusinessman = includesAny(lower, [
    "\u0631\u062c\u0644 \u0623\u0639\u0645\u0627\u0644",
    "\u0631\u062c\u0644 \u0627\u0639\u0645\u0627\u0644",
    "businessman",
  ]);
  const hasSuit = includesAny(lower, ["\u0628\u062f\u0644\u0629", "suit"]);
  const hasOffice = includesAny(lower, ["\u0645\u0643\u062a\u0628", "office"]);
  const hasHandsome = includesAny(lower, ["\u0648\u0633\u064a\u0645", "handsome"]);
  const hasCar = includesAny(lower, ["\u0633\u064a\u0627\u0631\u0629", "car"]);
  const hasSports = includesAny(lower, ["\u0631\u064a\u0627\u0636\u064a\u0629", "sports"]);
  const hasNight = includesAny(lower, ["\u0644\u064a\u0644", "\u0644\u064a\u0644\u0627", "night"]);
  const hasStreet = includesAny(lower, ["\u0634\u0627\u0631\u0639", "street"]);

  if (hasCat && hasDog) {
    const color = hasBlack ? "black " : "";
    const place = hasGarden ? "inside a garden" : "in a clean natural setting";
    return `A realistic photo of a ${color}cat next to a ${color}dog ${place}. Both animals are fully visible, side by side, clean background.`;
  }

  if (hasRobot) {
    if (hasGreen && hasYellow && hasBeside) {
      return [
        "Two robots standing side by side on the surface of the moon.",
        "Robot number one is bright green.",
        "Robot number two is bright yellow.",
        "Both robots are fully visible.",
        "Exactly two robots.",
        "Realistic sci-fi scene.",
      ].join(" ");
    }

    const color = hasYellow ? "bright yellow " : hasGreen ? "bright green " : "";
    const count = hasRobots ? "a group of futuristic robots" : `one ${color}futuristic robot`;
    const place = hasMoon ? "standing on the surface of the moon" : "in a clean futuristic scene";
    return `${count} ${place}, full body visible, realistic sci-fi image, cinematic lighting.`;
  }

  if (hasBusinessman) {
    const appearance = hasHandsome ? "handsome male " : "male ";
    const clothing = hasSuit ? "wearing an elegant formal suit" : "wearing professional business attire";
    const place = hasOffice ? "inside a modern luxury office" : "in a modern corporate environment";
    return `A ${appearance}businessman ${clothing} ${place}, realistic professional portrait, confident expression, clean corporate background, cinematic lighting.`;
  }

  if (hasCar) {
    const color = hasBlack ? "black " : "";
    const type = hasSports ? "sports car" : "car";
    const place = hasStreet ? "on a well-lit street" : "in a clean urban environment";
    const time = hasNight ? "at night" : "";
    return `A ${color}${type} ${place} ${time}, realistic automotive photography, sharp details, cinematic lighting.`;
  }

  if (!hasArabicText(text)) {
    return text;
  }

  const dictionary = [
    ["\u0642\u0637", "cat"],
    ["\u0643\u0644\u0628", "dog"],
    ["\u0623\u0633\u0648\u062f", "black"],
    ["\u0627\u0633\u0648\u062f", "black"],
    ["\u0631\u0648\u0628\u0648\u062a\u0627\u062a", "robots"],
    ["\u0631\u0648\u0628\u0648\u062a", "robot"],
    ["\u0623\u0635\u0641\u0631", "yellow"],
    ["\u0627\u0635\u0641\u0631", "yellow"],
    ["\u0623\u062e\u0636\u0631", "green"],
    ["\u0627\u062e\u0636\u0631", "green"],
    ["\u0627\u0644\u0642\u0645\u0631", "moon"],
    ["\u0642\u0645\u0631", "moon"],
    ["\u062d\u062f\u064a\u0642\u0629", "garden"],
    ["\u0628\u062c\u0627\u0646\u0628", "next to"],
    ["\u0631\u062c\u0644 \u0623\u0639\u0645\u0627\u0644", "businessman"],
    ["\u0631\u062c\u0644 \u0627\u0639\u0645\u0627\u0644", "businessman"],
    ["\u0648\u0633\u064a\u0645", "handsome"],
    ["\u0628\u062f\u0644\u0629", "formal suit"],
    ["\u0645\u0643\u062a\u0628 \u062d\u062f\u064a\u062b", "modern office"],
    ["\u0645\u0643\u062a\u0628", "office"],
    ["\u0633\u064a\u0627\u0631\u0629", "car"],
    ["\u0631\u064a\u0627\u0636\u064a\u0629", "sports"],
    ["\u0634\u0627\u0631\u0639", "street"],
    ["\u0645\u0636\u0627\u0621", "well-lit"],
    ["\u0644\u064a\u0644\u0627", "at night"],
    ["\u0644\u064a\u0644", "night"],
  ];

  let translated = text;
  for (const [arabic, english] of dictionary) {
    translated = translated.replaceAll(arabic, ` ${english} `);
  }

  translated = translated
    .replace(/[\u0600-\u06ff]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return translated || "A clean realistic image based on the user's request.";
}

function buildNegativeRules(userPrompt) {
  const lower = String(userPrompt || "").toLowerCase();
  const asksForHuman = includesAny(lower, [
    "\u0631\u062c\u0644",
    "\u0627\u0645\u0631\u0623\u0629",
    "\u0627\u0646\u0633\u0627\u0646",
    "\u0625\u0646\u0633\u0627\u0646",
    "\u0634\u062e\u0635",
    "man",
    "woman",
    "human",
    "person",
    "businessman",
  ]);
  const asksForAnimal = includesAny(lower, ["\u0642\u0637", "\u0643\u0644\u0628", "cat", "dog", "animal"]);
  const asksForRobot = includesAny(lower, ["\u0631\u0648\u0628\u0648\u062a", "robot"]);

  const rules = ["text", "letters", "watermark", "logo", "grid lines", "captions", "subtitles"];

  if (!asksForHuman) {
    rules.push("humans", "men", "women", "faces", "businessman", "suit", "portrait");
  }

  if (asksForAnimal) {
    rules.push("robots", "cars", "office", "restaurant", "food");
  }

  if (asksForRobot) {
    rules.push("humans", "animals", "cat", "dog", "food", "office");
  }

  return [...new Set(rules)];
}

function buildFinalPrompt({ userPrompt, quality = "normal", style = "", type = "image" }) {
  const translatedPrompt = translateArabicToEnglish(userPrompt);
  const qualityText = QUALITY_LABELS[normalizeQuality(quality)] || QUALITY_LABELS.normal;
  const styleText = STYLE_LABELS[style] || STYLE_LABELS.realistic;
  const negativeRules = buildNegativeRules(userPrompt).join(", ");

  const exactness =
    includesAny(String(userPrompt || "").toLowerCase(), ["\u0628\u062c\u0627\u0646\u0628", "next to", "beside", "\u0645\u0639"])
      ? "If multiple subjects are requested, show every subject clearly, side by side, and do not remove any subject."
      : "Follow the subject exactly and do not reuse previous subjects.";

  return [
    type === "video"
      ? "Create a short video that follows this request exactly:"
      : "Create an image that follows this request exactly:",
    translatedPrompt,
    "",
    "Strict rules:",
    "- Follow the subject exactly.",
    `- ${exactness}`,
    "- Do not add unrelated people, food, city, office, restaurant, animals, robots, or objects unless explicitly requested.",
    "- No text, no watermark, no logo, no UI overlay, no grid lines.",
    `- Avoid: ${negativeRules}.`,
    `- Style: ${styleText}.`,
    `- Quality: ${qualityText}, clean composition, professional lighting, main subject clearly visible.`,
  ].join("\n");
}

function isHttpUrl(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

function isLikelyMediaFileUrl(value, mediaType) {
  if (!isHttpUrl(value)) return false;

  try {
    const parsed = new URL(value);
    const pathname = parsed.pathname.toLowerCase();
    const full = `${parsed.pathname}${parsed.search}`.toLowerCase();

    if (/(^|\/)(predictions?|tasks?|jobs?)(\/|$)/i.test(parsed.pathname)) {
      return false;
    }

    if (/poll|status|result\/?$|\/get\/?$/i.test(parsed.pathname)) {
      return false;
    }

    if (mediaType === "video") {
      return (
        /\.(mp4|webm|mov|m4v|m3u8)(\?|$)/i.test(full) ||
        /video|output|cdn|storage|files?/i.test(value)
      );
    }

    return (
      /\.(png|jpe?g|webp|gif)(\?|$)/i.test(full) ||
      /image|output|cdn|storage|files?|asset|download/i.test(value) ||
      pathname.includes("/outputs/")
    );
  } catch (error) {
    return false;
  }
}

function firstMediaUrlFrom(value, mediaType) {
  if (!value) return null;

  if (isLikelyMediaFileUrl(value, mediaType)) {
    return value;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstMediaUrlFrom(item, mediaType);
      if (found) return found;
    }
    return null;
  }

  if (typeof value === "object") {
    for (const key of [
      "image_url",
      "imageUrl",
      "image",
      "images",
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
      "output",
      "result",
      "data",
    ]) {
      const found = firstMediaUrlFrom(value[key], mediaType);
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

function resolveEndpoint(envNames, fallback) {
  for (const name of envNames) {
    const value = String(process.env[name] || "").trim();
    if (value) return value;
  }
  return fallback;
}

function getImageConfig(quality) {
  const normalizedQuality = normalizeQuality(quality);
  const envPrefix = `WAVESPEED_IMAGE_${normalizedQuality.toUpperCase()}`;
  const defaults = IMAGE_MODELS[normalizedQuality] || IMAGE_MODELS.normal;
  return {
    model: process.env[`${envPrefix}_MODEL`] || defaults.model || WAVE_IMAGE_MODELS[normalizedQuality],
    endpoint: resolveEndpoint(
      [`${envPrefix}_API_URL`, `${envPrefix}_ENDPOINT`, "WAVESPEED_IMAGE_API_URL"],
      defaults.endpoint || WAVE_IMAGE_ENDPOINTS[normalizedQuality]
    ),
  };
}

function getVideoConfig(quality) {
  const normalizedQuality = normalizeQuality(quality);
  const envPrefix = `WAVESPEED_VIDEO_${normalizedQuality.toUpperCase()}`;
  const defaults = VIDEO_MODELS[normalizedQuality] || VIDEO_MODELS.normal;
  return {
    model: process.env[`${envPrefix}_MODEL`] || defaults.model || WAVE_VIDEO_MODELS[normalizedQuality],
    endpoint: resolveEndpoint(
      [`${envPrefix}_API_URL`, `${envPrefix}_ENDPOINT`, "WAVESPEED_VIDEO_API_URL", "WAVESPEED_API_URL"],
      defaults.endpoint || WAVE_VIDEO_ENDPOINTS[normalizedQuality]
    ),
  };
}

function allowedDurationsForModel(model, endpoint) {
  const haystack = `${model || ""} ${endpoint || ""}`.toLowerCase();
  const match = Object.entries(ALLOWED_NATIVE_DURATIONS_BY_MODEL).find(([name]) => haystack.includes(name));
  return match?.[1] || [5, 8];
}

function assertRequestedVideoDurationAllowed(quality, duration) {
  const normalizedQuality = normalizeQuality(quality);
  const requestedDuration = Number(duration || 5);
  const maxDuration = MAX_VIDEO_DURATION_BY_QUALITY[normalizedQuality] || MAX_VIDEO_DURATION_BY_QUALITY.normal;

  if (requestedDuration > maxDuration) {
    throw serviceError("هذه المدة غير متاحة للجودة المختارة. اختر جودة أقل أو مدة أقصر.", 400);
  }

  return requestedDuration;
}

function validateDuration(model, endpoint, duration) {
  const normalizedDuration = Number(duration || 5);
  const allowed = allowedDurationsForModel(model, endpoint);
  if (!allowed.includes(normalizedDuration)) {
    throw serviceError(`مدة الفيديو غير مدعومة لهذا النموذج. اختر: ${allowed.join(" أو ")} ثواني`, 400);
  }
  return normalizedDuration;
}

async function postWaveSpeed({ apiKey, endpoint, body }) {
  const response = await fetch(endpoint, {
    method: "POST",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  const data = await readJsonResponse(response);
  if (!response.ok) {
    const message = data?.message || data?.error || data?.detail || "فشل طلب التوليد من WaveSpeed.";
    throw serviceError(typeof message === "string" ? message : JSON.stringify(message), response.status >= 500 ? 502 : 400);
  }

  return data;
}

function getPollingUrl(initial) {
  return (
    initial?.polling_url ||
    initial?.pollingUrl ||
    initial?.urls?.get ||
    initial?.data?.urls?.get ||
    initial?.data?.polling_url ||
    initial?.data?.pollingUrl
  );
}

function getTaskId(initial) {
  return (
    initial?.id ||
    initial?.task_id ||
    initial?.request_id ||
    initial?.prediction_id ||
    initial?.data?.request_id ||
    initial?.data?.id ||
    initial?.data?.task_id ||
    initial?.data?.prediction_id
  );
}

async function pollWaveSpeedResult({ apiKey, initial, mediaType }) {
  const immediateUrl = firstMediaUrlFrom(initial?.result || initial?.output || initial?.data || initial, mediaType);
  if (immediateUrl) return immediateUrl;

  const pollingUrl = getPollingUrl(initial);
  const taskId = getTaskId(initial);
  const resultEndpoint = process.env.WAVESPEED_RESULT_URL || "https://api.wavespeed.ai/api/v3/predictions";

  if (!pollingUrl && !taskId) {
    throw serviceError("لم يرجع WaveSpeed رابط نتيجة أو رقم طلب.");
  }

  const attempts = Math.max(Number(process.env.WAVESPEED_POLL_ATTEMPTS || 60), 1);
  const intervalMs = Math.max(Number(process.env.WAVESPEED_POLL_INTERVAL_MS || 3000), 500);

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    await wait(intervalMs);

    const url = pollingUrl || `${resultEndpoint.replace(/\/$/, "")}/${encodeURIComponent(taskId)}/result`;
    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Cache-Control": "no-store",
        Authorization: `Bearer ${apiKey}`,
      },
    });
    const data = await readJsonResponse(response);

    if (!response.ok) {
      continue;
    }

    const status = String(data?.status || data?.state || data?.data?.status || "").toLowerCase();
    if (["failed", "error", "canceled", "cancelled"].includes(status)) {
      throw serviceError(data?.message || data?.error || data?.data?.error || "فشل التوليد من WaveSpeed.");
    }

    const resultUrl = firstMediaUrlFrom(data?.result || data?.output || data?.data || data, mediaType);
    if (resultUrl && ["completed", "succeeded", "success", "done", ""].includes(status)) {
      return resultUrl;
    }
  }

  throw serviceError("انتهت مهلة انتظار نتيجة WaveSpeed.", 504);
}

export function buildFinalImagePrompt(userPrompt, quality = "normal", style = "") {
  return buildFinalPrompt({ userPrompt, quality, style, type: "image" });
}

export async function generateImageWithWaveSpeed({
  prompt,
  quality = "normal",
  aspectRatio = "16:9",
  style = "",
  requestId = "",
  seed,
}) {
  const apiKey = requireApiKey();
  const normalizedQuality = normalizeQuality(quality);
  const { endpoint, model } = getImageConfig(normalizedQuality);
  const finalPrompt = buildFinalImagePrompt(prompt, normalizedQuality, style);
  const safeSeed = randomSeed(seed);
  const body = {
    prompt: finalPrompt,
    aspect_ratio: normalizeAspectRatio(aspectRatio),
    seed: safeSeed,
    enable_base64_output: false,
  };

  console.log("PROVIDER:", "wavespeed");
  console.log("TYPE:", "image");
  console.log("QUALITY:", normalizedQuality);
  console.log("MODEL:", model);
  console.log("REQUEST_ID:", requestId);
  console.log("USER_PROMPT:", prompt);
  console.log("FINAL_PROMPT:", finalPrompt);
  console.log("WAVESPEED BODY SENT:", JSON.stringify({ ...body, prompt: compactForLog(body.prompt) }));

  const initial = await postWaveSpeed({ apiKey, endpoint, body });
  const resultUrl = await pollWaveSpeedResult({ apiKey, initial, mediaType: "image" });

  console.log("NEW RESULT URL:", resultUrl);

  return {
    provider: "wavespeed",
    model,
    finalPrompt,
    seed: safeSeed,
    resultUrl,
    raw: initial,
  };
}

export async function generateVideoWithWaveSpeed({
  prompt,
  duration = 5,
  quality = "normal",
  aspectRatio = "16:9",
  style = "",
  requestId = "",
  seed,
}) {
  const apiKey = requireApiKey();
  const normalizedQuality = normalizeQuality(quality);
  const { endpoint, model } = getVideoConfig(normalizedQuality);
  const requestedDuration = assertRequestedVideoDurationAllowed(normalizedQuality, duration);
  const nativeDurations = allowedDurationsForModel(model, endpoint);

  if (!nativeDurations.includes(requestedDuration)) {
    return generateLongVideoWithWaveSpeed({
      prompt,
      quality: normalizedQuality,
      duration: requestedDuration,
      aspectRatio,
      style,
      requestId,
      seed,
      apiKey,
      config: { endpoint, model },
      nativeDurations,
    });
  }

  return generateNativeVideoWithWaveSpeed({
    apiKey,
    endpoint,
    model,
    prompt,
    duration: requestedDuration,
    quality: normalizedQuality,
    aspectRatio,
    style,
    requestId,
    seed,
  });
}

async function generateNativeVideoWithWaveSpeed({
  apiKey,
  endpoint,
  model,
  prompt,
  duration,
  quality,
  aspectRatio,
  style,
  requestId,
  seed,
}) {
  const safeDuration = validateDuration(model, endpoint, duration);
  const finalPrompt = buildFinalPrompt({ userPrompt: prompt, quality, style, type: "video" });
  const safeSeed = randomSeed(seed);
  const body = {
    prompt: finalPrompt,
    duration: safeDuration,
    aspect_ratio: normalizeAspectRatio(aspectRatio),
    seed: safeSeed,
  };

  console.log("PROVIDER:", "wavespeed");
  console.log("TYPE:", "video");
  console.log("QUALITY:", quality);
  console.log("MODEL:", model);
  console.log("REQUEST_ID:", requestId);
  console.log("USER_PROMPT:", prompt);
  console.log("FINAL_PROMPT:", finalPrompt);
  console.log("WAVESPEED BODY SENT:", JSON.stringify({ ...body, prompt: compactForLog(body.prompt) }));

  const initial = await postWaveSpeed({ apiKey, endpoint, body });
  const resultUrl = await pollWaveSpeedResult({ apiKey, initial, mediaType: "video" });

  console.log("NEW RESULT URL:", resultUrl);

  return {
    provider: "wavespeed",
    model,
    finalPrompt,
    seed: safeSeed,
    resultUrl,
    raw: initial,
  };
}

export async function generateLongVideoWithWaveSpeed({
  prompt,
  duration,
  quality = "normal",
  aspectRatio = "16:9",
  style = "",
  requestId = "",
  seed,
  apiKey = null,
  config = null,
  nativeDurations = null,
}) {
  const normalizedQuality = normalizeQuality(quality);
  const requestedDuration = assertRequestedVideoDurationAllowed(normalizedQuality, duration);
  const resolvedApiKey = apiKey || requireApiKey();
  const resolvedConfig = config || getVideoConfig(normalizedQuality);
  const allowedNativeDurations = nativeDurations || allowedDurationsForModel(resolvedConfig.model, resolvedConfig.endpoint);
  const chunkDuration = allowedNativeDurations.includes(8) ? 8 : allowedNativeDurations[0] || 5;
  const clipsNeeded = Math.ceil(requestedDuration / chunkDuration);

  console.log("PROVIDER:", "wavespeed");
  console.log("TYPE:", "video");
  console.log("QUALITY:", normalizedQuality);
  console.log("MODEL:", resolvedConfig.model);
  console.log("REQUEST_ID:", requestId);
  console.log("LONG_VIDEO_REQUEST:", JSON.stringify({ requestedDuration, chunkDuration, clipsNeeded }));

  if (process.env.WAVESPEED_ENABLE_LONG_VIDEO_MERGE !== "true") {
    throw serviceError(
      "الفيديو الطويل يحتاج تفعيل دمج المقاطع في الخادم. اختر 5 أو 8 ثواني حاليًا، أو فعّل WAVESPEED_ENABLE_LONG_VIDEO_MERGE.",
      400
    );
  }

  if (!String(process.env.WAVESPEED_LONG_VIDEO_MERGE_URL || "").trim()) {
    throw serviceError(
      "دمج الفيديو الطويل غير مفعّل في الخادم. أضف WAVESPEED_LONG_VIDEO_MERGE_URL قبل السماح بمدد أطول من 8 ثواني.",
      400
    );
  }

  const clipUrls = [];
  for (let index = 0; index < clipsNeeded; index += 1) {
    const clipSeed = randomSeed(Number(seed) + index || undefined);
    const clipPrompt = `${prompt}\nContinuous shot, part ${index + 1} of ${clipsNeeded}. Keep the same subject, style, colors, and scene continuity.`;
    const clip = await generateNativeVideoWithWaveSpeed({
      apiKey: resolvedApiKey,
      endpoint: resolvedConfig.endpoint,
      model: resolvedConfig.model,
      prompt: clipPrompt,
      duration: chunkDuration,
      quality: normalizedQuality,
      aspectRatio,
      style,
      requestId: `${requestId || "long-video"}-part-${index + 1}`,
      seed: clipSeed,
    });
    clipUrls.push(clip.resultUrl);
  }

  const resultUrl = await mergeVideoClipsWithFfmpeg({
    clipUrls,
    targetDuration: requestedDuration,
  });

  return {
    provider: "wavespeed",
    model: `${resolvedConfig.model}+merged`,
    finalPrompt: buildFinalPrompt({ userPrompt: prompt, quality: normalizedQuality, style, type: "video" }),
    seed,
    resultUrl,
    raw: { clipUrls, requestedDuration, chunkDuration, clipsNeeded },
  };
}

export async function mergeVideoClipsWithFfmpeg({ clipUrls, targetDuration }) {
  if (!Array.isArray(clipUrls) || clipUrls.length === 0) {
    throw serviceError("لا توجد مقاطع صالحة للدمج.", 500);
  }

  const mergeEndpoint = String(process.env.WAVESPEED_LONG_VIDEO_MERGE_URL || "").trim();
  if (!mergeEndpoint) {
    throw serviceError(
      "تم إنشاء المقاطع لكن دمج الفيديو النهائي غير مفعّل. أضف WAVESPEED_LONG_VIDEO_MERGE_URL أو عطّل الفيديو الطويل مؤقتًا.",
      500
    );
  }

  const response = await fetch(mergeEndpoint, {
    method: "POST",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify({ clipUrls, targetDuration }),
  });
  const data = await readJsonResponse(response);

  if (!response.ok) {
    const message = data?.message || data?.error || "فشل دمج الفيديو النهائي.";
    throw serviceError(typeof message === "string" ? message : JSON.stringify(message), response.status >= 500 ? 502 : 400);
  }

  const resultUrl = firstMediaUrlFrom(data?.result || data?.output || data?.data || data, "video");
  if (!resultUrl) {
    throw serviceError("لم يرجع مزود الدمج رابط الفيديو النهائي.", 502);
  }

  return resultUrl;
}

export const generateWaveSpeedVideo = generateVideoWithWaveSpeed;
