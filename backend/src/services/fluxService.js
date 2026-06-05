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

const BASE_IMAGE_NEGATIVE_PROMPT = [
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
  "wrong subject",
  "previous image",
  "old prompt",
  "cached result",
].join(", ");

function includesAny(text, terms) {
  return terms.some((term) => text.includes(term));
}

function promptRequestsHuman(userPrompt) {
  const text = String(userPrompt || "").toLowerCase();
  return (
    /\b(human|person|people|man|woman|male|female|boy|girl|businessman|portrait)\b/i.test(text) ||
    includesAny(text, [
      "رجل",
      "امرأة",
      "مرأه",
      "شخص",
      "إنسان",
      "انسان",
      "بشر",
      "شاب",
      "فتاة",
      "بنت",
      "سيدة",
      "وجه",
      "بورتريه",
    ])
  );
}

function promptRequestsAnimal(userPrompt) {
  const text = String(userPrompt || "").toLowerCase();
  return (
    /\b(animal|animals|rabbit|cat|dog|pet|horse|bird)\b/i.test(text) ||
    includesAny(text, ["حيوان", "حيوانات", "أرنب", "ارنب", "قط", "كلب", "حصان", "طائر"])
  );
}

function promptRequestsFood(userPrompt) {
  const text = String(userPrompt || "").toLowerCase();
  return /\b(food|meal|burger|pizza|fries)\b/i.test(text) || includesAny(text, ["طعام", "اكل", "أكل", "وجبة"]);
}

function buildNegativePrompt(userPrompt) {
  const subjectBlocks = [];

  if (!promptRequestsHuman(userPrompt)) {
    subjectBlocks.push("human", "humans", "person", "people", "man", "woman", "businessman", "suit", "office", "portrait");
  }

  if (!promptRequestsAnimal(userPrompt)) {
    subjectBlocks.push("animals", "animal", "rabbit", "pet", "cat", "dog");
  }

  if (!promptRequestsFood(userPrompt)) {
    subjectBlocks.push("food", "meal", "fries", "burger");
  }

  return [...new Set([...subjectBlocks, ...BASE_IMAGE_NEGATIVE_PROMPT.split(", ")])].join(", ");
}

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
  addIf([/روبوتات|روبوت/, /robot|robots/], "robots, full-body mechanical robots, no humans");
  addIf([/القمر|قمر/, /moon|lunar/], "moon surface, lunar landscape");
  addIf([/قطة|قطه|قط/, /cat|kitten/], "black cat, full-body cat, animal only");
  addIf([/كلب/, /dog|puppy/], "black dog, full-body dog, animal only");
  addIf([/أسود|اسود|سوداء|سودا|لونهم أسود|لونهم اسود/, /black/], "black color");
  addIf([/أصفر|اصفر/, /yellow/], "yellow color");
  addIf([/أحمر|احمر/, /red/], "red color");
  addIf([/أزرق|ازرق/, /blue/], "blue color");
  addIf([/أخضر|اخضر/, /green/], "green color");
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
  const negativePrompt = buildNegativePrompt(userPrompt);
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
    "- Do not reuse previous subjects, previous prompts, cached results, or old reference images.",
    "- Do not create random people, food, animals, rabbits, pets, landscapes, or unrelated scenes unless explicitly requested.",
    "- If the user asks for a cat and dog, generate the cat and dog clearly as the main subjects, and do not generate people or food.",
    "- If the user asks for robots, generate robots only and do not generate humans.",
    "- If the user asks for the moon, show the moon surface or lunar environment clearly.",
    "- Do not add any written text inside the image.",
    "- Do not add Arabic letters, captions, subtitles, watermarks, logos, grid lines, UI overlays, or frames.",
    "- Avoid blurry output, distorted faces, extra fingers, and deformed hands.",
    "Keep the requested main subject clear, centered, fully visible, and not cropped.",
    "Professional realistic photography, clean composition, cinematic professional lighting.",
    `Quality direction: ${qualityHints[quality] || qualityHints.normal}.`,
    styleText ? `Visual style: ${styleText}.` : "",
    `Negative prompt guidance: ${negativePrompt}.`,
  ]
    .filter(Boolean)
    .join("\n");
}

const ARABIC_PROMPT_TERMS_V2 = {
  cat: [/\u0642\u0637\u0629/u, /\u0642\u0637\u0647/u, /\u0642\u0637/u],
  dog: [/\u0643\u0644\u0628/u],
  black: [/\u0623\u0633\u0648\u062f/u, /\u0627\u0633\u0648\u062f/u, /\u0633\u0648\u062f\u0627\u0621/u, /\u0633\u0648\u062f\u0627/u],
  yellow: [/\u0623\u0635\u0641\u0631/u, /\u0627\u0635\u0641\u0631/u, /\u0635\u0641\u0631\u0627\u0621/u],
  red: [/\u0623\u062d\u0645\u0631/u, /\u0627\u062d\u0645\u0631/u],
  blue: [/\u0623\u0632\u0631\u0642/u, /\u0627\u0632\u0631\u0642/u],
  green: [/\u0623\u062e\u0636\u0631/u, /\u0627\u062e\u0636\u0631/u],
  robot: [/\u0631\u0648\u0628\u0648\u062a/u, /\u0631\u0648\u0628\u0648\u062a\u0627\u062a/u],
  moon: [/\u0627\u0644\u0642\u0645\u0631/u, /\u0642\u0645\u0631/u],
  garden: [/\u062d\u062f\u064a\u0642\u0629/u, /\u062d\u062f\u064a\u0642\u0647/u],
  nextTo: [/\u0628\u062c\u0627\u0646\u0628/u, /\u062c\u0627\u0646\u0628/u, /\u0645\u0639/u],
  group: [/\u0645\u062c\u0645\u0648\u0639\u0629/u, /\u0645\u062c\u0645\u0648\u0639\u0647/u, /\u0639\u062f\u0629/u],
  man: [/\u0631\u062c\u0644/u, /\u0630\u0643\u0631/u, /\u0634\u0627\u0628/u],
  woman: [/\u0627\u0645\u0631\u0623\u0629/u, /\u0627\u0645\u0631\u0627\u0629/u, /\u0645\u0631\u0623\u0629/u, /\u0645\u0631\u0627\u0629/u, /\u0628\u0646\u062a/u, /\u0641\u062a\u0627\u0629/u],
  businessman: [/\u0631\u062c\u0644\s*\u0623\u0639\u0645\u0627\u0644/u, /\u0631\u062c\u0644\s*\u0627\u0639\u0645\u0627\u0644/u],
  handsome: [/\u0648\u0633\u064a\u0645/u],
  suit: [/\u0628\u062f\u0644\u0629/u, /\u0628\u0630\u0644\u0629/u],
  office: [/\u0645\u0643\u062a\u0628/u],
  car: [/\u0633\u064a\u0627\u0631\u0629/u, /\u0633\u064a\u0627\u0631\u0647/u],
  future: [/\u0645\u0633\u062a\u0642\u0628\u0644/u, /\u0645\u0633\u062a\u0642\u0628\u0644\u064a/u, /\u0645\u0633\u062a\u0642\u0628\u0644\u064a\u0629/u],
  street: [/\u0634\u0627\u0631\u0639/u],
  lit: [/\u0645\u0636\u0627\u0621/u, /\u0645\u0636\u0627/u],
  food: [/\u0637\u0639\u0627\u0645/u, /\u0623\u0643\u0644/u, /\u0627\u0643\u0644/u, /\u0648\u062c\u0628\u0629/u],
};

function normalizeArabicPromptV2(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[\u064b-\u065f\u0670]/g, "")
    .trim()
    .toLowerCase();
}

function hasArabicPromptTermV2(text, key) {
  return (ARABIC_PROMPT_TERMS_V2[key] || []).some((pattern) => pattern.test(text));
}

function promptRequestsHumanV2(userPrompt) {
  const raw = String(userPrompt || "");
  const text = normalizeArabicPromptV2(raw);
  return (
    /\b(human|person|people|man|woman|male|female|boy|girl|businessman|portrait)\b/i.test(raw) ||
    hasArabicPromptTermV2(text, "man") ||
    hasArabicPromptTermV2(text, "woman") ||
    hasArabicPromptTermV2(text, "businessman")
  );
}

function promptRequestsAnimalV2(userPrompt) {
  const raw = String(userPrompt || "");
  const text = normalizeArabicPromptV2(raw);
  return (
    /\b(animal|animals|rabbit|cat|dog|pet|horse|bird)\b/i.test(raw) ||
    hasArabicPromptTermV2(text, "cat") ||
    hasArabicPromptTermV2(text, "dog")
  );
}

function promptRequestsFoodV2(userPrompt) {
  const raw = String(userPrompt || "");
  const text = normalizeArabicPromptV2(raw);
  return /\b(food|meal|burger|pizza|fries|restaurant)\b/i.test(raw) || hasArabicPromptTermV2(text, "food");
}

function promptRequestsRobotV2(userPrompt) {
  const raw = String(userPrompt || "");
  const text = normalizeArabicPromptV2(raw);
  return /\b(robot|robots|android|mecha)\b/i.test(raw) || hasArabicPromptTermV2(text, "robot");
}

function promptRequestsVehicleV2(userPrompt) {
  const raw = String(userPrompt || "");
  const text = normalizeArabicPromptV2(raw);
  return /\b(car|vehicle|supercar)\b/i.test(raw) || hasArabicPromptTermV2(text, "car");
}

function promptRequestsOfficeV2(userPrompt) {
  const raw = String(userPrompt || "");
  const text = normalizeArabicPromptV2(raw);
  return /\b(office|workspace|desk)\b/i.test(raw) || hasArabicPromptTermV2(text, "office");
}

function buildDynamicNegativePromptV2(userPrompt) {
  const subjectBlocks = [];
  const wantsHuman = promptRequestsHumanV2(userPrompt);
  const wantsAnimal = promptRequestsAnimalV2(userPrompt);
  const wantsFood = promptRequestsFoodV2(userPrompt);
  const wantsRobot = promptRequestsRobotV2(userPrompt);
  const wantsVehicle = promptRequestsVehicleV2(userPrompt);
  const wantsOffice = promptRequestsOfficeV2(userPrompt);

  if (!wantsHuman) {
    subjectBlocks.push("human", "humans", "person", "people", "man", "woman", "businessman", "suit", "face", "portrait");
  }

  if (!wantsAnimal) {
    subjectBlocks.push("animal", "animals", "cat", "dog", "rabbit", "pet");
  }

  if (!wantsFood) {
    subjectBlocks.push("food", "meal", "restaurant", "table", "plate", "fries", "burger");
  }

  if (!wantsRobot) {
    subjectBlocks.push("robot", "robots", "android", "mecha");
  } else {
    subjectBlocks.push("human", "man", "woman", "animal", "dog", "cat", "food");
  }

  if (wantsAnimal) {
    subjectBlocks.push("robot", "car", "office", "restaurant", "table", "food");
  }

  if (!wantsVehicle) {
    subjectBlocks.push("car", "vehicle");
  }

  if (!wantsOffice) {
    subjectBlocks.push("office", "desk", "business meeting");
  }

  subjectBlocks.push("Paris", "Eiffel tower", "random objects", "unrelated subject");

  return [...new Set([...subjectBlocks, ...BASE_IMAGE_NEGATIVE_PROMPT.split(", ")])].join(", ");
}

async function translateArabicToEnglishV2(userPrompt) {
  const raw = String(userPrompt || "").trim();
  if (!hasArabicText(raw)) {
    return raw;
  }

  const text = normalizeArabicPromptV2(raw);
  const color = hasArabicPromptTermV2(text, "black")
    ? "black"
    : hasArabicPromptTermV2(text, "yellow")
      ? "yellow"
      : hasArabicPromptTermV2(text, "red")
        ? "red"
        : hasArabicPromptTermV2(text, "blue")
          ? "blue"
          : hasArabicPromptTermV2(text, "green")
            ? "green"
            : "";
  const colorPrefix = color ? `${color} ` : "";
  const wantsCat = hasArabicPromptTermV2(text, "cat");
  const wantsDog = hasArabicPromptTermV2(text, "dog");
  const wantsRobot = hasArabicPromptTermV2(text, "robot");
  const wantsMoon = hasArabicPromptTermV2(text, "moon");
  const wantsGarden = hasArabicPromptTermV2(text, "garden");
  const wantsGroup = hasArabicPromptTermV2(text, "group");
  const wantsBusinessman = hasArabicPromptTermV2(text, "businessman");
  const wantsMan = hasArabicPromptTermV2(text, "man");
  const wantsWoman = hasArabicPromptTermV2(text, "woman");
  const wantsCar = hasArabicPromptTermV2(text, "car");

  if (wantsCat && wantsDog) {
    const location = wantsGarden ? " inside a garden" : "";
    return `${colorPrefix}cat next to a ${colorPrefix}dog${location}, realistic photo, both animals clearly visible, full body animals, no humans, no food, no text, no watermark.`;
  }

  if (wantsRobot) {
    const subject = wantsGroup ? `${colorPrefix}robot and a group of ${colorPrefix}robots` : `${colorPrefix}robot`;
    const location = wantsMoon ? " standing on the surface of the moon, lunar landscape" : "";
    return `${subject}${location}, sci-fi realistic image, full body robots, no humans, no animals, no food, no text, no watermark.`;
  }

  if (wantsBusinessman || (wantsMan && (hasArabicPromptTermV2(text, "suit") || hasArabicPromptTermV2(text, "office")))) {
    const handsome = hasArabicPromptTermV2(text, "handsome") ? "handsome " : "";
    const outfit = hasArabicPromptTermV2(text, "suit") ? "wearing an elegant formal suit" : "wearing professional business attire";
    const location = hasArabicPromptTermV2(text, "office") ? " inside a modern luxury office" : "";
    return `A ${handsome}male businessman ${outfit}${location}, realistic professional photo, cinematic lighting, sharp details, clean corporate background, no text, no watermark.`;
  }

  if (wantsCat) {
    const location = wantsGarden ? " inside a garden" : "";
    return `${colorPrefix}cat${location}, realistic photo, full body cat clearly visible, no humans, no food, no text, no watermark.`;
  }

  if (wantsDog) {
    const location = wantsGarden ? " inside a garden" : "";
    return `${colorPrefix}dog${location}, realistic photo, full body dog clearly visible, no humans, no food, no text, no watermark.`;
  }

  if (wantsCar) {
    const future = hasArabicPromptTermV2(text, "future") ? "futuristic " : "";
    const street = hasArabicPromptTermV2(text, "street") ? " on a city street" : "";
    const lit = hasArabicPromptTermV2(text, "lit") ? " with dramatic night lighting" : "";
    return `${future}car${street}${lit}, realistic automotive photo, clean composition, no people, no text, no watermark.`;
  }

  if (wantsWoman) {
    return "Female subject as requested, realistic professional photo, clean composition, no text, no watermark.";
  }

  if (wantsMan) {
    return "Male subject as requested, realistic professional photo, clean composition, no text, no watermark.";
  }

  const fallbackTerms = Object.entries(ARABIC_PROMPT_TERMS_V2)
    .filter(([, patterns]) => patterns.some((pattern) => pattern.test(text)))
    .map(([key]) => key.replace(/([A-Z])/g, " $1").toLowerCase());

  return `${fallbackTerms.join(", ") || "the requested main subject"}, realistic professional image, main subject clearly visible, no unrelated people, no food, no text, no watermark.`;
}

async function buildFinalImagePromptV2(userPrompt, quality, style) {
  const translatedPrompt = await translateArabicToEnglishV2(userPrompt);
  const styleText = String(style || "").trim();
  const qualityHints = {
    normal: "clean composition, clear subject, good lighting",
    high: "high quality, realistic details, sharp focus, professional lighting",
    ultra: "ultra detailed, premium composition, realistic textures, cinematic lighting",
  };

  return [
    "Create an image that follows this request exactly:",
    translatedPrompt,
    "",
    "Strict rules:",
    "- Follow the subject exactly.",
    "- Do not reuse any previous subject, previous prompt, cached result, or reference image.",
    "- Do not add humans unless the request asks for humans.",
    "- Do not add food unless the request asks for food.",
    "- Do not add unrelated settings, props, or random objects.",
    "- No text, no watermark, no logo, no grid.",
    "- Realistic professional image.",
    "- Main subject must be clearly visible, centered, fully visible, and not cropped.",
    `Quality direction: ${qualityHints[quality] || qualityHints.normal}.`,
    styleText ? `Visual style: ${styleText}.` : "",
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
      endpoint:
        process.env.BFL_ULTRA_API_URL ||
        process.env.BFL_HIGH_API_URL ||
        process.env.BFL_API_URL ||
        "https://api.bfl.ai/v1/flux-pro-1.1",
      model: process.env.BFL_ULTRA_MODEL || process.env.BFL_HIGH_MODEL || "flux-pro-1.1",
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

async function postToBfl({ apiKey, prompt, quality, style, requestId, seed: requestedSeed }) {
  const { endpoint, model } = getFluxModelConfig(quality);
  const finalPrompt = await buildFinalImagePromptV2(prompt, quality, style);
  const negativePrompt = buildDynamicNegativePromptV2(prompt);
  const seed = Number.isFinite(Number(requestedSeed)) ? Number(requestedSeed) : randomSeed();
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
  console.log("REQUEST_ID:", requestId);
  console.log("SEED:", seed);
  console.log(
    "BFL BODY SENT:",
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

export async function generateFluxImage({ prompt, quality = "normal", style = "", requestId = "", seed }) {
  const apiKey = requireApiKey();
  const { data: initial, model, finalPrompt, seed: finalSeed } = await postToBfl({
    apiKey,
    prompt,
    quality,
    style,
    requestId,
    seed,
  });
  const resultUrl = await pollBflResult({ apiKey, initial });

  console.log(
    "IMAGE_GENERATION_RESULT:",
    JSON.stringify({
      userPrompt: compactForLog(prompt),
      finalPrompt: compactForLog(finalPrompt, 1400),
      model,
      seed: finalSeed,
      resultUrl,
    })
  );

  return {
    provider: "bfl",
    model,
    finalPrompt,
    seed: finalSeed,
    resultUrl,
    raw: initial,
  };
}

export async function debugGenerateFixedFluxImage() {
  const apiKey = requireApiKey();
  const endpoint =
    process.env.BFL_DEBUG_API_URL ||
    process.env.BFL_API_URL ||
    "https://api.bfl.ai/v1/flux-pro-1.1";
  const model = process.env.BFL_DEBUG_MODEL || process.env.BFL_HIGH_MODEL || "flux-pro-1.1";
  const body = {
    prompt:
      "Black cat sitting next to a black dog, realistic photo, full body animals, clean background, no humans, no food, no text, no watermark",
    width: 1024,
    height: 1024,
    steps: 28,
  };

  console.log("BFL DEBUG MODEL:", model);
  console.log("BFL BODY SENT:", JSON.stringify(body, null, 2));

  const response = await fetch(endpoint, {
    method: "POST",
    cache: "no-store",
    headers: {
      accept: "application/json",
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "x-key": apiKey,
    },
    body: JSON.stringify(body),
  });

  const data = await readJsonResponse(response);
  console.log(
    "BFL DEBUG RESPONSE:",
    JSON.stringify({
      ok: response.ok,
      status: response.status,
      responseKeys: data && typeof data === "object" ? Object.keys(data).slice(0, 12) : [],
    })
  );

  if (!response.ok) {
    const message = data?.detail || data?.message || data?.error || "فشل اختبار BFL المباشر.";
    throw serviceError(typeof message === "string" ? message : JSON.stringify(message), response.status >= 500 ? 502 : 400);
  }

  const resultUrl = await pollBflResult({ apiKey, initial: data });
  console.log("BFL DEBUG NEW RESULT URL:", resultUrl);

  return {
    provider: "bfl",
    model,
    prompt: body.prompt,
    resultUrl,
    raw: data,
  };
}
