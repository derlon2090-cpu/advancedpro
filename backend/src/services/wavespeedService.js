import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  ALLOWED_NATIVE_DURATIONS_BY_MODEL,
  IMAGE_MODELS,
  MAX_VIDEO_DURATION_BY_QUALITY,
  VIDEO_MODELS,
  WAVE_IMAGE_ENDPOINTS,
  WAVE_IMAGE_MODEL_CANDIDATES,
  WAVE_IMAGE_MODELS,
  WAVE_VIDEO_ENDPOINTS,
  WAVE_VIDEO_MODEL_CANDIDATES,
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

const PROMPT_TRANSLATION_CACHE_LIMIT = 400;
const promptTranslationCache = new Map();
let promptTranslationCacheLoaded = false;
let promptTranslationCacheLoadPromise = null;

function promptTranslationCacheFilePath() {
  return path.join(process.cwd(), ".cache", "prompt-translation-cache.json");
}

function normalizePromptTranslationCacheKey(prompt) {
  const normalized = String(prompt || "").trim().replace(/\s+/g, " ").toLowerCase();
  return createHash("sha1").update(normalized).digest("hex");
}

function prunePromptTranslationCache() {
  if (promptTranslationCache.size <= PROMPT_TRANSLATION_CACHE_LIMIT) {
    return;
  }

  const entries = Array.from(promptTranslationCache.entries()).sort((a, b) => {
    const left = Date.parse(a[1]?.updatedAt || a[1]?.createdAt || 0) || 0;
    const right = Date.parse(b[1]?.updatedAt || b[1]?.createdAt || 0) || 0;
    return right - left;
  });

  promptTranslationCache.clear();
  for (const [key, value] of entries.slice(0, PROMPT_TRANSLATION_CACHE_LIMIT)) {
    promptTranslationCache.set(key, value);
  }
}

async function ensurePromptTranslationCacheLoaded() {
  if (promptTranslationCacheLoaded) {
    return;
  }

  if (!promptTranslationCacheLoadPromise) {
    promptTranslationCacheLoadPromise = (async () => {
      try {
        const filePath = promptTranslationCacheFilePath();
        const raw = await readFile(filePath, "utf8");
        const parsed = JSON.parse(raw);
        const entries = Array.isArray(parsed?.entries) ? parsed.entries : [];

        for (const entry of entries) {
          const prompt = String(entry?.prompt || "").trim();
          const translation = String(entry?.translation || "").trim();
          if (!prompt || !translation) continue;
          promptTranslationCache.set(String(entry.key || normalizePromptTranslationCacheKey(prompt)), {
            prompt,
            translation,
            createdAt: entry.createdAt || null,
            updatedAt: entry.updatedAt || null,
          });
        }
        prunePromptTranslationCache();
      } catch (_error) {
        // Best-effort local cache only.
      } finally {
        promptTranslationCacheLoaded = true;
      }
    })();
  }

  await promptTranslationCacheLoadPromise;
}

async function persistPromptTranslationCache() {
  try {
    await ensurePromptTranslationCacheLoaded();
    const filePath = promptTranslationCacheFilePath();
    await mkdir(path.dirname(filePath), { recursive: true });
    prunePromptTranslationCache();
    await writeFile(
      filePath,
      JSON.stringify(
        {
          entries: Array.from(promptTranslationCache.entries()).map(([key, value]) => ({
            key,
            prompt: value.prompt,
            translation: value.translation,
            createdAt: value.createdAt || null,
            updatedAt: value.updatedAt || null,
          })),
        },
        null,
        2
      ),
      "utf8"
    );
  } catch (error) {
    console.warn("PROMPT_TRANSLATION_CACHE_WRITE_ERROR:", error?.message || error);
  }
}

async function getCachedPromptTranslation(prompt) {
  await ensurePromptTranslationCacheLoaded();
  const key = normalizePromptTranslationCacheKey(prompt);
  const entry = promptTranslationCache.get(key);
  if (!entry?.translation) {
    return "";
  }

  entry.updatedAt = new Date().toISOString();
  return String(entry.translation || "").trim();
}

async function setCachedPromptTranslation(prompt, translation) {
  const cleanPrompt = String(prompt || "").trim();
  const cleanTranslation = String(translation || "").trim();
  if (!cleanPrompt || !cleanTranslation) {
    return;
  }

  await ensurePromptTranslationCacheLoaded();
  const key = normalizePromptTranslationCacheKey(cleanPrompt);
  const existing = promptTranslationCache.get(key);
  const now = new Date().toISOString();
  promptTranslationCache.set(key, {
    prompt: cleanPrompt,
    translation: cleanTranslation,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  });
  await persistPromptTranslationCache();
}

async function deleteCachedPromptTranslation(prompt) {
  const cleanPrompt = String(prompt || "").trim();
  if (!cleanPrompt) {
    return;
  }

  await ensurePromptTranslationCacheLoaded();
  const key = normalizePromptTranslationCacheKey(cleanPrompt);
  if (!promptTranslationCache.delete(key)) {
    return;
  }
  await persistPromptTranslationCache();
}

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
      "تعذر إتمام الطلب مؤقتًا، حاول لاحقًا.",
      500
    );
  }
  return apiKey;
}

function compactForLog(value, maxLength = 1200) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function promptVerboseLogsEnabled() {
  return String(process.env.PROMPT_VERBOSE_LOGS || "false").trim().toLowerCase() === "true";
}

function logPromptDiagnostics({ userPrompt, finalPrompt }) {
  if (promptVerboseLogsEnabled()) {
    console.log("USER_PROMPT:", userPrompt);
    console.log("FINAL_PROMPT:", finalPrompt);
    return;
  }

  console.log("PROMPT_DIAGNOSTICS:", {
    userPromptLength: String(userPrompt || "").length,
    finalPromptLength: String(finalPrompt || "").length,
    containsArabicInFinalPrompt: hasArabicText(finalPrompt),
  });
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

function includesWholePhrase(value, phrase) {
  const text = String(value || "").toLowerCase();
  const expected = String(phrase || "").toLowerCase().trim();
  if (!expected) return false;
  return text
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .join(" ")
    .split(" ")
    .includes(expected);
}

const COLOR_TERMS = {
  black: ["\u0623\u0633\u0648\u062f", "\u0627\u0633\u0648\u062f", "\u0633\u0648\u062f\u0627\u0621", "black"],
  white: ["\u0623\u0628\u064a\u0636", "\u0627\u0628\u064a\u0636", "\u0628\u064a\u0636\u0627\u0621", "white"],
  yellow: ["\u0623\u0635\u0641\u0631", "\u0627\u0635\u0641\u0631", "\u0635\u0641\u0631\u0627\u0621", "yellow"],
  gold: ["\u0630\u0647\u0628\u064a", "\u0630\u0647\u0628\u064a\u0629", "\u0630\u0647\u0628\u064a\u064b\u0627", "gold", "golden"],
  green: ["\u0623\u062e\u0636\u0631", "\u0627\u062e\u0636\u0631", "\u062e\u0636\u0631\u0627\u0621", "green"],
  red: ["\u0623\u062d\u0645\u0631", "\u0627\u062d\u0645\u0631", "\u062d\u0645\u0631\u0627\u0621", "red"],
  blue: ["\u0623\u0632\u0631\u0642", "\u0627\u0632\u0631\u0642", "\u0632\u0631\u0642\u0627\u0621", "blue"],
};

const ENTITY_TERMS = {
  cat: ["\u0642\u0637\u0629", "\u0642\u0637", "cat"],
  dog: ["\u0643\u0644\u0628", "dog"],
  bear: ["\u062f\u0628", "\u062f\u0628\u0629", "\u062f\u0628\u0628\u0629", "\u062f\u0628\u0628", "bear", "bears"],
  fish: ["\u0633\u0645\u0643\u0629", "\u0633\u0645\u0643", "fish", "fishes"],
  shark: ["\u0642\u0631\u0634", "\u0642\u0631\u0634\u0629", "\u0642\u0631\u0648\u0634", "shark", "sharks"],
  whale: ["\u062d\u0648\u062a", "\u062d\u064a\u062a\u0627\u0646", "whale", "whales"],
  dolphin: ["\u062f\u0644\u0641\u064a\u0646", "\u062f\u0644\u0627\u0641\u064a\u0646", "dolphin", "dolphins"],
  bird: ["\u0637\u0627\u0626\u0631", "\u0637\u064a\u0631", "\u0639\u0635\u0641\u0648\u0631", "\u0639\u0635\u0641\u0648\u0631\u0629", "bird", "birds"],
  falcon: ["\u0635\u0642\u0631", "\u0635\u0642\u0648\u0631", "falcon", "falcons"],
  eagle: ["\u0646\u0633\u0631", "\u0646\u0633\u0648\u0631", "eagle", "eagles"],
  person: [
    "\u0631\u062c\u0644",
    "\u0627\u0645\u0631\u0623\u0629",
    "\u0627\u0645\u0631\u0627\u0629",
    "\u0633\u064a\u062f\u0629",
    "\u0634\u062e\u0635",
    "\u0625\u0646\u0633\u0627\u0646",
    "\u0627\u0646\u0633\u0627\u0646",
    "\u0648\u0644\u062f",
    "\u0635\u0628\u064a",
    "\u0637\u0641\u0644",
    "\u0628\u0646\u062a",
    "\u0641\u062a\u0627\u0629",
    "\u0637\u0641\u0644\u0629",
    "man",
    "woman",
    "person",
    "human",
    "boy",
    "girl",
    "child",
    "kid",
  ],
  wolf: ["\u0630\u0626\u0628", "\u0630\u064a\u0628", "\u0630\u0626\u0627\u0628", "\u0630\u064a\u0627\u0628", "wolf", "wolves"],
  snake: ["\u062b\u0639\u0628\u0627\u0646", "\u062b\u0639\u0627\u0628\u064a\u0646", "\u0623\u0641\u0639\u0649", "\u0627\u0641\u0639\u0649", "\u0623\u0641\u0639\u0649", "snake", "snakes"],
  chicken: ["\u062f\u062c\u0627\u062c\u0629", "\u062f\u062c\u0627\u062c", "\u0641\u0631\u062e\u0629", "\u0643\u062a\u0643\u0648\u062a", "chicken", "hen", "rooster", "chick"],
  turtle: ["\u0633\u0644\u062d\u0641\u0627\u0629", "\u0633\u0644\u062d\u0641\u0627\u0647", "\u0633\u0644\u062d\u0641\u0627\u062a", "turtle", "turtles"],
  house: ["\u0628\u064a\u062a", "\u0645\u0646\u0632\u0644", "house", "home"],
  robot: ["\u0631\u0648\u0628\u0648\u062a", "\u0631\u0628\u0648\u062a", "\u0631\u064a\u0628\u0648\u062a", "\u0631\u0648\u0628\u0637", "robot"],
  ferrari: ["\u0641\u0631\u0627\u0631\u064a", "\u0641\u064a\u0631\u0627\u0631\u064a", "ferrari"],
  moon: ["\u0627\u0644\u0642\u0645\u0631", "\u0642\u0645\u0631", "moon"],
  space: ["\u0627\u0644\u0641\u0636\u0627\u0621", "\u0641\u0636\u0627\u0621", "\u0641\u0636\u0627\u0626\u064a", "\u0641\u0636\u0627\u0626\u064a\u0629", "outer space", "space"],
  garden: ["\u062d\u062f\u064a\u0642\u0629", "garden"],
  beach: ["\u0627\u0644\u0634\u0627\u0637\u0626", "\u0634\u0627\u0637\u0626", "\u0634\u0627\u0637\u064a", "\u0627\u0644\u0628\u062d\u0631", "\u0628\u062d\u0631", "beach", "seashore"],
  forest: ["\u0627\u0644\u063a\u0627\u0628\u0629", "\u063a\u0627\u0628\u0629", "\u0627\u0644\u063a\u0627\u0628\u0627\u062a", "\u063a\u0627\u0628\u0627\u062a", "forest", "woods", "woodland", "jungle"],
};

const PROFESSION_TERMS = {
  businessman: ["\u0631\u062c\u0644 \u0623\u0639\u0645\u0627\u0644", "\u0631\u062c\u0644 \u0627\u0639\u0645\u0627\u0644", "businessman"],
  doctor: ["\u0637\u0628\u064a\u0628", "\u0637\u0628\u064a\u0628\u0629", "doctor"],
  engineer: ["\u0645\u0647\u0646\u062f\u0633", "\u0645\u0647\u0646\u062f\u0633\u0629", "engineer"],
  teacher: ["\u0645\u0639\u0644\u0645", "\u0645\u0639\u0644\u0645\u0629", "\u0645\u062f\u0631\u0633", "\u0645\u062f\u0631\u0633\u0629", "teacher"],
  "police officer": ["\u0634\u0631\u0637\u064a", "\u0634\u0631\u0637\u064a\u0629", "\u0636\u0627\u0628\u0637 \u0634\u0631\u0637\u0629", "police officer"],
  astronaut: ["\u0631\u0627\u0626\u062f \u0641\u0636\u0627\u0621", "\u0631\u0627\u0626\u062f\u0629 \u0641\u0636\u0627\u0621", "astronaut"],
};

const PROFESSION_ATTIRE = {
  businessman: "wearing an elegant formal business suit",
  doctor: "wearing a clean professional medical coat",
  engineer: "wearing professional engineering attire",
  teacher: "wearing neat professional teaching attire",
  "police officer": "wearing a proper police uniform",
  astronaut: "wearing a complete astronaut space suit",
};

const V4_ENTITY_TERMS = {
  businessman: ["\u0631\u062c\u0644 \u0623\u0639\u0645\u0627\u0644", "\u0631\u062c\u0644 \u0627\u0639\u0645\u0627\u0644", "\u0631\u062c\u0644 \u0631\u0633\u0645\u064a", "businessman"],
  ferrari: ["\u0641\u0631\u0627\u0631\u064a", "\u0641\u064a\u0631\u0627\u0631\u064a", "ferrari"],
  blackDog: ["\u0643\u0644\u0628 \u0623\u0633\u0648\u062f", "\u0643\u0644\u0628 \u0627\u0633\u0648\u062f", "black dog"],
  car: ["\u0633\u064a\u0627\u0631\u0629", "\u0635\u064a\u0627\u0631\u0629", "\u0639\u0631\u0628\u0629", "car"],
  inside: ["\u062f\u0627\u062e\u0644", "\u0631\u0627\u0643\u0628", "\u064a\u0642\u0648\u062f", "inside", "riding", "driving"],
  nextTo: ["\u0628\u062c\u0627\u0646\u0628\u0647", "\u0628\u062c\u0627\u0646\u0628", "\u0645\u0639\u0647", "next to", "beside", "with him"],
};

const COUNTABLE_ENTITIES = [
  {
    singular: "robot",
    plural: "robots",
    terms: ["\u0631\u0648\u0628\u0648\u062a\u0627\u062a", "\u0631\u0628\u0648\u062a\u0627\u062a", "\u0631\u0648\u0628\u0648\u062a", "\u0631\u0628\u0648\u062a", "\u0631\u064a\u0628\u0648\u062a", "\u0631\u0648\u0628\u0637", "robots", "robot"],
    dualTerms: ["\u0631\u0648\u0628\u0648\u062a\u0627\u0646", "\u0631\u0648\u0628\u0648\u062a\u064a\u0646", "\u0631\u0628\u0648\u062a\u0627\u0646", "\u0631\u0628\u0648\u062a\u064a\u0646"],
  },
  {
    singular: "cat",
    plural: "cats",
    terms: ["\u0642\u0637\u0637", "\u0642\u0637\u0629", "\u0642\u0637", "cats", "cat"],
    dualTerms: ["\u0642\u0637\u062a\u0627\u0646", "\u0642\u0637\u062a\u064a\u0646"],
  },
  {
    singular: "dog",
    plural: "dogs",
    terms: ["\u0643\u0644\u0627\u0628", "\u0643\u0644\u0628", "dogs", "dog"],
    dualTerms: ["\u0643\u0644\u0628\u0627\u0646", "\u0643\u0644\u0628\u064a\u0646"],
  },
  {
    singular: "fish",
    plural: "fish",
    terms: ["\u0633\u0645\u0643\u0627\u062a", "\u0633\u0645\u0643\u0629", "\u0633\u0645\u0643", "fishes", "fish"],
    dualTerms: ["\u0633\u0645\u0643\u062a\u0627\u0646", "\u0633\u0645\u0643\u062a\u064a\u0646"],
  },
  {
    singular: "shark",
    plural: "sharks",
    terms: ["\u0642\u0631\u0648\u0634", "\u0642\u0631\u0634", "\u0642\u0631\u0634\u0629", "sharks", "shark"],
    dualTerms: ["\u0642\u0631\u0634\u0627\u0646", "\u0642\u0631\u0634\u064a\u0646"],
  },
  {
    singular: "whale",
    plural: "whales",
    terms: ["\u062d\u064a\u062a\u0627\u0646", "\u062d\u0648\u062a", "whales", "whale"],
    dualTerms: ["\u062d\u0648\u062a\u0627\u0646", "\u062d\u0648\u062a\u064a\u0646"],
  },
  {
    singular: "dolphin",
    plural: "dolphins",
    terms: ["\u062f\u0644\u0627\u0641\u064a\u0646", "\u062f\u0644\u0641\u064a\u0646", "dolphins", "dolphin"],
    dualTerms: ["\u062f\u0644\u0641\u064a\u0646\u0627\u0646", "\u062f\u0644\u0641\u064a\u0646\u064a\u0646"],
  },
  {
    singular: "chicken",
    plural: "chickens",
    terms: ["\u062f\u062c\u0627\u062c\u0627\u062a", "\u062f\u062c\u0627\u062c", "\u062f\u062c\u0627\u062c\u0629", "\u0641\u0631\u062e\u0627\u062a", "\u0641\u0631\u062e\u0629", "\u0643\u062a\u0627\u0643\u064a\u062a", "\u0643\u062a\u0643\u0648\u062a", "chickens", "chicken", "hens", "hen", "roosters", "rooster", "chicks", "chick"],
    dualTerms: ["\u062f\u062c\u0627\u062c\u062a\u0627\u0646", "\u062f\u062c\u0627\u062c\u062a\u064a\u0646", "\u0641\u0631\u062e\u062a\u0627\u0646", "\u0641\u0631\u062e\u062a\u064a\u0646", "\u0643\u062a\u0643\u0648\u062a\u0627\u0646", "\u0643\u062a\u0643\u0648\u062a\u064a\u0646"],
  },
  {
    singular: "person",
    plural: "people",
    terms: [
      "\u0623\u0634\u062e\u0627\u0635",
      "\u0627\u0634\u062e\u0627\u0635",
      "\u0634\u062e\u0635",
      "\u0631\u062c\u0644",
      "\u0627\u0645\u0631\u0623\u0629",
      "\u0627\u0645\u0631\u0627\u0629",
      "\u0633\u064a\u062f\u0629",
      "\u0648\u0644\u062f",
      "\u0635\u0628\u064a",
      "\u0637\u0641\u0644",
      "\u0628\u0646\u062a",
      "\u0641\u062a\u0627\u0629",
      "\u0637\u0641\u0644\u0629",
      "people",
      "persons",
      "person",
      "man",
      "woman",
      "boy",
      "girl",
      "child",
    ],
    dualTerms: [
      "\u0634\u062e\u0635\u0627\u0646",
      "\u0634\u062e\u0635\u064a\u0646",
      "\u0648\u0644\u062f\u0627\u0646",
      "\u0648\u0644\u062f\u064a\u0646",
      "\u0628\u0646\u062a\u0627\u0646",
      "\u0628\u0646\u062a\u064a\u0646",
      "\u0637\u0641\u0644\u0627\u0646",
      "\u0637\u0641\u0644\u064a\u0646",
    ],
  },
];

const COUNT_WORDS = [
  { count: 10, terms: ["\u0639\u0634\u0631\u0629", "\u0639\u0634\u0631", "ten"] },
  { count: 9, terms: ["\u062a\u0633\u0639\u0629", "\u062a\u0633\u0639", "nine"] },
  { count: 8, terms: ["\u062b\u0645\u0627\u0646\u064a\u0629", "\u062b\u0645\u0627\u0646", "eight"] },
  { count: 7, terms: ["\u0633\u0628\u0639\u0629", "\u0633\u0628\u0639", "seven"] },
  { count: 6, terms: ["\u0633\u062a\u0629", "\u0633\u062a", "six"] },
  { count: 5, terms: ["\u062e\u0645\u0633\u0629", "\u062e\u0645\u0633", "five"] },
  { count: 4, terms: ["\u0623\u0631\u0628\u0639\u0629", "\u0627\u0631\u0628\u0639\u0629", "\u0623\u0631\u0628\u0639", "\u0627\u0631\u0628\u0639", "four"] },
  { count: 3, terms: ["\u062b\u0644\u0627\u062b\u0629", "\u062b\u0644\u0627\u062b", "three"] },
  { count: 2, terms: ["\u0627\u062b\u0646\u0627\u0646", "\u0625\u062b\u0646\u0627\u0646", "\u0627\u062b\u0646\u064a\u0646", "\u0625\u062b\u0646\u064a\u0646", "two"] },
  { count: 1, terms: ["\u0648\u0627\u062d\u062f\u0629", "\u0648\u0627\u062d\u062f", "one"] },
];

const COUNT_LABELS = {
  1: "one",
  2: "two",
  3: "three",
  4: "four",
  5: "five",
  6: "six",
  7: "seven",
  8: "eight",
  9: "nine",
  10: "ten",
};

const SINGLE_SUBJECT_KEYWORDS = [
  { key: "fish", terms: ["\u0633\u0645\u0643\u0629", "\u0633\u0645\u0643", "fish"] },
  { key: "shark", terms: ["\u0642\u0631\u0634", "\u0642\u0631\u0634\u0629", "shark"] },
  { key: "whale", terms: ["\u062d\u0648\u062a", "whale"] },
  { key: "dolphin", terms: ["\u062f\u0644\u0641\u064a\u0646", "dolphin"] },
  { key: "chicken", terms: ["\u062f\u062c\u0627\u062c\u0629", "\u0641\u0631\u062e\u0629", "\u0643\u062a\u0643\u0648\u062a", "chicken", "hen", "rooster", "chick"] },
  { key: "cat", terms: ["\u0642\u0637\u0629", "\u0642\u0637", "cat"] },
  { key: "dog", terms: ["\u0643\u0644\u0628", "dog"] },
  { key: "bear", terms: ["\u062f\u0628", "\u062f\u0628\u0629", "bear"] },
  { key: "person", terms: ["\u0631\u062c\u0644", "\u0627\u0645\u0631\u0623\u0629", "\u0627\u0645\u0631\u0627\u0629", "\u0634\u062e\u0635", "\u0625\u0646\u0633\u0627\u0646", "\u0627\u0646\u0633\u0627\u0646", "man", "woman", "person", "human"] },
  { key: "robot", terms: ["\u0631\u0648\u0628\u0648\u062a", "\u0631\u0628\u0648\u062a", "\u0631\u064a\u0628\u0648\u062a", "\u0631\u0648\u0628\u0637", "robot"] },
  { key: "car", terms: ["\u0633\u064a\u0627\u0631\u0629", "\u0639\u0631\u0628\u0629", "car", "vehicle"] },
];

const MULTI_SUBJECT_MARKERS = [
  "\u0639\u062f\u0629",
  "\u0645\u062a\u0639\u062f\u062f",
  "\u0645\u062c\u0645\u0648\u0639\u0629",
  "\u0643\u062b\u064a\u0631",
  "\u0643\u062b\u064a\u0631\u0629",
  "\u0643\u062b\u064a\u0631 \u0645\u0646",
  "\u0642\u0637\u0637",
  "\u0643\u0644\u0627\u0628",
  "\u0633\u0645\u0643\u0627\u062a",
  "\u0642\u0631\u0648\u0634",
  "\u062d\u064a\u062a\u0627\u0646",
  "\u062f\u0644\u0627\u0641\u064a\u0646",
  "\u062f\u062c\u0627\u062c\u0627\u062a",
  "\u0631\u062c\u0627\u0644",
  "\u0646\u0633\u0627\u0621",
  "\u0623\u0634\u062e\u0627\u0635",
  "\u0627\u0634\u062e\u0627\u0635",
  "\u0631\u0648\u0628\u0648\u062a\u0627\u062a",
  "\u0633\u064a\u0627\u0631\u0627\u062a",
  "many",
  "multiple",
  "several",
  "group of",
  "collection of",
  "cats",
  "dogs",
  "fishes",
  "sharks",
  "whales",
  "dolphins",
  "chickens",
  "people",
  "robots",
  "cars",
];

const GLOBAL_COLLAGE_NEGATIVE_RULES = [
  "collage",
  "contact sheet",
  "multiple images",
  "grid layout",
  "photo grid",
  "tiled images",
  "tiled layout",
  "duplicate subject",
  "duplicate subjects",
  "repeated object",
  "image mosaic",
  "gallery layout",
  "multiple frames",
  "comic panel",
  "storyboard",
];

function detectProfession(text) {
  for (const [profession, terms] of Object.entries(PROFESSION_TERMS)) {
    if (includesAny(text, terms)) return profession;
  }
  return null;
}

function normalizeArabicDigits(value) {
  return String(value || "")
    .replace(/[\u0660-\u0669]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0));
}

function detectRequestedCount(userPrompt) {
  const text = normalizeArabicDigits(userPrompt).toLowerCase();

  for (const entity of COUNTABLE_ENTITIES) {
    if (entity.dualTerms.some((term) => text.includes(term))) {
      return { count: 2, singular: entity.singular, plural: entity.plural };
    }

    for (const term of entity.terms) {
      const entityIndex = text.indexOf(term);
      if (entityIndex === -1) continue;

      const before = text.slice(Math.max(0, entityIndex - 24), entityIndex).trim();
      const digitMatch = before.match(/(\d{1,2})\s*$/);
      if (digitMatch) {
        const count = Number(digitMatch[1]);
        if (count > 0 && count <= 20) {
          return { count, singular: entity.singular, plural: entity.plural };
        }
      }

      for (const number of COUNT_WORDS) {
        if (number.terms.some((word) => before.endsWith(word))) {
          return { count: number.count, singular: entity.singular, plural: entity.plural };
        }
      }
    }
  }

  return null;
}

function buildCountRules(userPrompt) {
  const requested = detectRequestedCount(userPrompt);
  if (!requested) return [];

  const countLabel = COUNT_LABELS[requested.count] || String(requested.count);
  const entityLabel = requested.count === 1 ? requested.singular : requested.plural;
  const visibility =
    requested.count === 1
      ? `The single ${requested.singular} must be fully visible.`
      : requested.count === 2
      ? `Both ${requested.plural} must be fully visible.`
      : `All ${countLabel} ${requested.plural} must be fully visible.`;

  return [
    `Exactly ${countLabel} ${entityLabel}.`,
    visibility,
    `Do not add or remove any ${requested.singular}.`,
    "Do not duplicate any subject.",
  ];
}

function includesKeywordTerm(value, term) {
  const text = String(value || "").toLowerCase();
  const expected = String(term || "").toLowerCase().trim();
  if (!expected) return false;
  return expected.includes(" ") ? text.includes(expected) : includesWholePhrase(text, expected);
}

function includesAnyKeywordTerm(value, terms) {
  return terms.some((term) => includesKeywordTerm(value, term));
}

function detectSingleSubjectIntent(userPrompt) {
  const text = normalizeArabicDigits(userPrompt).toLowerCase();
  const requested = detectRequestedCount(userPrompt);
  if (requested && requested.count !== 1) {
    return null;
  }

  if (includesAny(text, MULTI_SUBJECT_MARKERS)) {
    return null;
  }

  const matchedSubjects = SINGLE_SUBJECT_KEYWORDS
    .filter((entry) => includesAnyKeywordTerm(text, entry.terms))
    .map((entry) => entry.key);

  if (matchedSubjects.length !== 1) {
    return null;
  }

  return matchedSubjects[0];
}

function buildSingleSubjectRules(userPrompt) {
  if (!detectSingleSubjectIntent(userPrompt)) {
    return [];
  }

  return [
    "ONE SUBJECT ONLY.",
    "NO DUPLICATES.",
    "NO COLLAGE.",
    "NO GRID.",
    "Use a full-frame composition.",
    "Keep the single main subject centered and clearly visible.",
    "Do not create multiple images, repeated subjects, or repeated objects.",
    "Use a professional photography composition.",
  ];
}

function pluralMarineKeywordRequested(text, singular, plural) {
  return includesAny(text, [plural, `${plural}s`, `${singular}s`]);
}

function detectColorForEntity(text, entityKey) {
  const entityTerms = ENTITY_TERMS[entityKey] || [];
  if (!includesAny(text, entityTerms)) return null;

  const normalizedText = String(text || "").toLowerCase();
  const entityMatches = [];
  for (const term of entityTerms) {
    let startIndex = normalizedText.indexOf(term);
    while (startIndex !== -1) {
      entityMatches.push({
        start: startIndex,
        center: startIndex + term.length / 2,
      });
      startIndex = normalizedText.indexOf(term, startIndex + term.length);
    }
  }

  let closest = null;
  for (const [color, terms] of Object.entries(COLOR_TERMS)) {
    for (const term of terms) {
      let startIndex = normalizedText.indexOf(term);
      while (startIndex !== -1) {
        const colorCenter = startIndex + term.length / 2;
        for (const entityMatch of entityMatches) {
          const distance = Math.abs(colorCenter - entityMatch.center);
          if (distance <= 32 && (!closest || distance < closest.distance)) {
            closest = { color, distance };
          }
        }
        startIndex = normalizedText.indexOf(term, startIndex + term.length);
      }
    }
  }

  return closest?.color || null;
}

function firstDetectedColor(text) {
  for (const [color, terms] of Object.entries(COLOR_TERMS)) {
    if (includesAny(text, terms)) return color;
  }
  return null;
}

function analyzePromptV4(userPrompt) {
  const text = String(userPrompt || "").trim();
  const lower = text.toLowerCase();
  const hasBusinessman = includesAny(lower, V4_ENTITY_TERMS.businessman);
  const hasFerrari = includesAny(lower, V4_ENTITY_TERMS.ferrari);
  const hasBlackDog = includesAny(lower, V4_ENTITY_TERMS.blackDog);
  const hasCar = includesAny(lower, V4_ENTITY_TERMS.car);
  const hasInside = includesAny(lower, V4_ENTITY_TERMS.inside);
  const hasNextTo = includesAny(lower, V4_ENTITY_TERMS.nextTo);
  const hasRealistic = includesAny(lower, ["\u0648\u0627\u0642\u0639\u064a", "\u0648\u0627\u0642\u0639\u064a\u0629", "realistic"]);

  if (hasBusinessman && hasFerrari && hasBlackDog) {
    const ferrariColor = includesAny(lower, [
      "\u0641\u0631\u0627\u0631\u064a \u0633\u0648\u062f\u0627\u0621",
      "\u0641\u0631\u0627\u0631\u064a \u0627\u0633\u0648\u062f",
      "\u0641\u0631\u0627\u0631\u064a \u0623\u0633\u0648\u062f",
      "\u0641\u064a\u0631\u0627\u0631\u064a \u0633\u0648\u062f\u0627\u0621",
      "\u0641\u064a\u0631\u0627\u0631\u064a \u0627\u0633\u0648\u062f",
      "\u0641\u064a\u0631\u0627\u0631\u064a \u0623\u0633\u0648\u062f",
      "black ferrari",
    ])
      ? "black Ferrari"
      : includesAny(lower, [
            "\u0641\u0631\u0627\u0631\u064a \u0628\u064a\u0636\u0627\u0621",
            "\u0641\u0631\u0627\u0631\u064a \u0627\u0628\u064a\u0636",
            "\u0641\u0631\u0627\u0631\u064a \u0623\u0628\u064a\u0636",
            "\u0641\u064a\u0631\u0627\u0631\u064a \u0628\u064a\u0636\u0627\u0621",
            "\u0641\u064a\u0631\u0627\u0631\u064a \u0627\u0628\u064a\u0636",
            "\u0641\u064a\u0631\u0627\u0631\u064a \u0623\u0628\u064a\u0636",
            "white ferrari",
          ])
        ? "white Ferrari"
        : includesAny(lower, [
              "\u0641\u0631\u0627\u0631\u064a \u0632\u0631\u0642\u0627\u0621",
              "\u0641\u0631\u0627\u0631\u064a \u0627\u0632\u0631\u0642",
              "\u0641\u0631\u0627\u0631\u064a \u0623\u0632\u0631\u0642",
              "\u0641\u064a\u0631\u0627\u0631\u064a \u0632\u0631\u0642\u0627\u0621",
              "\u0641\u064a\u0631\u0627\u0631\u064a \u0627\u0632\u0631\u0642",
              "\u0641\u064a\u0631\u0627\u0631\u064a \u0623\u0632\u0631\u0642",
              "blue ferrari",
            ])
          ? "blue Ferrari"
          : "red Ferrari";
    const dogRelation = hasNextTo ? "next to him" : "with him";

    return {
      subject: "businessman",
      subjectColor: null,
      object: "Ferrari car",
      objectColor: ferrariColor,
      relation: `sitting inside, black dog ${dogRelation}`,
      enhancedPrompt: [
        "صورة واقعية عالية الجودة لرجل أعمال أنيق يرتدي بدلة رسمية،",
        `يجلس داخل سيارة فراري فاخرة${ferrariColor === "red Ferrari" ? " حمراء" : ""}،`,
        "وبجانبه كلب أسود واضح داخل الإطار.",
        "يجب أن تظهر سيارة الفراري بوضوح، ويظهر الرجل والكلب الأسود معًا في نفس الصورة، بدون حذف أي عنصر.",
      ].join(" "),
      finalPrompt: [
        "A realistic high-quality photo of an elegant businessman wearing a formal suit, sitting inside a luxury Ferrari car.",
        `The Ferrari must be a clearly visible ${ferrariColor} sports car.`,
        "A black dog is clearly sitting next to him.",
        "The Ferrari car, the businessman, and the black dog must all be clearly visible in the same frame.",
        "The businessman is sitting inside / riding in the Ferrari car, not in an office.",
        "The black dog is next to him, side by side, both visible in the same frame.",
        "Do not remove any subject.",
        "Do not replace the Ferrari with an office, desk, meeting room, restaurant, or food scene.",
        "Do not change the black dog color.",
        "No extra people, no text, no watermark.",
      ].join(" "),
      negativeRules: [
        "office",
        "desk",
        "meeting room",
        "restaurant",
        "food",
        "woman",
        "extra people",
        "wrong car",
        "missing dog",
        "white dog",
        "brown dog",
        "text",
        "watermark",
        "logo",
      ],
      debug: {
        subjects: ["businessman", "Ferrari car", "black dog"],
        relations: hasInside || hasCar
          ? ["businessman sitting inside the Ferrari car", "black dog next to him"]
          : ["businessman with Ferrari car", "black dog next to him"],
        scene: "inside a luxury Ferrari car",
        style: hasRealistic ? "realistic photo" : "high-quality realistic photo",
      },
    };
  }

  return null;
}

function analyzePromptV3(userPrompt) {
  const text = String(userPrompt || "").trim();
  const lower = text.toLowerCase();
  const v4 = analyzePromptV4(text);
  if (v4) return v4;

  const hasCat = includesAny(lower, ["\u0642\u0637", "cat"]);
  const hasDog = includesAny(lower, ["\u0643\u0644\u0628", "dog"]);
  const hasBear = includesAny(lower, ENTITY_TERMS.bear);
  const hasBoy = includesAny(lower, ["\u0648\u0644\u062f", "\u0635\u0628\u064a", "boy"]);
  const hasGirl = includesAny(lower, ["\u0628\u0646\u062a", "\u0641\u062a\u0627\u0629", "\u0637\u0641\u0644\u0629", "girl"]);
  const hasChild = includesAny(lower, ["\u0637\u0641\u0644", "\u0648\u0644\u062f", "\u0635\u0628\u064a", "\u0628\u0646\u062a", "\u0641\u062a\u0627\u0629", "\u0637\u0641\u0644\u0629", "child", "kid", "boy", "girl"]);
  const hasChicken = includesAny(lower, ENTITY_TERMS.chicken);
  const hasFish = includesAny(lower, ENTITY_TERMS.fish);
  const hasShark = includesAny(lower, ENTITY_TERMS.shark);
  const hasWhale = includesAny(lower, ENTITY_TERMS.whale);
  const hasDolphin = includesAny(lower, ENTITY_TERMS.dolphin);
  const hasTurtle = includesAny(lower, ENTITY_TERMS.turtle);
  const hasWolf = includesAny(lower, ENTITY_TERMS.wolf);
  const hasWolfPups = includesAny(lower, [
    "\u0645\u0639 \u0635\u063a\u0627\u0631\u0647",
    "\u0645\u0639 \u0635\u063a\u0627\u0631\u0647\u0627",
    "\u0635\u063a\u0627\u0631 \u0627\u0644\u0630\u0626\u0628",
    "\u0635\u063a\u0627\u0631 \u0627\u0644\u0630\u064a\u0628",
    "\u062c\u0631\u0627\u0621 \u0627\u0644\u0630\u0626\u0628",
    "\u062c\u0631\u0627\u0621 \u0627\u0644\u0630\u064a\u0628",
    "wolf pups",
    "with its pups",
    "with his pups",
    "with her pups",
  ]);
  const hasSnake = includesAny(lower, ENTITY_TERMS.snake);
  const hasSnakeBabies = includesAny(lower, [
    "\u0645\u0639 \u0635\u063a\u0627\u0631\u0647",
    "\u0645\u0639 \u0635\u063a\u0627\u0631\u0647\u0627",
    "\u0635\u063a\u0627\u0631 \u0627\u0644\u062b\u0639\u0628\u0627\u0646",
    "\u0635\u063a\u0627\u0631 \u0627\u0644\u0623\u0641\u0639\u0649",
    "\u0635\u063a\u0627\u0631 \u0627\u0644\u0627\u0641\u0639\u0649",
    "\u062b\u0639\u0627\u0628\u064a\u0646 \u0635\u063a\u064a\u0631\u0629",
    "baby snakes",
    "snake hatchlings",
    "with its young",
  ]);
  const hasTurtleBabies = includesAny(lower, [
    "\u0639\u064a\u0627\u0644\u0647\u0627",
    "\u0635\u063a\u0627\u0631\u0647\u0627",
    "\u0623\u0637\u0641\u0627\u0644\u0647\u0627",
    "\u0627\u0637\u0641\u0627\u0644\u0647\u0627",
    "\u0635\u063a\u0627\u0631 \u0627\u0644\u0633\u0644\u062d\u0641\u0627\u0629",
    "baby turtles",
    "turtle hatchlings",
  ]);
  const hasBeach = includesAny(lower, ENTITY_TERMS.beach);
  const hasWaterScene = includesAny(lower, [
    "\u0627\u0644\u0645\u0627\u0621",
    "\u0645\u0627\u0621",
    "\u062a\u062d\u062a \u0627\u0644\u0645\u0627\u0621",
    "\u0641\u064a \u0627\u0644\u0645\u0627\u0621",
    "underwater",
    "ocean",
    "sea",
    "water",
  ]);
  const hasNearbyRelation = includesAny(lower, [
    "\u0628\u062c\u0627\u0646\u0628",
    "\u062c\u0646\u0628\u0647",
    "\u062c\u0646\u0628\u0647\u0627",
    "\u062c\u0646\u0628\u0647\u0645",
    "\u0628\u062c\u0648\u0627\u0631",
    "\u0628\u062c\u0648\u0627\u0631\u0647",
    "\u0628\u062c\u0648\u0627\u0631\u0647\u0627",
    "\u0628\u062c\u0648\u0627\u0631\u0647\u0645",
    "\u0645\u0639",
    "next to",
    "beside",
    "alongside",
  ]);
  const hasLargeSize = includesAny(lower, [
    "\u0643\u0628\u064a\u0631\u0629 \u0627\u0644\u062d\u062c\u0645",
    "\u0643\u0628\u064a\u0631 \u0627\u0644\u062d\u062c\u0645",
    "\u0636\u062e\u0645\u0629",
    "\u0636\u062e\u0645",
    "large",
    "giant",
  ]);
  const hasVeryLargeSize = includesAny(lower, [
    "\u0643\u0628\u064a\u0631\u0629 \u062c\u062f\u0627",
    "\u0643\u0628\u064a\u0631\u0629 \u062c\u062f\u064b\u0627",
    "\u0643\u0628\u064a\u0631 \u062c\u062f\u0627",
    "\u0643\u0628\u064a\u0631 \u062c\u062f\u064b\u0627",
    "\u0639\u0645\u0644\u0627\u0642\u0629",
    "\u0639\u0645\u0644\u0627\u0642",
    "\u0636\u062e\u0645\u0629 \u062c\u062f\u0627",
    "\u0636\u062e\u0645 \u062c\u062f\u0627",
    "extremely large",
    "very large",
    "oversized",
    "massive",
  ]);
  const hasVerySmallHuman = includesAny(lower, [
    "\u0635\u063a\u064a\u0631 \u062c\u062f\u0627",
    "\u0635\u063a\u064a\u0631 \u062c\u062f\u064b\u0627",
    "\u0635\u063a\u064a\u0631\u0629 \u062c\u062f\u0627",
    "\u0635\u063a\u064a\u0631\u0629 \u062c\u062f\u064b\u0627",
    "very small",
    "very young",
    "tiny",
  ]);
  const hasYoungHuman = includesAny(lower, [
    "\u0635\u063a\u064a\u0631",
    "\u0635\u063a\u064a\u0631\u0629",
    "\u0634\u0627\u0628",
    "\u0634\u0627\u0628\u0629",
    "young",
    "little",
    "small",
  ]);
  const hasBlack = includesAny(lower, COLOR_TERMS.black);
  const hasWhite = includesAny(lower, COLOR_TERMS.white);
  const hasGarden = includesAny(lower, ["\u062d\u062f\u064a\u0642\u0629", "garden"]);
  const hasMoon = includesAny(lower, ENTITY_TERMS.moon);
  const hasSpace = includesAny(lower, ENTITY_TERMS.space);
  const hasForest = includesAny(lower, ENTITY_TERMS.forest);
  const hasRobot = includesAny(lower, ENTITY_TERMS.robot);
  const hasRobots = includesAny(lower, ["\u0631\u0648\u0628\u0648\u062a\u0627\u062a", "\u0631\u0628\u0648\u062a\u0627\u062a", "robots"]);
  const hasFalcon = includesAny(lower, ENTITY_TERMS.falcon);
  const hasEagle = includesAny(lower, ENTITY_TERMS.eagle);
  const hasBird = hasFalcon || hasEagle || includesAny(lower, ENTITY_TERMS.bird);
  const hasNest = includesAny(lower, [
    "\u0639\u0634",
    "\u0639\u0634\u0647",
    "\u0639\u0634\u0647\u0627",
    "\u0639\u0634\u0647\u0645",
    "\u0639\u0634\u0634",
    "nest",
    "inside its nest",
    "in its nest",
  ]);
  const hasYellow = includesAny(lower, COLOR_TERMS.yellow);
  const hasGreen = includesAny(lower, COLOR_TERMS.green);
  const hasBeside = includesAny(lower, ["\u0628\u062c\u0627\u0646\u0628", "\u0645\u0639", "next to", "beside"]);
  const profession = detectProfession(lower);
  const hasMan = includesAny(lower, ["\u0631\u062c\u0644", "\u0634\u0627\u0628", "man", "male"]);
  const hasSuit = includesAny(lower, ["\u0628\u062f\u0644\u0629", "suit"]);
  const hasWearing = includesAny(lower, ["\u064a\u0631\u062a\u062f\u064a", "\u062a\u0631\u062a\u062f\u064a", "\u0644\u0627\u0628\u0633", "\u0644\u0627\u0628\u0633\u0629", "wearing", "wears"]);
  const hasOffice = includesAny(lower, ["\u0645\u0643\u062a\u0628", "office"]);
  const hasHandsome = includesAny(lower, ["\u0648\u0633\u064a\u0645", "handsome"]);
  const hasCar = includesAny(lower, V4_ENTITY_TERMS.car);
  const hasSports = includesAny(lower, ["\u0631\u064a\u0627\u0636\u064a\u0629", "sports"]);
  const hasNight = includesAny(lower, ["\u0644\u064a\u0644", "\u0644\u064a\u0644\u0627", "night"]);
  const hasStreet = includesAny(lower, ["\u0634\u0627\u0631\u0639", "street"]);
  const hasHouse = includesAny(lower, ENTITY_TERMS.house);
  const hasTop = includesAny(lower, ["\u0641\u0648\u0642", "\u0639\u0644\u0649 \u0633\u0637\u062d", "\u0633\u0637\u062d", "on top", "above", "roof"]);
  const hasInFront = includesAny(lower, ["\u0623\u0645\u0627\u0645", "\u0627\u0645\u0627\u0645", "in front"]);
  const hasInside = includesAny(lower, ["\u062f\u0627\u062e\u0644", "\u0641\u064a \u062f\u0627\u062e\u0644", "inside"]);
  const hasWoman = includesAny(lower, ["\u0627\u0645\u0631\u0623\u0629", "\u0627\u0645\u0631\u0627\u0629", "\u0633\u064a\u062f\u0629", "woman", "female"]);
  const catColor = detectColorForEntity(lower, "cat") || (hasCat ? firstDetectedColor(lower) : null);
  const dogColor = detectColorForEntity(lower, "dog") || (hasDog ? firstDetectedColor(lower) : null);
  const birdColor =
    (hasFalcon ? detectColorForEntity(lower, "falcon") : null) ||
    (hasEagle ? detectColorForEntity(lower, "eagle") : null) ||
    (hasBird ? detectColorForEntity(lower, "bird") : null) ||
    (hasBird ? firstDetectedColor(lower) : null);
  const chickenColor =
    detectColorForEntity(lower, "chicken") || (hasChicken && hasWhite ? "white" : hasChicken ? firstDetectedColor(lower) : null);
  const bearColor = detectColorForEntity(lower, "bear") || (hasBear ? firstDetectedColor(lower) : null);
  const fishColor = detectColorForEntity(lower, "fish") || (hasFish ? firstDetectedColor(lower) : null);
  const sharkColor = detectColorForEntity(lower, "shark") || (hasShark ? firstDetectedColor(lower) : null);
  const whaleColor = detectColorForEntity(lower, "whale") || (hasWhale ? firstDetectedColor(lower) : null);
  const dolphinColor = detectColorForEntity(lower, "dolphin") || (hasDolphin ? firstDetectedColor(lower) : null);
  const houseColor = detectColorForEntity(lower, "house") || (hasHouse && hasYellow ? "yellow" : null);
  const requestedCount = detectRequestedCount(userPrompt);
  const singleSubjectIntent = detectSingleSubjectIntent(userPrompt);
  const hasPluralFish = pluralMarineKeywordRequested(lower, "fish", "\u0633\u0645\u0643\u0627\u062a");
  const hasPluralSharks = pluralMarineKeywordRequested(lower, "shark", "\u0642\u0631\u0648\u0634");
  const hasPluralWhales = pluralMarineKeywordRequested(lower, "whale", "\u062d\u064a\u062a\u0627\u0646");
  const hasPluralDolphins = pluralMarineKeywordRequested(lower, "dolphin", "\u062f\u0644\u0627\u0641\u064a\u0646");
  const marineSubjectKinds = [hasFish, hasShark, hasWhale, hasDolphin].filter(Boolean).length;
  const marinePluralRequested =
    hasPluralFish ||
    hasPluralSharks ||
    hasPluralWhales ||
    hasPluralDolphins ||
    (requestedCount &&
      requestedCount.count > 1 &&
      ["fish", "shark", "whale", "dolphin"].includes(requestedCount.singular));

  if ((marineSubjectKinds > 1 || marinePluralRequested) && (hasFish || hasShark || hasWhale || hasDolphin)) {
    const subjectPhrases = [];
    const requiredVisibility = [];
    const promptRules = [];

    if (hasFish) {
      const fishPhrase = hasPluralFish || requestedCount?.plural === "fish"
        ? `multiple ${fishColor ? `${fishColor} ` : ""}fish`
        : `one ${fishColor ? `${fishColor} ` : ""}fish`;
      subjectPhrases.push(fishPhrase);
      requiredVisibility.push(hasPluralFish || requestedCount?.plural === "fish" ? "all requested fish" : "the fish");
      if (hasPluralFish || requestedCount?.plural === "fish") {
        promptRules.push("Show multiple fish, not a single fish.");
      }
    }

    if (hasShark) {
      const sharkSize = hasVeryLargeSize || hasLargeSize ? "huge " : "";
      const sharkPhrase = hasPluralSharks || requestedCount?.plural === "sharks"
        ? `multiple ${sharkColor ? `${sharkColor} ` : ""}${sharkSize}sharks`
        : `one ${sharkColor ? `${sharkColor} ` : ""}${sharkSize}shark`;
      subjectPhrases.push(sharkPhrase.trim());
      requiredVisibility.push(hasPluralSharks || requestedCount?.plural === "sharks" ? "all requested sharks" : "the shark");
      if (hasPluralSharks || requestedCount?.plural === "sharks") {
        promptRules.push("Show multiple sharks, not a single shark.");
      }
    }

    if (hasWhale) {
      const whaleSize = hasVeryLargeSize || hasLargeSize ? "huge " : "";
      const whalePhrase = hasPluralWhales || requestedCount?.plural === "whales"
        ? `multiple ${whaleColor ? `${whaleColor} ` : ""}${whaleSize}whales`
        : `one ${whaleColor ? `${whaleColor} ` : ""}${whaleSize}whale`;
      subjectPhrases.push(whalePhrase.trim());
      requiredVisibility.push(hasPluralWhales || requestedCount?.plural === "whales" ? "all requested whales" : "the whale");
      if (hasPluralWhales || requestedCount?.plural === "whales") {
        promptRules.push("Show multiple whales, not a single whale.");
      } else {
        promptRules.push("Show one whale only, unless multiple whales are explicitly requested.");
      }
      if (hasVeryLargeSize || hasLargeSize) {
        promptRules.push("The whale must look clearly huge and visually dominant in size.");
      }
    }

    if (hasDolphin) {
      const dolphinPhrase = hasPluralDolphins || requestedCount?.plural === "dolphins"
        ? `multiple ${dolphinColor ? `${dolphinColor} ` : ""}dolphins`
        : `one ${dolphinColor ? `${dolphinColor} ` : ""}dolphin`;
      subjectPhrases.push(dolphinPhrase);
      requiredVisibility.push(hasPluralDolphins || requestedCount?.plural === "dolphins" ? "all requested dolphins" : "the dolphin");
      if (hasPluralDolphins || requestedCount?.plural === "dolphins") {
        promptRules.push("Show at least two dolphins, not a single dolphin.");
      }
    }

    const relationText = hasNearbyRelation
      ? "swimming next to each other"
      : "swimming together";
    const scene = hasWaterScene || hasBeach
      ? "one natural underwater sea scene"
      : "one natural aquatic scene";
    const subjectSummary = subjectPhrases.join(" and ");
    const visibilitySummary = requiredVisibility.length > 1
      ? `${requiredVisibility.slice(0, -1).join(", ")} and ${requiredVisibility.at(-1)}`
      : requiredVisibility[0] || "every requested marine animal";

    promptRules.unshift(`Show ${subjectSummary} ${relationText} in ${scene}.`);
    promptRules.push(`Every requested marine animal must be fully visible in the same frame, including ${visibilitySummary}.`);
    promptRules.push("Keep the entire result inside one coherent full-frame composition with no cropped or separated animals.");
    promptRules.push("No collage, no split frames, no photo grid, no contact sheet, no framed tiles, and no repeated copies of any animal.");

    return {
      subject: "marine animals",
      subjectColor: null,
      object: hasWaterScene || hasBeach ? "sea environment" : "aquatic environment",
      objectColor: null,
      relation: relationText,
      enhancedPrompt: [
        "\u0635\u0648\u0631\u0629 \u0648\u0627\u0642\u0639\u064a\u0629 \u0644\u062d\u064a\u0648\u0627\u0646\u0627\u062a \u0628\u062d\u0631\u064a\u0629 \u0645\u0637\u0644\u0648\u0628\u0629 \u0643\u0644\u0647\u0627 \u0641\u064a \u0646\u0641\u0633 \u0627\u0644\u0645\u0634\u0647\u062f.",
        hasNearbyRelation
          ? "\u064a\u062c\u0628 \u0623\u0646 \u062a\u0638\u0647\u0631 \u0627\u0644\u062d\u064a\u0648\u0627\u0646\u0627\u062a \u0627\u0644\u0628\u062d\u0631\u064a\u0629 \u0628\u062c\u0627\u0646\u0628 \u0628\u0639\u0636\u0647\u0627 \u0641\u064a \u0646\u0641\u0633 \u0627\u0644\u0625\u0637\u0627\u0631."
          : "\u064a\u062c\u0628 \u0623\u0646 \u062a\u0638\u0647\u0631 \u0627\u0644\u062d\u064a\u0648\u0627\u0646\u0627\u062a \u0627\u0644\u0628\u062d\u0631\u064a\u0629 \u0645\u0639\u064b\u0627 \u0641\u064a \u0646\u0641\u0633 \u0627\u0644\u0625\u0637\u0627\u0631.",
        "\u0645\u0645\u0646\u0648\u0639 \u062a\u0642\u0633\u064a\u0645 \u0627\u0644\u0635\u0648\u0631\u0629 \u0623\u0648 \u062a\u0643\u0631\u0627\u0631 \u0627\u0644\u062d\u064a\u0648\u0627\u0646\u0627\u062a \u0623\u0648 \u0625\u0636\u0627\u0641\u0629 \u0645\u0634\u0627\u0647\u062f \u062c\u0627\u0646\u0628\u064a\u0629.",
      ].join(" "),
      finalPrompt: [
        `A realistic underwater wildlife image of ${subjectSummary} ${relationText}.`,
        `Use ${scene} only.`,
        "Every requested marine animal must be clearly visible in the same frame.",
        hasPluralDolphins ? "Show at least two dolphins, not a single dolphin." : "",
        hasPluralWhales ? "Show multiple whales, not a single whale." : "",
        hasPluralSharks ? "Show multiple sharks, not a single shark." : "",
        hasPluralFish ? "Show multiple fish, not a single fish." : "",
        hasWhale && (hasVeryLargeSize || hasLargeSize) ? "The whale must look clearly huge and dominant in size." : "",
        "No collage, no split frames, no photo grid, no duplicated animals, and no repeated copies.",
        "Professional wildlife photography, natural water lighting, sharp details, clean composition.",
      ].filter(Boolean).join(" "),
      promptRules,
      negativeRules: [
        "collage",
        "contact sheet",
        "multiple images",
        "grid layout",
        "photo grid",
        "tiled images",
        "split screen",
        "split panel",
        "panel dividers",
        "white borders",
        "white separator lines",
        "duplicate subjects",
        "repeated animals",
        "extra fish",
        "extra sharks",
        "extra whales",
        "extra dolphins",
        "humans",
        "people",
        "boats",
        "business meeting",
        "office",
        "food",
        "text",
        "watermark",
        "logo",
      ],
      debug: {
        subjects: subjectPhrases,
        relations: [relationText],
        scene,
        style: "realistic underwater wildlife photo",
      },
    };
  }

  if (
    (
      singleSubjectIntent === "fish" ||
      singleSubjectIntent === "shark" ||
      singleSubjectIntent === "whale" ||
      singleSubjectIntent === "dolphin" ||
      hasShark ||
      hasWhale ||
      hasDolphin
    ) &&
    (!requestedCount || requestedCount.count === 1)
  ) {
    const subject =
      hasShark || singleSubjectIntent === "shark"
        ? "shark"
        : hasWhale || singleSubjectIntent === "whale"
          ? "whale"
          : hasDolphin || singleSubjectIntent === "dolphin"
            ? "dolphin"
            : "fish";
    const subjectColor =
      subject === "shark"
        ? sharkColor
        : subject === "whale"
          ? whaleColor
          : subject === "dolphin"
            ? dolphinColor
            : fishColor;
    const arabicSubjectLabel =
      subject === "shark" ? "قرش" : subject === "whale" ? "حوت" : subject === "dolphin" ? "دلفين" : "سمكة";
    const arabicDefiniteSubject =
      subject === "shark" ? "القرش" : subject === "whale" ? "الحوت" : subject === "dolphin" ? "الدلفين" : "السمكة";
    const colorPrefix = subjectColor ? `${subjectColor} ` : "";
    const scene = hasWaterScene || hasBeach ? "underwater in a natural sea environment" : "in a natural aquatic environment";

    return {
      subject,
      subjectColor,
      object: hasWaterScene || hasBeach ? "sea environment" : "aquatic environment",
      objectColor: null,
      relation: "swimming in",
      enhancedPrompt: [
        `صورة واقعية واضحة لـ${arabicSubjectLabel}${subjectColor === "red" ? " حمراء" : ""} يكون ${arabicDefiniteSubject} هو العنصر الرئيسي الوحيد داخل الإطار.`,
        hasWaterScene || hasBeach ? `يظهر ${arabicDefiniteSubject} داخل البحر أو الماء بوضوح طبيعي.` : `يظهر ${arabicDefiniteSubject} داخل بيئة مائية طبيعية واضحة.`,
        "ممنوع تكرار الكائن أو تقسيم الصورة إلى عدة إطارات أو إضافة أشخاص أو مشاهد جانبية.",
      ].join(" "),
      finalPrompt: [
        `A realistic photo of one ${colorPrefix}${subject} ${scene}.`,
        `The ${subject} must be the only main subject and must be fully visible in the frame.`,
        subjectColor ? `Keep the ${subject} clearly ${subjectColor}.` : `Keep the ${subject} natural and clearly visible.`,
        "ONE SUBJECT ONLY.",
        "NO DUPLICATES.",
        "NO COLLAGE.",
        "NO GRID.",
        "Use a natural full-frame underwater composition with no tiled layout, no segmented frame, and no split-screen composition.",
        "Do not add extra fish, extra sharks, extra whales, extra dolphins, people, boats, offices, meetings, food, text, watermark, logo, panel dividers, or white separator lines.",
        "Professional wildlife photography, realistic lighting, sharp details, clean composition.",
      ].join(" "),
      negativeRules: [
        "multiple subjects",
        "extra copies",
        "duplicate subject",
        "duplicate subjects",
        "repeated object",
        "collage",
        "contact sheet",
        "multiple images",
        "grid layout",
        "photo grid",
        "tiled images",
        "split screen",
        "split panel",
        "panel dividers",
        "white borders",
        "white separator lines",
        "humans",
        "people",
        "business meeting",
        "meeting room",
        "office",
        "food",
        "text",
        "watermark",
        "logo",
      ],
      debug: {
        subjects: [subject],
        relations: [scene],
        scene,
        style: "realistic wildlife photo",
      },
    };
  }

  if (hasBird) {
    const birdLabel = hasFalcon ? "falcon" : hasEagle ? "eagle" : "bird";
    const displayBirdColor = birdColor === "gold" ? "golden" : birdColor;
    const coloredBird = displayBirdColor ? `${displayBirdColor} ${birdLabel}` : birdLabel;
    const birdScene = hasNest
      ? "inside its natural nest"
      : "in a clean outdoor wildlife setting";
    const birdObject = hasNest ? "natural nest" : "natural background";

    return {
      subject: birdLabel,
      subjectColor: birdColor,
      object: birdObject,
      objectColor: null,
      relation: hasNest ? "inside its nest" : "single main subject",
      enhancedPrompt: hasNest
        ? `\u0635\u0648\u0631\u0629 \u0648\u0627\u0642\u0639\u064a\u0629 \u0648\u0627\u0636\u062d\u0629 \u0644${hasFalcon ? "\u0635\u0642\u0631" : hasEagle ? "\u0646\u0633\u0631" : "\u0637\u0627\u0626\u0631"} \u064a\u0638\u0647\u0631 \u0643\u0627\u0645\u0644\u064b\u0627 \u062f\u0627\u062e\u0644 \u0639\u0634\u0647 \u0627\u0644\u0637\u0628\u064a\u0639\u064a \u0628\u0648\u0636\u0648\u062d \u0645\u0639 \u0627\u0644\u0639\u0634 \u0646\u0641\u0633\u0647 \u062f\u0627\u062e\u0644 \u0627\u0644\u0625\u0637\u0627\u0631.`
        : `\u0635\u0648\u0631\u0629 \u0648\u0627\u0642\u0639\u064a\u0629 \u0648\u0627\u0636\u062d\u0629 \u0644${hasFalcon ? "\u0635\u0642\u0631" : hasEagle ? "\u0646\u0633\u0631" : "\u0637\u0627\u0626\u0631"} \u064a\u0638\u0647\u0631 \u0643\u0627\u0645\u0644\u064b\u0627 \u0648\u0628\u0644\u0648\u0646\u0647 \u0627\u0644\u0645\u0637\u0644\u0648\u0628 \u0628\u062f\u0642\u0629 \u062f\u0627\u062e\u0644 \u0627\u0644\u0625\u0637\u0627\u0631.`,
      finalPrompt: [
        `A realistic detailed image of one ${coloredBird} ${birdScene}.`,
        `Show the full ${birdLabel} clearly inside the frame with accurate anatomy and visible feathers.`,
        displayBirdColor ? `Keep the ${birdLabel} ${displayBirdColor}.` : `Keep the ${birdLabel} appearance natural and clear.`,
        hasNest
          ? `The ${birdLabel} must be clearly inside its natural nest, and the nest itself must also be clearly visible in the same frame.`
          : "Use a clean outdoor wildlife background with one continuous natural scene only, such as open sky, distant trees, soft rocks, or blurred nature.",
        hasNest
          ? "Use a believable nest made of twigs, grass, or natural fibers. Do not place the bird near the nest; it must be visibly inside it."
          : "",
        "Do not place the bird in front of windows, tiled panels, geometric rectangles, white divider bars, framed sections, or any segmented background.",
        "No humans, no office, no meeting room, no food, no text, no watermark, no logo, no grid lines.",
      ].filter(Boolean).join(" "),
      negativeRules: [
        "humans",
        "businessman",
        "office",
        "meeting room",
        "conference room",
        "food",
        "text",
        "watermark",
        "logo",
        "grid lines",
        "photo grid",
        "window panes",
        "window frame",
        "window",
        "glass wall",
        "glass panels",
        "panel dividers",
        "rectangular panels",
        "geometric background",
        "checkerboard background",
        "white separator lines",
        "split screen",
        "collage",
        "mosaic",
        "bird outside nest",
        "missing nest",
        "perched beside nest",
      ],
      debug: {
        subjects: [birdLabel],
        relations: [hasNest ? "bird inside its natural nest" : "single centered subject"],
        scene: hasNest ? "natural nest scene" : "clean natural background",
        style: "realistic wildlife subject",
      },
    };
  }

  if (hasWolf) {
    const familyDescription = hasWolfPups
      ? "one large adult wolf together with multiple young wolf pups"
      : `${hasLargeSize || hasVeryLargeSize ? "one large adult " : "one adult "}wolf`;

    return {
      subject: hasWolfPups ? "adult wolf and wolf pups" : "wolf",
      subjectColor: null,
      object: "natural wilderness",
      objectColor: null,
      relation: hasWolfPups ? "together with its pups" : "standing",
      enhancedPrompt: hasWolfPups
        ? "\u0635\u0648\u0631\u0629 \u0648\u0627\u0642\u0639\u064a\u0629 \u0644\u0630\u0626\u0628 \u0628\u0627\u0644\u063a \u0643\u0628\u064a\u0631 \u0645\u0639 \u0635\u063a\u0627\u0631\u0647 \u0645\u0646 \u062c\u0631\u0627\u0621 \u0627\u0644\u0630\u0626\u0627\u0628\u060c \u0648\u062a\u0638\u0647\u0631 \u0639\u0627\u0626\u0644\u0629 \u0627\u0644\u0630\u0626\u0627\u0628 \u0643\u0627\u0645\u0644\u0629 \u062f\u0627\u062e\u0644 \u0627\u0644\u0625\u0637\u0627\u0631 \u0641\u064a \u0628\u064a\u0626\u0629 \u0628\u0631\u064a\u0629 \u0637\u0628\u064a\u0639\u064a\u0629\u060c \u0628\u062f\u0648\u0646 \u0623\u0634\u062e\u0627\u0635 \u0623\u0648 \u0646\u0635\u0648\u0635."
        : "\u0635\u0648\u0631\u0629 \u0648\u0627\u0642\u0639\u064a\u0629 \u0644\u0630\u0626\u0628 \u0628\u0627\u0644\u063a \u0643\u0628\u064a\u0631 \u0643\u0627\u0645\u0644 \u0627\u0644\u0638\u0647\u0648\u0631 \u0641\u064a \u0628\u064a\u0626\u0629 \u0628\u0631\u064a\u0629 \u0637\u0628\u064a\u0639\u064a\u0629.",
      finalPrompt: [
        `A realistic wildlife photograph of ${familyDescription} in a natural forest wilderness.`,
        hasWolfPups
          ? "The smaller subjects must unmistakably be wolf pups, not human children, adults, businessmen, or any other species."
          : "The adult wolf must be the only main subject.",
        hasWolfPups
          ? "Show the large adult wolf and every wolf pup fully visible together in the same frame."
          : "Show the complete large wolf fully visible in the frame.",
        "Preserve the clear size contrast: the adult wolf is large and the wolf pups are visibly smaller.",
        "Natural wildlife behavior, realistic wolf anatomy, detailed fur, forest ground, cinematic natural light.",
        "No humans, no businessmen, no business suits, no office, no meeting room, no tables, no plates, no food.",
        "No text, no Arabic letters, no captions, no watermark, no logo, no grid lines.",
      ].join(" "),
      negativeRules: [
        "humans",
        "human children",
        "men",
        "women",
        "businessmen",
        "business suits",
        "office",
        "meeting room",
        "conference room",
        "table",
        "plates",
        "food",
        "dog",
        "text",
        "Arabic letters",
        "watermark",
        "logo",
      ],
      debug: {
        subjects: hasWolfPups ? ["one large adult wolf", "multiple wolf pups"] : ["one large adult wolf"],
        relations: hasWolfPups ? ["adult wolf together with its wolf pups"] : ["single adult wolf"],
        scene: "natural forest wilderness",
        style: "realistic wildlife photograph",
      },
    };
  }

  if (hasSnake) {
    const snakeColor = hasBlack ? "black" : firstDetectedColor(lower);
    const adultSize = hasVeryLargeSize ? "extremely large, massive adult" : hasLargeSize ? "large adult" : "adult";
    const familyDescription = hasSnakeBabies
      ? `one ${adultSize} ${snakeColor ? `${snakeColor} ` : ""}snake together with multiple baby snakes`
      : `one ${adultSize} ${snakeColor ? `${snakeColor} ` : ""}snake`;

    return {
      subject: hasSnakeBabies ? "adult snake and baby snakes" : "snake",
      subjectColor: snakeColor,
      object: "natural rocky wilderness",
      objectColor: null,
      relation: hasSnakeBabies ? "together with its baby snakes" : "resting",
      enhancedPrompt: hasSnakeBabies
        ? "\u0635\u0648\u0631\u0629 \u0648\u0627\u0642\u0639\u064a\u0629 \u0644\u062b\u0639\u0628\u0627\u0646 \u0623\u0633\u0648\u062f \u0628\u0627\u0644\u063a \u0648\u0636\u062e\u0645 \u062c\u062f\u064b\u0627 \u0645\u0639 \u0635\u063a\u0627\u0631\u0647 \u0645\u0646 \u0627\u0644\u062b\u0639\u0627\u0628\u064a\u0646\u060c \u0648\u062a\u0638\u0647\u0631 \u062c\u0645\u064a\u0639 \u0627\u0644\u062b\u0639\u0627\u0628\u064a\u0646 \u0643\u0627\u0645\u0644\u0629 \u062f\u0627\u062e\u0644 \u0627\u0644\u0625\u0637\u0627\u0631 \u0641\u064a \u0628\u064a\u0626\u0629 \u0637\u0628\u064a\u0639\u064a\u0629\u060c \u0628\u062f\u0648\u0646 \u0623\u0634\u062e\u0627\u0635 \u0623\u0648 \u0646\u0635\u0648\u0635."
        : "\u0635\u0648\u0631\u0629 \u0648\u0627\u0642\u0639\u064a\u0629 \u0644\u062b\u0639\u0628\u0627\u0646 \u0628\u0627\u0644\u063a \u0636\u062e\u0645 \u0643\u0627\u0645\u0644 \u0627\u0644\u0638\u0647\u0648\u0631 \u0641\u064a \u0628\u064a\u0626\u0629 \u0637\u0628\u064a\u0639\u064a\u0629.",
      finalPrompt: [
        `A realistic wildlife photograph of ${familyDescription} in a natural rocky wilderness.`,
        snakeColor ? `The adult snake must be clearly ${snakeColor}; do not change its requested color.` : "",
        hasSnakeBabies
          ? "The smaller subjects must unmistakably be real baby snakes of the same species, not human children, people, dogs, wolves, or other animals."
          : "The adult snake must be the only main subject.",
        hasSnakeBabies
          ? "Show the huge adult snake and every baby snake fully visible together in the same frame."
          : "Show the complete adult snake fully visible in the frame.",
        "Preserve a strong size contrast: the adult snake is extraordinarily large and thick, while the baby snakes are visibly much smaller.",
        "Realistic snake anatomy, natural scales, long serpentine bodies, wildlife behavior, cinematic natural light.",
        "No humans, no businessmen, no business suits, no office, no meeting room, no tables, no plates, no food.",
        "No text, no Arabic letters, no captions, no watermark, no logo, no grid lines.",
      ].filter(Boolean).join(" "),
      negativeRules: [
        "humans",
        "human children",
        "people",
        "businessmen",
        "business suits",
        "office",
        "meeting room",
        "conference room",
        "table",
        "plates",
        "food",
        "dog",
        "wolf",
        "text",
        "Arabic letters",
        "watermark",
        "logo",
      ],
      debug: {
        subjects: hasSnakeBabies ? ["one huge adult snake", "multiple baby snakes"] : ["one huge adult snake"],
        relations: hasSnakeBabies ? ["adult snake together with its baby snakes"] : ["single adult snake"],
        scene: "natural rocky wilderness",
        style: "realistic wildlife photograph",
      },
    };
  }

  if (hasTurtle) {
    const subject = hasTurtleBabies ? "adult sea turtle with baby turtles" : "turtle";
    const scene = hasBeach ? "on a natural sandy beach beside the sea" : "in a clean natural habitat";
    const size = hasLargeSize ? "large, full-body " : "";

    return {
      subject,
      subjectColor: null,
      object: hasBeach ? "sandy beach and sea" : "natural habitat",
      objectColor: null,
      relation: hasTurtleBabies ? "together with her babies" : "standing",
      enhancedPrompt: [
        hasTurtleBabies
          ? "صورة واقعية لسلحفاة بحرية بالغة مع صغارها، وتظهر جميع السلاحف بوضوح داخل الإطار."
          : `صورة واقعية لسلحفاة ${hasLargeSize ? "كبيرة الحجم " : ""}كاملة الظهور داخل الإطار.`,
        hasBeach ? "توجد السلحفاة وصغارها على شاطئ رملي طبيعي بجوار البحر." : "توجد السلحفاة في بيئة طبيعية واضحة.",
        "لا تضف أشخاصًا أو موظفين أو اجتماعات أو ورودًا أو طعامًا أو عناصر غير مطلوبة.",
      ].join(" "),
      finalPrompt: [
        `A realistic high-quality photo of a ${size}${subject} ${scene}.`,
        hasTurtleBabies
          ? "Show one adult mother sea turtle together with multiple baby turtles. The adult turtle and every baby turtle must be clearly visible in the same frame."
          : "The turtle is the only main subject and its complete body and shell must be clearly visible.",
        hasBeach
          ? "The sandy beach, shoreline, and sea must be clearly visible around the turtles."
          : "Use a natural environment appropriate for a real turtle.",
        "The requested animal must unmistakably be a turtle with a visible turtle shell, head, and legs.",
        "Do not replace the turtle with a flower, rose, plant, person, business team, office, meeting, food, or another animal.",
        "No humans, no employees, no business suits, no conference room, no text, no watermark, no logo, no grid lines.",
        "Natural lighting, wildlife photography, sharp details, clean composition.",
      ].join(" "),
      negativeRules: [
        "humans",
        "people",
        "employees",
        "business team",
        "business suits",
        "office",
        "meeting",
        "conference room",
        "flower",
        "rose",
        "plant close-up",
        "food",
        "wrong animal",
        "text",
        "watermark",
        "logo",
      ],
      debug: {
        subjects: hasTurtleBabies ? ["adult sea turtle", "baby turtles"] : ["large turtle"],
        relations: hasTurtleBabies ? ["adult turtle together with her babies"] : ["single turtle"],
        scene: hasBeach ? "sandy beach beside the sea" : "natural turtle habitat",
        style: "realistic wildlife photo",
      },
    };
  }

  if (hasChicken) {
    const subjectColor = chickenColor || "clearly visible";
    const place = hasGarden ? "inside a garden" : "standing on a simple farm background";

    return {
      subject: "chicken",
      subjectColor,
      object: hasGarden ? "garden" : "farm background",
      objectColor: null,
      relation: "standing on",
      enhancedPrompt: [
        `صورة واقعية لدجاجة${subjectColor === "white" ? " بيضاء" : ""} كاملة الظهور.`,
        hasGarden ? "تظهر الدجاجة داخل حديقة واضحة." : "تظهر الدجاجة في بيئة مزرعة بسيطة وواضحة.",
        "يجب أن تكون الدجاجة هي العنصر الرئيسي داخل الإطار، بدون أشخاص أو غرفة اجتماعات أو مكتب.",
      ].join(" "),
      finalPrompt: [
        `A realistic photo of a ${subjectColor === "clearly visible" ? "" : `${subjectColor} `}chicken ${place}.`,
        subjectColor !== "clearly visible" ? `The chicken must be ${subjectColor}.` : "The chicken must be clearly visible.",
        "The chicken is the main subject and must be fully visible in the frame.",
        "Use one continuous outdoor farm or garden background only, with no windows, no tiled panels, no geometric rectangles, and no white separator bars.",
        "Do not generate people, employees, meetings, offices, conference rooms, restaurants, food plates, or business scenes.",
        "No extra animals unless requested, no text, no watermark, no logo, no grid lines.",
        "Natural lighting, realistic photography, clean composition.",
      ].join(" "),
      negativeRules: [
        "humans",
        "people",
        "employees",
        "business meeting",
        "meeting room",
        "office",
        "conference room",
        "corporate",
        "restaurant",
        "food plate",
        "text",
        "watermark",
        "logo",
        "window panes",
        "window frame",
        "window",
        "glass wall",
        "glass panels",
        "panel dividers",
        "rectangular panels",
        "geometric background",
        "checkerboard background",
        "white separator lines",
        "split screen",
        "collage",
        "mosaic",
      ],
      debug: {
        subjects: ["chicken"],
        relations: [place],
        scene: hasGarden ? "garden" : "farm background",
        style: "realistic photo",
      },
    };
  }

  if (hasBear) {
    const hasLargeBear = includesAny(lower, [
      "\u062f\u0628 \u0643\u0628\u064a\u0631",
      "\u062f\u0628 \u0636\u062e\u0645",
      "\u062f\u0628\u0629 \u0643\u0628\u064a\u0631\u0629",
      "\u062f\u0628\u0629 \u0636\u062e\u0645\u0629",
      "large bear",
      "big bear",
      "huge bear",
    ]);
    const humanSubject = hasBoy
      ? hasVerySmallHuman
        ? "very young little boy"
        : hasYoungHuman
          ? "young boy"
          : "boy"
      : hasGirl
        ? hasVerySmallHuman
          ? "very young little girl"
          : hasYoungHuman
            ? "young girl"
            : "girl"
        : hasChild
          ? hasVerySmallHuman
            ? "very young child"
            : hasYoungHuman
              ? "young child"
              : "child"
          : hasWoman
            ? hasYoungHuman
              ? "young woman"
              : "woman"
            : hasMan
              ? hasYoungHuman
                ? "young man"
                : "man"
              : null;
    const bearSize = hasVeryLargeSize ? "very large " : hasLargeBear || hasLargeSize ? "large " : "";
    const bearColorLabel = bearColor === "gold" ? "golden" : bearColor;
    const scene = hasForest
      ? "in a natural forest"
      : hasGarden
        ? "in a natural garden"
        : "in a natural outdoor wildlife setting";
    const relation = humanSubject
      ? hasNearbyRelation
        ? "standing next to"
        : "standing near"
      : "standing in";

    return {
      subject: humanSubject || "bear",
      subjectColor: null,
      object: humanSubject ? "bear" : scene,
      objectColor: bearColor,
      relation,
      finalPrompt: [
        humanSubject
          ? `A realistic wildlife scene of one ${humanSubject} standing next to one ${bearSize}${bearColorLabel ? `${bearColorLabel} ` : ""}bear ${scene}.`
          : `A realistic wildlife scene of one ${bearSize}${bearColorLabel ? `${bearColorLabel} ` : ""}bear ${scene}.`,
        humanSubject
          ? `Both the ${humanSubject} and the bear must be fully visible in the same frame.`
          : "The bear must be the only main subject and must be fully visible in the frame.",
        bearColorLabel ? `Keep the bear clearly ${bearColorLabel}.` : "Keep the bear anatomically accurate and clearly visible.",
        hasVeryLargeSize || hasLargeSize ? "The bear must visibly look large and powerful." : "",
        hasForest ? "Keep the forest clearly visible as the natural background." : "",
        hasNearbyRelation && humanSubject ? "Keep the person and the bear beside each other in one coherent natural scene." : "",
        "Do not add offices, meetings, business scenes, restaurant elements, text, watermark, logo, or unrelated extra subjects.",
        "Use one continuous natural composition only, with realistic lighting and sharp details.",
      ].filter(Boolean).join(" "),
      negativeRules: [
        "office",
        "business meeting",
        "meeting room",
        "conference room",
        "restaurant",
        "food",
        "text",
        "watermark",
        "logo",
        "duplicate bear",
        "extra people",
        "collage",
        "photo grid",
      ],
      debug: {
        subjects: humanSubject ? [humanSubject, `${bearSize}${bearColorLabel ? `${bearColorLabel} ` : ""}bear`.trim()] : ["bear"],
        relations: [humanSubject ? relation : "single wildlife subject"],
        scene,
        style: "realistic wildlife scene",
      },
    };
  }

  if (hasCat && hasHouse && hasTop) {
    const subjectColor = catColor || "clearly visible";
    const objectColor = houseColor || "clearly visible";

    return {
      subject: "cat",
      subjectColor,
      object: "house",
      objectColor,
      relation: "standing on top of",
      finalPrompt: [
        `A realistic ${subjectColor} cat standing on top of the roof of a ${objectColor} house.`,
        subjectColor !== "clearly visible" ? `The cat must be ${subjectColor}.` : "The cat must be clearly visible.",
        objectColor !== "clearly visible" ? `The house must be ${objectColor}.` : "The house must be clearly visible.",
        "The entire house must be visible in the frame.",
        "The black cat and the yellow house are both visible in the same frame.",
        "The cat is standing on the roof of the house, not beside it and not floating.",
        "Do not change the cat color.",
        "Do not remove the house.",
        "No additional animals, no people, no text, no watermark.",
        "Photorealistic composition, natural lighting, sharp details.",
      ].join(" "),
    };
  }

  if (hasCat && hasDog) {
    const color = hasBlack ? "black " : "";
    const place = hasGarden ? "inside a garden" : "in a clean natural setting";
    return {
      subject: "cat",
      subjectColor: catColor || (hasBlack ? "black" : null),
      object: "dog",
      objectColor: dogColor || (hasBlack ? "black" : null),
      relation: "standing next to",
      finalPrompt: [
        `A realistic photo of a ${color}cat standing next to a ${color}dog ${place}.`,
        "Both animals must be fully visible, side by side, with the correct colors clearly visible.",
        "Do not add people, food, extra animals, text, watermark, or logos.",
      ].join(" "),
    };
  }

  if (hasDog && hasCar && hasInside) {
    return {
      subject: "dog",
      subjectColor: dogColor,
      object: "car",
      objectColor: null,
      relation: "sitting inside",
      finalPrompt: [
        `A realistic ${dogColor ? `${dogColor} ` : ""}dog sitting inside a car.`,
        "The dog must be clearly visible through the car interior.",
        "The dog is inside the car, not beside it and not on top of it.",
        "Show enough of the car to make the spatial relationship unmistakable.",
        "No extra animals, no people, no text, no watermark.",
      ].join(" "),
    };
  }

  if (profession) {
    const appearance = hasHandsome ? "handsome " : "";
    const clothing = hasSuit ? "wearing an elegant formal suit" : PROFESSION_ATTIRE[profession];
    const place = hasOffice ? "inside a modern office" : "in an environment appropriate for the profession";
    const translatedRequest = translateArabicToEnglish(userPrompt);
    return {
      subject: profession,
      subjectColor: null,
      object: hasOffice ? "office" : null,
      objectColor: null,
      relation: hasOffice ? "inside" : null,
      finalPrompt: [
        `User request: ${translatedRequest}.`,
        `A ${appearance}${profession} ${clothing} ${place}.`,
        `The main subject must clearly look like a ${profession}.`,
        "Preserve every requested object, action, color, and spatial relationship from the user request.",
        "Realistic professional portrait, confident expression, clean composition, cinematic lighting.",
      ].join(" "),
    };
  }

  if ((hasBoy || hasGirl || hasChild || hasWoman || hasMan) && !profession && !hasSuit && !hasOffice && !hasCar && !hasCat && !hasDog && !hasBear && !hasChicken && !hasTurtle && !hasWolf && !hasSnake && !hasRobot) {
    const subjectLabel = hasBoy
      ? hasVerySmallHuman
        ? "very young little boy"
        : hasYoungHuman
          ? "young boy"
          : "boy"
      : hasGirl
        ? hasVerySmallHuman
          ? "very young little girl"
          : hasYoungHuman
            ? "young girl"
            : "girl"
        : hasChild
          ? hasVerySmallHuman
            ? "very young child"
            : hasYoungHuman
              ? "young child"
              : "child"
          : hasWoman
            ? hasYoungHuman
              ? "young woman"
              : "woman"
            : hasYoungHuman
              ? "young man"
              : "man";
    const scene = hasGarden
      ? "inside a clean garden scene"
      : hasBeach
        ? "on a natural beach"
        : "in a clean simple portrait scene";

    return {
      subject: subjectLabel,
      subjectColor: null,
      object: hasGarden ? "garden" : hasBeach ? "beach" : null,
      objectColor: null,
      relation: hasGarden ? "inside" : hasBeach ? "on" : null,
      enhancedPrompt: [
        hasBoy
          ? hasVerySmallHuman
            ? "صورة واقعية لولد صغير جدًا يكون هو العنصر الرئيسي الوحيد داخل الإطار."
            : "صورة واقعية لولد صغير يكون هو العنصر الرئيسي الوحيد داخل الإطار."
          : hasGirl
            ? hasVerySmallHuman
              ? "صورة واقعية لبنت صغيرة جدًا تكون هي العنصر الرئيسي الوحيد داخل الإطار."
              : "صورة واقعية لبنت صغيرة تكون هي العنصر الرئيسي الوحيد داخل الإطار."
            : hasChild
              ? hasVerySmallHuman
                ? "صورة واقعية لطفل صغير جدًا يكون هو العنصر الرئيسي الوحيد داخل الإطار."
                : "صورة واقعية لطفل صغير يكون هو العنصر الرئيسي الوحيد داخل الإطار."
              : hasWoman
                ? "صورة واقعية لشخصية نسائية واضحة داخل الإطار."
                : "صورة واقعية لشخص واضح داخل الإطار.",
        hasGarden
          ? "تظهر الشخصية داخل حديقة نظيفة وواضحة."
          : hasBeach
            ? "تظهر الشخصية على شاطئ طبيعي واضح."
            : "خلفية نظيفة وبسيطة بدون عناصر مشتتة.",
        "لا تضف أشخاصًا إضافيين أو مكاتب أو اجتماعات أو طعامًا أو نصوصًا أو شعارات.",
      ].join(" "),
      finalPrompt: [
        `A realistic high-quality portrait of one ${subjectLabel} ${scene}.`,
        hasVerySmallHuman
          ? "The subject must clearly look very young and small in age, with childlike facial proportions and body scale."
          : hasYoungHuman || hasBoy || hasGirl || hasChild
            ? "The subject must clearly look young."
            : "The requested human subject must be clearly visible.",
        "The requested person must remain the only main subject in the frame.",
        "Keep the face, body proportions, and age appearance natural and realistic.",
        hasGarden ? "The garden must stay visible as a clean secondary background." : "",
        hasBeach ? "The beach must stay visible as a clean natural background." : "",
        "Do not add extra people, offices, meetings, business scenes, tables, food, text, watermark, logo, or grid lines.",
        "Professional lighting, clean composition, realistic skin and clothing details.",
      ].filter(Boolean).join(" "),
      negativeRules: [
        "extra people",
        "business meeting",
        "meeting room",
        "office",
        "desk",
        "food",
        "restaurant",
        "text",
        "watermark",
        "logo",
        "grid lines",
      ],
      debug: {
        subjects: [subjectLabel],
        relations: [scene],
        scene,
        style: "realistic portrait",
      },
    };
  }

  if (hasMan && hasWearing && hasSuit) {
    const translatedRequest = translateArabicToEnglish(userPrompt);
    return {
      subject: "man",
      subjectColor: null,
      object: "business suit",
      objectColor: null,
      relation: "wearing",
      finalPrompt: [
        `User request: ${translatedRequest}.`,
        "A man wearing a formal business suit.",
        "The suit must be clearly visible on the man.",
        "Preserve every requested object, action, color, and spatial relationship from the user request.",
        "Realistic professional photography, full upper body visible, clean composition.",
        "No extra people, no text, no watermark.",
      ].join(" "),
    };
  }

  if (hasRobot) {
    if (hasGreen && hasYellow && hasBeside) {
      return {
        subject: "robot",
        subjectColor: "green",
        object: "robot",
        objectColor: "yellow",
        relation: "standing next to",
        finalPrompt: [
        "Exactly two robots standing side by side on the moon surface.",
        "The first subject is a bright green robot.",
        "The second subject is a bright yellow robot.",
        "The green robot and the yellow robot must both be fully visible.",
        "Both robots are on the moon surface with a clear lunar landscape.",
        "Exactly two robots, no more and no fewer.",
        "Realistic sci-fi scene.",
        "No humans, no animals, no text, no watermark.",
        ].join(" "),
      };
    }

    const color = hasYellow ? "bright yellow " : hasGreen ? "bright green " : "";
    const count = hasRobots ? "a group of futuristic robots" : `one ${color}futuristic robot`;
    const place = hasMoon
      ? "standing on the surface of the moon"
      : hasSpace
        ? "floating in outer space with stars and distant planets clearly visible"
        : "in a clean futuristic scene";
    return {
      subject: hasRobots ? "robots" : "robot",
      subjectColor: hasYellow ? "yellow" : hasGreen ? "green" : null,
      object: hasMoon ? "moon" : hasSpace ? "outer space" : null,
      objectColor: null,
      relation: hasMoon ? "standing on" : hasSpace ? "floating in" : null,
      finalPrompt: [
        `${count} ${place}.`,
        "The robot is the only main subject and must be fully visible.",
        "Create a realistic science-fiction scene with cinematic lighting and sharp mechanical details.",
        "Do not generate humans, businessmen, suits, portraits, offices, desks, meetings, conference rooms, restaurants, or food.",
        "Do not reuse any subject or scene from a previous request.",
        "No animals, no text, no watermark, no logo, no grid lines.",
      ].join(" "),
    };
  }

  if (hasCar) {
    const color = hasBlack ? "black " : "";
    const type = hasSports ? "sports car" : "car";
    const place = hasStreet ? "on a well-lit street" : "in a clean urban environment";
    const time = hasNight ? "at night" : "";
    const size = hasVeryLargeSize ? "extremely large, oversized, massive " : hasLargeSize ? "large " : "";
    return {
      subject: type,
      subjectColor: hasBlack ? "black" : null,
      object: hasStreet ? "street" : null,
      objectColor: null,
      relation: "on",
      enhancedPrompt: hasVeryLargeSize
        ? "\u0635\u0648\u0631\u0629 \u0648\u0627\u0642\u0639\u064a\u0629 \u0644\u0633\u064a\u0627\u0631\u0629 \u0639\u0645\u0644\u0627\u0642\u0629 \u0636\u062e\u0645\u0629 \u062c\u062f\u064b\u0627\u060c \u062a\u0638\u0647\u0631 \u0643\u0627\u0645\u0644\u0629 \u062f\u0627\u062e\u0644 \u0627\u0644\u0625\u0637\u0627\u0631 \u0645\u0639 \u0639\u0646\u0627\u0635\u0631 \u0645\u062d\u064a\u0637\u0629 \u062a\u0648\u0636\u062d \u062d\u062c\u0645\u0647\u0627 \u0627\u0644\u0647\u0627\u0626\u0644\u060c \u0628\u062f\u0648\u0646 \u0634\u0639\u0627\u0631 \u0623\u0648 \u0639\u0644\u0627\u0645\u0629 \u062a\u062c\u0627\u0631\u064a\u0629."
        : null,
      finalPrompt: [
        `A realistic automotive photograph of one ${size}${color}${type} ${place} ${time}.`,
        hasVeryLargeSize
          ? "The car must look extraordinarily huge and imposing, far larger than an ordinary passenger car."
          : "The complete car must be clearly visible.",
        hasVeryLargeSize
          ? "Use strong visual scale cues such as a wide road, nearby streetlights, buildings, or normal-sized surroundings to make the enormous scale unmistakable."
          : "Keep the car fully inside the frame.",
        "Show the full vehicle from a wide three-quarter angle; do not crop it into a small close-up.",
        "Use a generic original vehicle design unless the user explicitly requests a brand.",
        "Do not add BMW, Mercedes, Ferrari, or any brand badge or logo unless explicitly requested.",
        "No people, no office, no meeting, no food, no text, no watermark, no logo, no grid lines.",
        "Sharp details, cinematic lighting, professional automotive photography.",
      ].join(" "),
      negativeRules: [
        "small car",
        "tiny car",
        "compact car",
        "BMW",
        "Mercedes",
        "brand badge",
        "car logo",
        "people",
        "office",
        "meeting",
        "food",
        "text",
        "watermark",
      ],
    };
  }

  return null;
}

function translateArabicToEnglish(userPrompt) {
  const text = String(userPrompt || "").trim();

  if (!hasArabicText(text)) {
    return text;
  }

  const normalizedText = text.replace(
    /^\s*(?:\u0627\u0639\u0645\u0644|\u0627\u0646\u0634\u0626|\u0623\u0646\u0634\u0626|\u0627\u0635\u0646\u0639|\u0627\u0631\u0633\u0645|\u0635\u0645\u0645|\u0633\u0648\u064a|\u0633\u0648|\u0623\u0628\u063a\u0649|\u0627\u0628\u063a\u0649|\u0623\u0628\u064a|\u0627\u0628\u064a)(?:\s+\u0644\u064a)?\s+/,
    ""
  );

  const dictionary = [
    ["\u0628\u062c\u0627\u0646\u0628\u0647", "next to him"],
    ["\u0628\u062c\u0627\u0646\u0628\u0647\u0627", "next to her"],
    ["\u0628\u062c\u0627\u0646\u0628\u0647\u0645", "next to them"],
    ["\u0645\u0639\u0647", "with him"],
    ["\u0645\u0639\u0647\u0627", "with her"],
    ["\u0645\u0639\u0647\u0645", "with them"],
    ["\u0641\u064a \u0627\u0644\u063a\u0627\u0628\u0629", "in the forest"],
    ["\u0628\u0627\u0644\u063a\u0627\u0628\u0629", "in the forest"],
    ["\u0644\u0648\u0646\u0647", "its color is"],
    ["\u0644\u0648\u0646\u0647\u0627", "its color is"],
    ["\u0648\u0644\u062f \u0635\u063a\u064a\u0631 \u062c\u062f\u0627", "very young little boy"],
    ["\u0648\u0644\u062f \u0635\u063a\u064a\u0631 \u062c\u062f\u064b\u0627", "very young little boy"],
    ["\u0635\u0628\u064a \u0635\u063a\u064a\u0631 \u062c\u062f\u0627", "very young little boy"],
    ["\u0635\u0628\u064a \u0635\u063a\u064a\u0631 \u062c\u062f\u064b\u0627", "very young little boy"],
    ["\u0637\u0641\u0644 \u0635\u063a\u064a\u0631 \u062c\u062f\u0627", "very young child"],
    ["\u0637\u0641\u0644 \u0635\u063a\u064a\u0631 \u062c\u062f\u064b\u0627", "very young child"],
    ["\u0628\u0646\u062a \u0635\u063a\u064a\u0631\u0629 \u062c\u062f\u0627", "very young little girl"],
    ["\u0628\u0646\u062a \u0635\u063a\u064a\u0631\u0629 \u062c\u062f\u064b\u0627", "very young little girl"],
    ["\u0641\u062a\u0627\u0629 \u0635\u063a\u064a\u0631\u0629 \u062c\u062f\u0627", "very young little girl"],
    ["\u0641\u062a\u0627\u0629 \u0635\u063a\u064a\u0631\u0629 \u062c\u062f\u064b\u0627", "very young little girl"],
    ["\u0637\u0641\u0644\u0629 \u0635\u063a\u064a\u0631\u0629 \u062c\u062f\u0627", "very young little girl"],
    ["\u0637\u0641\u0644\u0629 \u0635\u063a\u064a\u0631\u0629 \u062c\u062f\u064b\u0627", "very young little girl"],
    ["\u0631\u062c\u0644 \u0623\u0639\u0645\u0627\u0644", "businessman"],
    ["\u0631\u062c\u0644 \u0627\u0639\u0645\u0627\u0644", "businessman"],
    ["\u0631\u062c\u0644 \u0631\u0633\u0645\u064a", "formal businessman"],
    ["\u0636\u0627\u0628\u0637 \u0634\u0631\u0637\u0629", "police officer"],
    ["\u0631\u0627\u0626\u062f\u0629 \u0641\u0636\u0627\u0621", "astronaut"],
    ["\u0631\u0627\u0626\u062f \u0641\u0636\u0627\u0621", "astronaut"],
    ["\u0635\u0642\u0631", "falcon"],
    ["\u0635\u0642\u0648\u0631", "falcons"],
    ["\u0646\u0633\u0631", "eagle"],
    ["\u0646\u0633\u0648\u0631", "eagles"],
    ["\u0637\u0627\u0626\u0631", "bird"],
    ["\u0637\u064a\u0631", "bird"],
    ["\u0639\u0635\u0641\u0648\u0631", "bird"],
    ["\u0639\u0635\u0641\u0648\u0631\u0629", "bird"],
    ["\u064a\u0637\u064a\u0631 \u0641\u0648\u0642", "flying above"],
    ["\u062a\u0637\u064a\u0631 \u0641\u0648\u0642", "flying above"],
    ["\u064a\u062c\u0644\u0633 \u0639\u0644\u0649", "sitting on"],
    ["\u062a\u062c\u0644\u0633 \u0639\u0644\u0649", "sitting on"],
    ["\u064a\u0646\u0638\u0631 \u0625\u0644\u0649", "looking at"],
    ["\u064a\u0646\u0638\u0631 \u0627\u0644\u0649", "looking at"],
    ["\u062a\u0646\u0638\u0631 \u0625\u0644\u0649", "looking at"],
    ["\u062a\u0646\u0638\u0631 \u0627\u0644\u0649", "looking at"],
    ["\u0641\u064a \u062f\u0627\u062e\u0644", "inside"],
    ["\u0639\u0644\u0649 \u0633\u0637\u062d", "on top of the roof of"],
    ["\u0645\u0643\u062a\u0628 \u062d\u062f\u064a\u062b", "modern office"],
    ["\u0631\u0648\u0628\u0648\u062a\u0627\u062a", "robots"],
    ["\u0631\u0628\u0648\u062a\u0627\u062a", "robots"],
    ["\u0631\u0648\u0628\u0648\u062a", "robot"],
    ["\u0631\u064a\u0628\u0648\u062a", "robot"],
    ["\u0631\u0648\u0628\u0637", "robot"],
    ["\u0631\u0628\u0648\u062a", "robot"],
    ["\u0633\u0644\u062d\u0641\u0627\u062a", "turtles"],
    ["\u0633\u0644\u062d\u0641\u0627\u0629", "turtle"],
    ["\u0633\u0644\u062d\u0641\u0627\u0647", "turtle"],
    ["\u0630\u0626\u0627\u0628", "wolves"],
    ["\u0630\u064a\u0627\u0628", "wolves"],
    ["\u0630\u0626\u0628", "wolf"],
    ["\u0630\u064a\u0628", "wolf"],
    ["\u062b\u0639\u0627\u0628\u064a\u0646", "snakes"],
    ["\u062b\u0639\u0628\u0627\u0646", "snake"],
    ["\u0623\u0641\u0639\u0649", "snake"],
    ["\u0627\u0641\u0639\u0649", "snake"],
    ["\u0645\u0639 \u0635\u063a\u0627\u0631\u0647", "with its wolf pups"],
    ["\u0645\u0639 \u0635\u063a\u0627\u0631\u0647\u0627", "with her wolf pups"],
    ["\u0635\u063a\u0627\u0631\u0647", "its young"],
    ["\u0639\u064a\u0627\u0644\u0647\u0627", "her baby turtles"],
    ["\u0635\u063a\u0627\u0631\u0647\u0627", "her babies"],
    ["\u0623\u0637\u0641\u0627\u0644\u0647\u0627", "her babies"],
    ["\u0627\u0637\u0641\u0627\u0644\u0647\u0627", "her babies"],
    ["\u0627\u0644\u0634\u0627\u0637\u0626", "the beach"],
    ["\u0634\u0627\u0637\u0626", "beach"],
    ["\u0634\u0627\u0637\u064a", "beach"],
    ["\u062f\u0628\u0628\u0629", "bears"],
    ["\u062f\u0628", "bear"],
    ["\u0627\u0644\u063a\u0627\u0628\u0629", "the forest"],
    ["\u063a\u0627\u0628\u0629", "forest"],
    ["\u0643\u0628\u064a\u0631\u0629 \u0627\u0644\u062d\u062c\u0645", "large"],
    ["\u0643\u0628\u064a\u0631 \u0627\u0644\u062d\u062c\u0645", "large"],
    ["\u0627\u0644\u0641\u0636\u0627\u0621", "outer space"],
    ["\u0641\u0636\u0627\u0621", "outer space"],
    ["\u062f\u062c\u0627\u062c\u0627\u062a", "chickens"],
    ["\u062f\u062c\u0627\u062c\u0629", "chicken"],
    ["\u062f\u062c\u0627\u062c", "chicken"],
    ["\u0641\u0631\u062e\u0629", "chicken"],
    ["\u0643\u062a\u0643\u0648\u062a", "chick"],
    ["\u0642\u0637\u062a\u0627\u0646", "two cats"],
    ["\u0642\u0637\u062a\u064a\u0646", "two cats"],
    ["\u0631\u0648\u0628\u0648\u062a\u0627\u0646", "two robots"],
    ["\u0631\u0648\u0628\u0648\u062a\u064a\u0646", "two robots"],
    ["\u0628\u062c\u0627\u0646\u0628", "next to"],
    ["\u0623\u0645\u0627\u0645", "in front of"],
    ["\u0627\u0645\u0627\u0645", "in front of"],
    ["\u062e\u0644\u0641", "behind"],
    ["\u0628\u064a\u0646", "between"],
    ["\u062f\u0627\u062e\u0644", "inside"],
    ["\u064a\u0645\u0633\u0643", "holding"],
    ["\u062a\u0645\u0633\u0643", "holding"],
    ["\u0631\u0627\u0643\u0628", "sitting inside"],
    ["\u064a\u0642\u0648\u062f", "driving"],
    ["\u062a\u0642\u0648\u062f", "driving"],
    ["\u064a\u0631\u062a\u062f\u064a", "wearing"],
    ["\u062a\u0631\u062a\u062f\u064a", "wearing"],
    ["\u0637\u0628\u064a\u0628\u0629", "doctor"],
    ["\u0637\u0628\u064a\u0628", "doctor"],
    ["\u0645\u0647\u0646\u062f\u0633\u0629", "engineer"],
    ["\u0645\u0647\u0646\u062f\u0633", "engineer"],
    ["\u0645\u0639\u0644\u0645\u0629", "teacher"],
    ["\u0645\u0639\u0644\u0645", "teacher"],
    ["\u0645\u062f\u0631\u0633\u0629", "teacher"],
    ["\u0645\u062f\u0631\u0633", "teacher"],
    ["\u0634\u0631\u0637\u064a\u0629", "police officer"],
    ["\u0634\u0631\u0637\u064a", "police officer"],
    ["\u0648\u0644\u062f", "boy"],
    ["\u0635\u0628\u064a", "boy"],
    ["\u0637\u0641\u0644", "child"],
    ["\u0628\u0646\u062a", "girl"],
    ["\u0641\u062a\u0627\u0629", "girl"],
    ["\u0637\u0641\u0644\u0629", "girl"],
    ["\u0635\u063a\u064a\u0631 \u062c\u062f\u0627", "very small"],
    ["\u0635\u063a\u064a\u0631 \u062c\u062f\u064b\u0627", "very small"],
    ["\u0635\u063a\u064a\u0631\u0629 \u062c\u062f\u0627", "very small"],
    ["\u0635\u063a\u064a\u0631\u0629 \u062c\u062f\u064b\u0627", "very small"],
    ["\u0635\u063a\u064a\u0631", "young"],
    ["\u0635\u063a\u064a\u0631\u0629", "young"],
    ["\u0633\u0648\u062f\u0627\u0621", "black"],
    ["\u0628\u064a\u0636\u0627\u0621", "white"],
    ["\u0635\u0641\u0631\u0627\u0621", "yellow"],
    ["\u0630\u0647\u0628\u064a\u0629", "golden"],
    ["\u0630\u0647\u0628\u064a", "golden"],
    ["\u062e\u0636\u0631\u0627\u0621", "green"],
    ["\u062d\u0645\u0631\u0627\u0621", "red"],
    ["\u0632\u0631\u0642\u0627\u0621", "blue"],
    ["\u0642\u0637\u0629", "cat"],
    ["\u0642\u0637", "cat"],
    ["\u0643\u0644\u0628", "dog"],
    ["\u0623\u0633\u0648\u062f", "black"],
    ["\u0627\u0633\u0648\u062f", "black"],
    ["\u0623\u0628\u064a\u0636", "white"],
    ["\u0627\u0628\u064a\u0636", "white"],
    ["\u0628\u064a\u062a", "house"],
    ["\u0645\u0646\u0632\u0644", "house"],
    ["\u0633\u0637\u062d", "roof"],
    ["\u0641\u0648\u0642", "on top of"],
    ["\u0623\u0635\u0641\u0631", "yellow"],
    ["\u0627\u0635\u0641\u0631", "yellow"],
    ["\u0623\u062e\u0636\u0631", "green"],
    ["\u0627\u062e\u0636\u0631", "green"],
    ["\u0623\u062d\u0645\u0631", "red"],
    ["\u0627\u062d\u0645\u0631", "red"],
    ["\u0623\u0632\u0631\u0642", "blue"],
    ["\u0627\u0632\u0631\u0642", "blue"],
    ["\u0627\u0644\u0642\u0645\u0631", "moon"],
    ["\u0642\u0645\u0631", "moon"],
    ["\u062d\u062f\u064a\u0642\u0629", "garden"],
    ["\u0631\u062c\u0644", "man"],
    ["\u0648\u0633\u064a\u0645", "handsome"],
    ["\u0628\u062f\u0644\u0629", "formal suit"],
    ["\u0645\u0643\u062a\u0628", "office"],
    ["\u0641\u064a\u0631\u0627\u0631\u064a", "Ferrari"],
    ["\u0641\u0631\u0627\u0631\u064a", "Ferrari"],
    ["\u0635\u064a\u0627\u0631\u0629", "car"],
    ["\u0633\u064a\u0627\u0631\u0629", "car"],
    ["\u0639\u0631\u0628\u0629", "car"],
    ["\u0643\u0628\u064a\u0631\u0629 \u062c\u062f\u0627", "extremely large"],
    ["\u0643\u0628\u064a\u0631 \u062c\u062f\u0627", "extremely large"],
    ["\u0636\u062e\u0645\u0629 \u062c\u062f\u0627", "massive"],
    ["\u0636\u062e\u0645 \u062c\u062f\u0627", "massive"],
    ["\u0639\u0645\u0644\u0627\u0642\u0629", "gigantic"],
    ["\u0639\u0645\u0644\u0627\u0642", "gigantic"],
    ["\u0631\u064a\u0627\u0636\u064a\u0629", "sports"],
    ["\u0634\u0627\u0631\u0639", "street"],
    ["\u0645\u0636\u0627\u0621", "well-lit"],
    ["\u0644\u064a\u0644\u0627", "at night"],
    ["\u0644\u064a\u0644", "night"],
  ];

  let translated = normalizedText;
  for (const [arabic, english] of dictionary) {
    translated = translated.replaceAll(arabic, ` ${english} `);
  }

  translated = translated
    .replace(/\bits color is\s+(yellow|red|blue|green|black|white|golden)\b/gi, "$1")
    .replace(/\bman\s+next to him\s+(?:is\s+a\s+)?/gi, "man next to a ")
    .replace(/\bwoman\s+next to her\s+(?:is\s+a\s+)?/gi, "woman next to a ")
    .replace(/\bboy\s+next to him\s+(?:is\s+a\s+)?/gi, "boy next to a ")
    .replace(/\bgirl\s+next to her\s+(?:is\s+a\s+)?/gi, "girl next to a ")
    .replace(/\bchild\s+next to (?:him|her)\s+(?:is\s+a\s+)?/gi, "child next to a ");

  if (hasArabicText(translated)) {
    return "";
  }

  return translated.replace(/\s+/g, " ").trim();
}

function getPromptTranslationKey() {
  const aliases = [
    "PROMPT_TRANSLATION_API_KEY",
    "GEMINI_API_KEY",
    "GEMINI_IMAGE_API_KEY",
    "GOOGLE_API_KEY",
    "GOOGLE_IMAGE_API_KEY",
    "GOOGLE_IMAGEN_API_KEY",
    "GOOGLE_GENERATIVE_AI_API_KEY",
    "GENAI_API_KEY",
  ];

  for (const name of aliases) {
    const value = String(process.env[name] || "").trim();
    if (value) return value;
  }

  return "";
}

function getPromptTranslationModels() {
  return [
    process.env.PROMPT_TRANSLATION_MODEL,
    "gemini-2.5-flash-lite",
    "gemini-2.5-flash",
    "gemini-3.1-flash-lite-preview",
  ]
    .map((value) => String(value || "").trim())
    .filter((value, index, list) => value && list.indexOf(value) === index);
}

function serverTranslationEnabled() {
  const flag = String(process.env.SERVER_PROMPT_TRANSLATION_ENABLED || "").trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(flag)) {
    return true;
  }
  if (["false", "0", "no", "off"].includes(flag)) {
    return false;
  }
  return Boolean(getPromptTranslationKey());
}

function extractTranslatedPrompt(payload) {
  const candidates = Array.isArray(payload?.candidates) ? payload.candidates : [];
  for (const candidate of candidates) {
    const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
    const text = parts
      .map((part) => String(part?.text || "").trim())
      .filter(Boolean)
      .join(" ")
      .replace(/^```(?:text)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    if (text) return text;
  }
  return "";
}

function semanticTranslationIssue(source, translated) {
  const sourceText = String(source || "").toLowerCase();
  const translatedText = String(translated || "").toLowerCase();

  if (!translatedText || hasArabicText(translatedText)) {
    return "empty_or_arabic_output";
  }

  const conceptChecks = [
    {
      sourceTerms: ["رجل", "امرأة", "امراة", "سيدة", "شخص", "إنسان", "انسان", "طفل", "طفلة", "ولد", "صبي", "بنت", "فتاة", "ناس", "people", "person", "human", "boy", "girl", "child"],
      translatedTerms: ["businessman", "businesswoman", " man ", " woman ", "people", "person", "human", "employee"],
      issue: "unrequested_people",
    },
    {
      sourceTerms: ["مكتب", "شركة", "اجتماع", "مؤتمر", "عمل", "office", "meeting", "business", "corporate"],
      translatedTerms: ["office", "meeting room", "conference room", "corporate office", "business meeting"],
      issue: "unrequested_business_scene",
    },
    {
      sourceTerms: ["طعام", "أكل", "اكل", "وجبة", "مطعم", "مائدة", "food", "meal", "restaurant"],
      translatedTerms: ["food", "meal", "restaurant", "dining table"],
      issue: "unrequested_food",
    },
  ];

  for (const check of conceptChecks) {
    const requested = includesAny(sourceText, check.sourceTerms);
    const introduced = includesAny(` ${translatedText} `, check.translatedTerms);
    if (!requested && introduced) {
      return check.issue;
    }
  }

  return "";
}

function assertSemanticTranslation(source, translated) {
  const issue = semanticTranslationIssue(source, translated);
  if (issue) {
    throw serviceError(`تعذر فهم الوصف بدقة الآن. أعد المحاولة بصياغة أوضح، ولم يتم خصم أي رصيد. [${issue}]`, 422);
  }
  return String(translated || "").trim();
}

async function translateArabicPromptForGeneration(userPrompt) {
  const text = String(userPrompt || "").trim();
  if (!hasArabicText(text)) return "";

  const cachedTranslation = await getCachedPromptTranslation(text);
  if (cachedTranslation) {
    const cachedIssue = semanticTranslationIssue(text, cachedTranslation);
    if (!cachedIssue) {
      console.log("PROMPT_TRANSLATION_MODE:", "cache");
      console.log("TRANSLATED_PROMPT:", compactForLog(cachedTranslation));
      return assertSemanticTranslation(text, cachedTranslation);
    }
    console.warn("PROMPT_TRANSLATION_CACHE_INVALID:", cachedIssue, compactForLog(cachedTranslation));
    await deleteCachedPromptTranslation(text);
  }

  const structuredLocalTranslation = extractPositiveTranslationCandidate(
    String(analyzePromptV3(text)?.finalPrompt || "").trim()
  );
  if (structuredLocalTranslation && !hasArabicText(structuredLocalTranslation)) {
    const structuredIssue = semanticTranslationIssue(text, structuredLocalTranslation);
    if (!structuredIssue) {
      console.log("PROMPT_TRANSLATION_MODE:", "local-structured");
      console.log("TRANSLATED_PROMPT:", compactForLog(structuredLocalTranslation));
      await setCachedPromptTranslation(text, structuredLocalTranslation);
      return assertSemanticTranslation(text, structuredLocalTranslation);
    }
  }

  if (!serverTranslationEnabled()) {
    const localTranslation = translateArabicToEnglish(text);
    if (!localTranslation) {
      return "";
    }
    const localIssue = semanticTranslationIssue(text, localTranslation);
    if (localIssue) {
      return "";
    }
    console.log("PROMPT_TRANSLATION_MODE:", "local-fallback");
    console.log("TRANSLATED_PROMPT:", compactForLog(localTranslation));
    await setCachedPromptTranslation(text, localTranslation);
    return assertSemanticTranslation(text, localTranslation);
  }

  const apiKey = getPromptTranslationKey();
  if (!apiKey) {
    console.warn("PROMPT_TRANSLATION_UNAVAILABLE:", "No server translation key is configured.");
    return "";
  }

  const translationBody = {
    contents: [
      {
        parts: [
          {
            text: [
              "You are a strict Arabic-to-English visual prompt compiler.",
              "Convert the Arabic request below into one precise standalone English visual prompt.",
              "Preserve every requested noun, subject, species, count, color, size, material, action, pose, spatial relationship, location, time, and negation.",
              "Resolve Arabic pronouns and possessives accurately, including معه، بجانبه، صغاره، فوقه، خلفه، داخلها.",
              "Treat intensifiers such as كبير جدًا، صغير للغاية، عملاق، ضخم as mandatory visual scale requirements.",
              "Never reuse subjects or scenes from earlier requests. This request is independent and stateless.",
              "Do not add humans, business scenes, offices, meetings, food, flowers, text, logos, or any object not requested.",
              "Make every requested subject clearly visible in the same frame when possible.",
              "Silently verify that the English output contains all requested elements before answering.",
              "Return only the final English visual prompt. No explanation, labels, JSON, markdown, or Arabic.",
              "Arabic request starts:",
              text,
              "Arabic request ends.",
            ].join("\n"),
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 350,
    },
  };

  for (const model of getPromptTranslationModels()) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          cache: "no-store",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify(translationBody),
        }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        console.warn(
          "PROMPT_TRANSLATION_ERROR:",
          model,
          response.status,
          payload?.error?.message || payload?.message || "unknown"
        );
        continue;
      }

      const translated = extractTranslatedPrompt(payload);
      const issue = semanticTranslationIssue(text, translated);
      if (issue) {
        console.warn("PROMPT_TRANSLATION_INVALID:", model, compactForLog(translated || "empty"));
        continue;
      }

      console.log("PROMPT_TRANSLATION_MODE:", "server");
      console.log("PROMPT_TRANSLATION_MODEL:", model);
      console.log("TRANSLATED_PROMPT:", compactForLog(translated));
      await setCachedPromptTranslation(text, translated);
      return assertSemanticTranslation(text, translated);
    } catch (error) {
      console.warn("PROMPT_TRANSLATION_ERROR:", model, error?.name || "error", error?.message || error);
    } finally {
      clearTimeout(timeout);
    }
  }

  const localTranslation = translateArabicToEnglish(text);
  if (localTranslation) {
    const localIssue = semanticTranslationIssue(text, localTranslation);
    if (!localIssue) {
      console.log("PROMPT_TRANSLATION_MODE:", "local-fallback");
      console.log("TRANSLATED_PROMPT:", compactForLog(localTranslation));
      await setCachedPromptTranslation(text, localTranslation);
      return assertSemanticTranslation(text, localTranslation);
    }
  }

  return "";
}

function buildNegativeRules(userPrompt) {
  const lower = String(userPrompt || "").toLowerCase();
  const asksForHuman =
    Boolean(detectProfession(lower)) ||
    includesAny(lower, [
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
  const asksForAnimal = includesAny(lower, [
    "\u0642\u0637",
    "\u0643\u0644\u0628",
    "\u0633\u0645\u0643",
    "\u0633\u0645\u0643\u0629",
    "\u0642\u0631\u0634",
    "\u0642\u0631\u0634\u0629",
    "\u062f\u062c\u0627\u062c",
    "\u062f\u062c\u0627\u062c\u0629",
    "\u0641\u0631\u062e\u0629",
    "\u0643\u062a\u0643\u0648\u062a",
    "\u0633\u0644\u062d\u0641\u0627\u0629",
    "\u0633\u0644\u062d\u0641\u0627\u0647",
    "\u0633\u0644\u062d\u0641\u0627\u062a",
    "\u0630\u0626\u0628",
    "\u0630\u064a\u0628",
    "\u062b\u0639\u0628\u0627\u0646",
    "\u062b\u0639\u0627\u0628\u064a\u0646",
    "\u0623\u0641\u0639\u0649",
    "\u0627\u0641\u0639\u0649",
    "cat",
    "dog",
    "fish",
    "shark",
    "chicken",
    "hen",
    "rooster",
    "chick",
    "turtle",
    "turtles",
    "wolf",
    "wolves",
    "snake",
    "snakes",
    "animal",
  ]);
  const asksForRobot = includesAny(lower, ENTITY_TERMS.robot);
  const asksForCar = includesAny(lower, ["\u0633\u064a\u0627\u0631\u0629", "car", "vehicle"]);
  const asksForFerrari = includesAny(lower, V4_ENTITY_TERMS.ferrari);
  const asksForOffice = includesAny(lower, ["\u0645\u0643\u062a\u0628", "office"]);
  const asksForFood = includesAny(lower, ["\u0637\u0639\u0627\u0645", "\u0623\u0643\u0644", "\u0627\u0643\u0644", "food", "meal"]);
  const asksForBlackDog = includesAny(lower, V4_ENTITY_TERMS.blackDog);

  const rules = [
    "text",
    "letters",
    "watermark",
    "logo",
    "grid lines",
    "photo grid",
    "tiled layout",
    "segmented image",
    "split screen",
    "split panel",
    "multi-panel composition",
    ...GLOBAL_COLLAGE_NEGATIVE_RULES,
    "mosaic",
    "window panes",
    "window frame",
    "window",
    "glass wall",
    "glass panels",
    "panel dividers",
    "rectangular panels",
    "geometric background",
    "checkerboard background",
    "white borders",
    "thick white lines",
    "white separator lines",
    "framed tiles",
    "captions",
    "subtitles",
    "cropped subjects",
    "unrequested extra subjects",
  ];

  if (detectSingleSubjectIntent(userPrompt)) {
    rules.push(
      "multiple subjects",
      "extra copies",
      "repeated subject",
      "subject duplication",
      "multiple images",
      "repeated object"
    );
  }

  if (!asksForHuman) {
    rules.push("humans", "men", "women", "faces", "businessman", "suit", "portrait");
  }

  if (asksForAnimal) {
    rules.push("employees", "business meeting", "meeting room", "conference room", "corporate scene");
    if (!asksForRobot) rules.push("robots");
    if (!asksForCar) rules.push("cars");
    if (!asksForOffice) rules.push("office");
    if (!asksForFood) rules.push("restaurant", "food");
  }

  if (asksForRobot) {
    if (!asksForHuman) rules.push("humans");
    if (!asksForAnimal) rules.push("animals", "cat", "dog");
    if (!asksForFood) rules.push("food");
    if (!asksForOffice) rules.push("office");
    rules.push("businessman", "business suit", "desk", "employees", "business meeting", "meeting room", "conference room", "corporate scene");
  }

  if (asksForFerrari) {
    rules.push("wrong car", "office", "desk", "meeting room", "restaurant", "food");
  }

  if (asksForBlackDog) {
    rules.push("missing dog", "white dog", "brown dog");
  }

  return [...new Set(rules)];
}

function buildNegativePromptText(userPrompt, analysis) {
  return [
    ...new Set([
      ...buildNegativeRules(userPrompt),
      ...(Array.isArray(analysis?.negativeRules) ? analysis.negativeRules : []),
    ]),
  ].join(", ");
}

function buildColorRules(userPrompt, analysis) {
  const lower = String(userPrompt || "").toLowerCase();
  const rules = [];

  if (Object.values(COLOR_TERMS).some((terms) => includesAny(lower, terms))) {
    rules.push("The requested colors must be clearly visible. Do not change any requested color.");
  }

  if (analysis?.subject && analysis?.subjectColor) {
    rules.push(`Keep the ${analysis.subject} ${analysis.subjectColor}.`);
  }

  if (analysis?.object && analysis?.objectColor) {
    rules.push(`Keep the ${analysis.object} ${analysis.objectColor}.`);
  }

  return [...new Set(rules)];
}

function buildRelationshipExactness(userPrompt) {
  const lower = String(userPrompt || "").toLowerCase();

  if (includesAny(lower, ["\u064a\u0637\u064a\u0631 \u0641\u0648\u0642", "\u062a\u0637\u064a\u0631 \u0641\u0648\u0642", "flying above", "flying over"])) {
    return [
      "The requested subject is flying above the requested object.",
      "Show visible air space between the flying subject and the object below.",
      "Both subjects must be visible and spatially separated.",
    ].join(" ");
  }

  if (includesAny(lower, ["\u064a\u062c\u0644\u0633 \u0639\u0644\u0649", "\u062a\u062c\u0644\u0633 \u0639\u0644\u0649", "\u062c\u0627\u0644\u0633 \u0639\u0644\u0649", "sitting on", "sits on"])) {
    return [
      "The requested subject is sitting directly on the requested object.",
      "The supporting object must remain visible underneath the subject.",
      "Do not move the subject beside or behind the object.",
    ].join(" ");
  }

  if (includesAny(lower, ["\u0641\u064a \u062f\u0627\u062e\u0644", "\u062f\u0627\u062e\u0644", "inside"])) {
    return [
      "The requested subject is inside the requested object or place.",
      "Show enough of the surrounding object or interior to make the inside relation unmistakable.",
      "Do not place the subject outside or beside it.",
    ].join(" ");
  }

  if (includesAny(lower, ["\u062e\u0644\u0641", "behind"])) {
    return [
      "The requested subject is behind the requested object.",
      "Use clear depth and partial overlap while keeping both subjects visible.",
      "Do not swap the foreground and background positions.",
    ].join(" ");
  }

  if (includesWholePhrase(lower, "\u0628\u064a\u0646") || includesAny(lower, [" between "])) {
    return [
      "The main subject is positioned between the requested surrounding subjects or objects.",
      "Show the left, center, and right positions clearly.",
      "Keep every requested subject visible.",
    ].join(" ");
  }

  if (includesAny(lower, ["\u064a\u0645\u0633\u0643", "\u062a\u0645\u0633\u0643", "\u0645\u0645\u0633\u0643", "holding", "holds"])) {
    return [
      "The requested subject is physically holding the requested object.",
      "Show the hand or grip clearly connected to the held object.",
      "Do not place the object floating or elsewhere in the scene.",
    ].join(" ");
  }

  if (includesAny(lower, ["\u064a\u0642\u0648\u062f", "\u062a\u0642\u0648\u062f", "driving", "drives"])) {
    return [
      "The requested subject is driving the requested vehicle.",
      "Show the subject in the driver's position with hands controlling the vehicle.",
      "Do not place the subject merely beside the vehicle.",
    ].join(" ");
  }

  if (includesAny(lower, ["\u0631\u0627\u0643\u0628", "riding", "sitting inside"])) {
    return [
      "The requested subject is sitting inside / riding in the requested vehicle.",
      "The vehicle must be clearly visible.",
      "Keep the requested vehicle and its interior as the only surrounding scene.",
    ].join(" ");
  }

  if (includesAny(lower, ["\u064a\u0631\u062a\u062f\u064a", "\u062a\u0631\u062a\u062f\u064a", "\u0644\u0627\u0628\u0633", "\u0644\u0627\u0628\u0633\u0629", "wearing", "wears"])) {
    return [
      "The requested clothing or accessory is being worn by the subject.",
      "Make the worn item clearly visible on the subject.",
      "Do not place the item beside the subject.",
    ].join(" ");
  }

  if (includesAny(lower, ["\u064a\u0646\u0638\u0631 \u0625\u0644\u0649", "\u064a\u0646\u0638\u0631 \u0627\u0644\u0649", "\u062a\u0646\u0638\u0631 \u0625\u0644\u0649", "\u062a\u0646\u0638\u0631 \u0627\u0644\u0649", "looking at", "looks at"])) {
    return [
      "The subject is looking directly at the requested target.",
      "The gaze direction must clearly point toward the target.",
      "Keep both the subject and target visible.",
    ].join(" ");
  }

  if (includesAny(lower, ["\u0641\u0648\u0642", "\u0639\u0644\u0649 \u0633\u0637\u062d", "\u0633\u0637\u062d", "on top", "above", "roof"])) {
    return [
      "The relation is standing on top of the requested object.",
      "The object underneath must be visible.",
      "Do not place the subject beside the object or remove the object.",
    ].join(" ");
  }

  if (includesAny(lower, ["\u0623\u0645\u0627\u0645", "\u0627\u0645\u0627\u0645", "in front"])) {
    return [
      "The relation is in front of the requested object.",
      "Both the foreground subject and the background object must be visible.",
      "Do not hide or remove either subject.",
    ].join(" ");
  }

  if (includesAny(lower, ["\u0628\u062c\u0627\u0646\u0628", "next to", "beside", "\u0645\u0639"])) {
    return [
      "If multiple subjects are requested, show every subject clearly, side by side.",
      "Both subjects must be visible in the frame.",
      "Do not remove any subject.",
    ].join(" ");
  }

  if (
    includesAny(lower, [
      "\u062c\u0646\u0628\u0647",
      "\u062c\u0646\u0628\u0647\u0627",
      "\u062c\u0646\u0628\u0647\u0645",
      "\u0628\u062c\u0648\u0627\u0631",
      "\u0628\u062c\u0648\u0627\u0631\u0647",
      "\u0628\u062c\u0648\u0627\u0631\u0647\u0627",
      "\u0628\u062c\u0648\u0627\u0631\u0647\u0645",
      "alongside",
    ])
  ) {
    return [
      "If multiple subjects are requested, keep them next to each other in the same frame.",
      "Every requested subject must remain clearly visible at the same time.",
      "Do not separate the subjects into different panels, scenes, or repeated layouts.",
    ].join(" ");
  }

  return "Follow the subject exactly and do not reuse previous subjects.";
}

function buildLocationAnchorRules(userPrompt) {
  const lower = String(userPrompt || "").toLowerCase();
  const rules = [];

  if (includesAny(lower, ["\u062f\u0627\u062e\u0644", "\u0641\u064a \u062f\u0627\u062e\u0644", "inside", "within"])) {
    rules.push("If the request says inside something, clearly show the subject inside that exact place or object, not merely near it.");
  }

  if (includesAny(lower, ["\u0639\u0634", "\u0639\u0634\u0647", "\u0639\u0634\u0647\u0627", "\u0639\u0634\u0647\u0645", "nest"])) {
    rules.push("If a nest is requested, the nest itself must be clearly visible together with the bird in the same frame.");
  }

  if (includesAny(lower, ["\u0641\u0648\u0642", "\u0639\u0644\u0649 \u0633\u0637\u062d", "\u0633\u0637\u062d", "on top", "above"])) {
    rules.push("When a top/above relation is requested, keep the supporting object fully visible beneath the subject.");
  }

  if (includesAny(lower, ["\u062e\u0644\u0641", "behind"])) {
    rules.push("When a behind relation is requested, keep both the front and back subjects visible with clear depth.");
  }

  return rules;
}

function buildFinalPrompt({
  userPrompt,
  quality = "normal",
  style = "",
  type = "image",
  translatedPromptOverride = "",
}) {
  const analysis = analyzePromptV3(userPrompt);
  const arabicPrompt = hasArabicText(userPrompt);
  const prefersStructuredLocalPrompt = !arabicPrompt && analysis?.finalPrompt && !hasArabicText(analysis.finalPrompt);
  const translatedPrompt =
    String(translatedPromptOverride || "").trim() ||
    (prefersStructuredLocalPrompt ? analysis.finalPrompt : !arabicPrompt ? String(userPrompt || "").trim() : "");
  if (!translatedPrompt || hasArabicText(translatedPrompt)) {
    throw serviceError(
      "تعذر فهم الوصف العربي بدقة الآن. أعد المحاولة بصياغة أوضح، ولم يتم خصم أي رصيد.",
      422
    );
  }
  const qualityText = QUALITY_LABELS[normalizeQuality(quality)] || QUALITY_LABELS.normal;
  const styleText = STYLE_LABELS[style] || STYLE_LABELS.realistic;
  const colorRules = buildColorRules(userPrompt, analysis);
  const countRules = buildCountRules(userPrompt);
  const singleSubjectRules = buildSingleSubjectRules(userPrompt);
  const analysisRules = Array.isArray(analysis?.promptRules) ? analysis.promptRules.filter(Boolean) : [];
  const locationAnchorRules = buildLocationAnchorRules(userPrompt);
  const exactness = buildRelationshipExactness(userPrompt);

  if (analysis) {
    console.log("PROMPT_V3_STRUCTURE:", JSON.stringify({
      subject: analysis.subject,
      subjectColor: analysis.subjectColor,
      object: analysis.object,
      objectColor: analysis.objectColor,
      relation: analysis.relation,
    }));
  }

  return [
    type === "video"
      ? "Create a short video that follows this request exactly:"
      : "Create an image that follows this request exactly:",
    translatedPrompt,
    "",
    "Strict rules:",
    "- Follow the subject exactly.",
    `- ${exactness}`,
    ...countRules.map((rule) => `- ${rule}`),
    ...singleSubjectRules.map((rule) => `- ${rule}`),
    ...analysisRules.map((rule) => `- ${rule}`),
    ...locationAnchorRules.map((rule) => `- ${rule}`),
    ...colorRules.map((rule) => `- ${rule}`),
    "Mandatory composition rules:",
    "- All requested subjects must appear.",
    "- Do not remove any requested subject.",
    "- Keep all requested colors accurate.",
    "- The main subjects must be centered and fully visible.",
    "- Keep every requested object, place, container, or support element visible when it is part of the description.",
    "- Render only the requested subjects, actions, and environment.",
    "- Do not introduce any unrequested subject, object, or secondary scene.",
    "- Use one coherent full-frame scene only.",
    "- The output must be one natural single image, not a designed layout.",
    "- No inset image, picture-in-picture, collage, split panel, poster, framed photo, overlay, contact sheet, storyboard, comic panel, gallery layout, multiple frames, image mosaic, tiled images, grid layout, or split-screen composition.",
    "- No window-pane layout, panel dividers, thick white borders, or white separator lines across the image.",
    "- Do not add extra subjects beyond the requested count.",
    "- Keep every requested subject fully inside the frame. Do not crop, repeat, or duplicate subjects or objects.",
    "- No text, no watermark, no logo, no UI overlay, no grid lines.",
    `- Style: ${styleText}.`,
    `- Quality: ${qualityText}, clean composition, professional lighting, main subject clearly visible.`,
  ].join("\n");
}

function extractPositiveTranslationCandidate(prompt) {
  const normalized = String(prompt || "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }

  const segments = normalized.split(/(?<=[.!?])\s+/);
  const kept = [];

  for (const segment of segments) {
    const trimmed = segment.trim();
    if (!trimmed) continue;
    if (/^(strict rules:|- )/i.test(trimmed)) break;
    if (/^(do not|don't|no\b|without\b|avoid\b|never\b)/i.test(trimmed)) break;
    kept.push(trimmed);
  }

  return kept.join(" ").trim() || normalized;
}

export function buildWaveSpeedPrompt(options) {
  return buildFinalPrompt(options);
}

export function buildSmartPromptEnhancement({ userPrompt, quality = "normal", style = "", type = "image" }) {
  const prompt = String(userPrompt || "").trim();
  const analysis = analyzePromptV3(prompt);
  const positiveStructuredPrompt =
    analysis?.finalPrompt && !hasArabicText(analysis.finalPrompt)
      ? extractPositiveTranslationCandidate(analysis.finalPrompt)
      : "";
  const enhancedPrompt =
    analysis?.enhancedPrompt ||
    [
      `صورة واقعية عالية الجودة لـ ${prompt}.`,
      "يجب أن تظهر جميع العناصر المطلوبة بوضوح داخل الإطار.",
      "حافظ على الألوان والعلاقات المذكورة بدقة، ولا تحذف أي عنصر مطلوب.",
      "لا تضف عناصر عشوائية أو نصوصًا أو شعارات.",
    ].join(" ");
  const finalPrompt = buildFinalPrompt({
    userPrompt: prompt,
    quality,
    style,
    type,
    translatedPromptOverride: positiveStructuredPrompt,
  });
  const negativePrompt = buildNegativePromptText(prompt, analysis);

  return {
    enhancedPrompt,
    finalPrompt,
    negativePrompt,
    debug: analysis?.debug || null,
  };
}

export async function buildSmartPromptEnhancementAsync(
  { userPrompt, quality = "normal", style = "", type = "image" },
  { translatePrompt = translateArabicPromptForGeneration } = {}
) {
  const prompt = String(userPrompt || "").trim();
  const analysis = analyzePromptV3(prompt);
  const positiveStructuredPrompt =
    analysis?.finalPrompt && !hasArabicText(analysis.finalPrompt)
      ? extractPositiveTranslationCandidate(analysis.finalPrompt)
      : "";
  const hasStructuredLocalPrompt =
    type === "image" &&
    normalizeQuality(quality) === "normal" &&
    Boolean(positiveStructuredPrompt) &&
    !analysis?.promptRules?.length &&
    Boolean(detectSingleSubjectIntent(prompt));
  const translatedPromptOverride =
    hasStructuredLocalPrompt
      ? positiveStructuredPrompt
      : hasArabicText(prompt)
        ? await translatePrompt(prompt)
        : "";
  const usedStructuredLocalTranslation =
    hasArabicText(prompt) &&
    Boolean(translatedPromptOverride) &&
    translatedPromptOverride === positiveStructuredPrompt;
  if (translatedPromptOverride) {
    assertSemanticTranslation(prompt, translatedPromptOverride);
  }
  const enhancedPrompt =
    analysis?.enhancedPrompt ||
    [
      `صورة واقعية عالية الجودة حسب هذا الوصف: ${prompt}.`,
      "يجب أن تظهر جميع العناصر المطلوبة بوضوح داخل الإطار.",
      "حافظ على العدد والألوان والأحجام والأفعال والعلاقات المكانية المذكورة بدقة.",
      "لا تحذف أي عنصر مطلوب ولا تضف أشخاصًا أو أطعمة أو مكاتب أو عناصر عشوائية.",
    ].join(" ");
  const finalPrompt = buildFinalPrompt({
    userPrompt: prompt,
    quality,
    style,
    type,
    translatedPromptOverride,
  });
  const negativePrompt = buildNegativePromptText(prompt, analysis);

    return {
      enhancedPrompt,
      finalPrompt,
      negativePrompt,
      debug: {
        ...(analysis?.debug || {}),
        translationMode: usedStructuredLocalTranslation
          ? "local-structured"
          : translatedPromptOverride
            ? "server-semantic"
            : hasStructuredLocalPrompt
            ? "local-structured"
            : "translation-unavailable",
      },
    };
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

function stringifyForLog(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch (error) {
    return String(value);
  }
}

function buildEndpointFromModelPath(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^https?:\/\//i.test(text)) return text;
  return `https://api.wavespeed.ai/api/v3/${text.replace(/^\/+/, "")}`;
}

function normalizeWaveSpeedModelItem(item) {
  if (!item) return null;

  if (typeof item === "string") {
    return {
      id: item,
      model: item,
      name: item,
      apiPath: item,
      endpoint: buildEndpointFromModelPath(item),
      kind: inferWaveSpeedModelKind(item),
      raw: item,
    };
  }

  if (typeof item !== "object") return null;

  const id =
    item.id ||
    item.model ||
    item.model_id ||
    item.modelId ||
    item.name ||
    item.slug ||
    item.path ||
    item.api_path ||
    item.apiPath;
  const apiPath =
    item.api_path ||
    item.apiPath ||
    item.path ||
    item.endpoint ||
    item.url ||
    item.model ||
    item.id ||
    id;

  if (!id && !apiPath) return null;

  const text = stringifyForLog(item);
  return {
    id: String(id || apiPath),
    model: String(id || apiPath),
    name: String(item.name || item.title || id || apiPath),
    apiPath: String(apiPath || id),
    endpoint: buildEndpointFromModelPath(apiPath || id),
    category: item.category || item.type || item.task || item.tags || null,
    kind: inferWaveSpeedModelKind(text),
    raw: item,
  };
}

function collectWaveSpeedModels(value, result = []) {
  if (!value) return result;

  if (Array.isArray(value)) {
    for (const item of value) {
      const normalized = normalizeWaveSpeedModelItem(item);
      if (normalized) result.push(normalized);
      if (item && typeof item === "object") {
        collectWaveSpeedModels(item.models || item.items || item.data || item.results, result);
      }
    }
    return result;
  }

  if (typeof value === "object") {
    const normalized = normalizeWaveSpeedModelItem(value);
    if (normalized) result.push(normalized);
    for (const key of ["models", "items", "data", "results", "list"]) {
      collectWaveSpeedModels(value[key], result);
    }
  }

  return result;
}

function inferWaveSpeedModelKind(value) {
  const text = String(value || "").toLowerCase();
  const hasVideo = /video|text-to-video|t2v|i2v|wan|kling|veo|seedance|animate/.test(text);
  const hasImage = /image|text-to-image|t2i|z-image|seedream|banana|photo/.test(text);

  if (hasImage && !hasVideo) return "image";
  if (hasVideo && !hasImage) return "video";
  if (hasVideo) return "video";
  if (hasImage) return "image";
  return "unknown";
}

function uniqueModels(models) {
  const seen = new Set();
  return models.filter((model) => {
    const key = `${model.endpoint}|${model.model}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function fetchWaveSpeedModels({ includeRaw = false } = {}) {
  const apiKey = requireApiKey();
  const endpoint = process.env.WAVESPEED_MODELS_URL || "https://api.wavespeed.ai/api/v3/models";
  const response = await fetch(endpoint, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Cache-Control": "no-store",
      Authorization: `Bearer ${apiKey}`,
    },
  });
  const data = await readJsonResponse(response);

  if (!response.ok) {
    console.error("WAVESPEED MODELS ERROR:", stringifyForLog({ status: response.status, data }));
    throw serviceError(
      data?.message || data?.error || data?.detail || "تعذر جلب قائمة موديلات WaveSpeed.",
      response.status >= 500 ? 502 : 400
    );
  }

  const models = uniqueModels(collectWaveSpeedModels(data)).map(({ raw, ...model }) => model);
  console.log("WAVESPEED MODELS COUNT:", models.length);
  console.log("WAVESPEED MODELS:", stringifyForLog(models.slice(0, 100)));

  return {
    endpoint,
    count: models.length,
    models,
    raw: includeRaw ? data : undefined,
  };
}

function pickFirstAvailableModel(models, mediaType) {
  const expectedKind = mediaType === "video" ? "video" : "image";
  const candidates = models.filter((model) => model.kind === expectedKind && model.endpoint);

  if (candidates.length === 0) return null;

  const preferredPatterns =
    mediaType === "video"
      ? [/text-to-video/i, /t2v/i, /wan/i, /kling/i, /veo/i]
      : [/text-to-image/i, /z-image/i, /seedream/i, /banana/i, /image/i];

  for (const pattern of preferredPatterns) {
    const found = candidates.find((model) => pattern.test(`${model.model} ${model.apiPath} ${model.endpoint}`));
    if (found) return found;
  }

  return candidates[0];
}

function isModelNotFoundError(error) {
  return /model\s+not\s+found|not\s+found.*model|invalid\s+model|bad\s+request/i.test(
    `${error?.message || ""} ${stringifyForLog(error?.providerData || "")}`
  );
}

function getConfiguredFallbackCandidates(mediaType, quality) {
  const normalizedQuality = normalizeQuality(quality);
  const source = mediaType === "video" ? WAVE_VIDEO_MODEL_CANDIDATES : WAVE_IMAGE_MODEL_CANDIDATES;
  return source[normalizedQuality] || source.normal || [];
}

async function resolveWaveSpeedFallbackCandidates({ apiKey, mediaType, quality, failedEndpoint }) {
  const configuredCandidates = getConfiguredFallbackCandidates(mediaType, quality).filter(
    (candidate) => candidate.endpoint && candidate.endpoint !== failedEndpoint
  );

  const available = await fetchWaveSpeedModels({ includeRaw: false }).catch((error) => {
    console.error("WAVESPEED MODEL LIST FALLBACK ERROR:", error?.message || error);
    return null;
  });

  const picked = available ? pickFirstAvailableModel(available.models || [], mediaType) : null;
  const modelListCandidate =
    picked && picked.endpoint !== failedEndpoint
      ? {
          model: picked.model,
          endpoint: picked.endpoint,
        }
      : null;

  const candidates = [...configuredCandidates, modelListCandidate].filter(Boolean);
  const seen = new Set();
  return candidates.filter((candidate) => {
    const key = `${candidate.endpoint}|${candidate.model}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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

function providerRejectsNegativePrompt(error) {
  const haystack = `${error?.message || ""} ${stringifyForLog(error?.providerData || "")}`.toLowerCase();
  return /negative[_\s-]*prompt/.test(haystack) && /(unknown|unsupported|invalid|unexpected|extra|not allowed|not permitted)/.test(haystack);
}

async function postWaveSpeed({ apiKey, endpoint, body }) {
  console.log("WAVESPEED ENDPOINT:", endpoint);
  console.log("WAVESPEED BODY:", stringifyForLog({ ...body, prompt: compactForLog(body?.prompt) }));

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
    console.error(
      "WAVESPEED ERROR:",
      stringifyForLog({
        status: response.status,
        endpoint,
        body: { ...body, prompt: compactForLog(body?.prompt) },
        data,
      })
    );
    const message = data?.message || data?.error || data?.detail || "فشل طلب التوليد من WaveSpeed.";
    const error = serviceError(typeof message === "string" ? message : JSON.stringify(message), response.status >= 500 ? 502 : 400);
    error.providerData = data;
    error.providerStatus = response.status;
    error.providerEndpoint = endpoint;
    throw error;
  }

  return data;
}

async function postWaveSpeedWithFallback({ apiKey, endpoint, body, mediaType, quality, model }) {
  try {
    return {
      initial: await postWaveSpeed({ apiKey, endpoint, body }),
      endpoint,
      model,
      usedFallback: false,
    };
  } catch (error) {
    if (body?.negative_prompt && providerRejectsNegativePrompt(error)) {
      const fallbackBody = { ...body };
      delete fallbackBody.negative_prompt;
      console.warn("WAVESPEED RETRY WITHOUT NEGATIVE_PROMPT:", endpoint);
      return {
        initial: await postWaveSpeed({ apiKey, endpoint, body: fallbackBody }),
        endpoint,
        model,
        usedFallback: false,
      };
    }

    if (!isModelNotFoundError(error)) {
      throw error;
    }

    const fallbacks = await resolveWaveSpeedFallbackCandidates({
      apiKey,
      mediaType,
      quality,
      failedEndpoint: endpoint,
    });

    if (fallbacks.length === 0) {
      throw error;
    }

    let lastError = error;
    for (const fallback of fallbacks) {
      try {
        console.warn(
          "WAVESPEED MODEL FALLBACK:",
          stringifyForLog({
            mediaType,
            quality,
            failedModel: model,
            failedEndpoint: endpoint,
            fallbackModel: fallback.model,
            fallbackEndpoint: fallback.endpoint,
          })
        );
        console.log("WAVESPEED MODEL:", fallback.model);

        return {
          initial: await postWaveSpeed({ apiKey, endpoint: fallback.endpoint, body }),
          endpoint: fallback.endpoint,
          model: fallback.model,
          usedFallback: true,
        };
      } catch (fallbackError) {
        lastError = fallbackError;
      }
    }

    throw lastError;
  }
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

  const attemptsEnvName = mediaType === "image" ? "WAVESPEED_IMAGE_POLL_ATTEMPTS" : "WAVESPEED_VIDEO_POLL_ATTEMPTS";
  const intervalEnvName = mediaType === "image" ? "WAVESPEED_IMAGE_POLL_INTERVAL_MS" : "WAVESPEED_VIDEO_POLL_INTERVAL_MS";
  const defaultAttempts = mediaType === "image" ? 20 : 60;
  const defaultIntervalMs = mediaType === "image" ? 1500 : 3000;
  const attempts = Math.max(
    Number(process.env[attemptsEnvName] || process.env.WAVESPEED_POLL_ATTEMPTS || defaultAttempts),
    1
  );
  const intervalMs = Math.max(
    Number(process.env[intervalEnvName] || process.env.WAVESPEED_POLL_INTERVAL_MS || defaultIntervalMs),
    500
  );

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

function imageResultValidationEnabled() {
  const flag = String(process.env.IMAGE_RESULT_VALIDATION_ENABLED || "").trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(flag)) {
    return true;
  }
  if (["false", "0", "no", "off"].includes(flag)) {
    return false;
  }
  return Boolean(getPromptTranslationKey());
}

function imageResultValidationRequired() {
  return String(process.env.IMAGE_RESULT_VALIDATION_REQUIRED || "false").trim().toLowerCase() !== "false";
}

function imageResultValidationAttempts() {
  const value = Number(process.env.IMAGE_RESULT_VALIDATION_ATTEMPTS || 2);
  return Math.min(Math.max(Number.isFinite(value) ? Math.floor(value) : 1, 1), 2);
}

function validationIndicatesPanelArtifact(validation) {
  const haystack = [
    validation?.reason || "",
    ...(Array.isArray(validation?.unexpectedElements) ? validation.unexpectedElements : []),
    ...(Array.isArray(validation?.missingElements) ? validation.missingElements : []),
  ]
    .join(" ")
    .toLowerCase();

  return /(grid|grid layout|photo grid|window-pane|window pane|window|panel|comic panel|divider|separator|split screen|split-screen|split panel|collage|contact sheet|storyboard|gallery layout|multiple frames|mosaic|image mosaic|tiled image|checkerboard|white border|white line|rectangular|duplicate subject|repeated object)/i.test(
    haystack
  );
}

export function parseImageValidationPayload(payload) {
  const rawText =
    typeof payload === "string"
      ? payload
      : extractTranslatedPrompt(payload);
  const cleanText = String(rawText || "")
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  if (!cleanText) {
    throw new Error("Empty image validation response.");
  }

  const parsed = JSON.parse(cleanText);
  return {
    checked: true,
    passed: parsed?.passed === true,
    reason: String(parsed?.reason || "").trim(),
    unexpectedElements: Array.isArray(parsed?.unexpectedElements)
      ? parsed.unexpectedElements.map((item) => String(item))
      : [],
    missingElements: Array.isArray(parsed?.missingElements)
      ? parsed.missingElements.map((item) => String(item))
      : [],
  };
}

async function downloadImageForValidation(resultUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);

  try {
    const response = await fetch(resultUrl, {
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "image/*",
        "Cache-Control": "no-store",
      },
    });

    if (!response.ok) {
      throw new Error(`Image download failed with status ${response.status}.`);
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    const maxBytes = 15 * 1024 * 1024;
    if (!bytes.length || bytes.length > maxBytes) {
      throw new Error("Generated image is empty or too large for validation.");
    }

    return {
      mimeType: String(response.headers.get("content-type") || "image/jpeg").split(";")[0],
      data: bytes.toString("base64"),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function validateGeneratedImageAgainstPrompt({ resultUrl, userPrompt, finalPrompt }) {
  const apiKey = getPromptTranslationKey();
  if (!imageResultValidationEnabled() || !apiKey) {
    return {
      checked: false,
      passed: !imageResultValidationRequired(),
      reason: apiKey ? "validation_disabled" : "validation_key_unavailable",
      unexpectedElements: [],
      missingElements: [],
    };
  }

  const image = await downloadImageForValidation(resultUrl);
  const model = String(
    process.env.PROMPT_VALIDATION_MODEL ||
      process.env.PROMPT_TRANSLATION_MODEL ||
      "gemini-3.1-flash-lite"
  ).trim();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        cache: "no-store",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: [
                    "You are a strict visual quality gate for an image generation service.",
                    "Compare the generated image with the current user request and final English prompt.",
                    "Reject the image when a main requested subject, action, count, color, size, or spatial relationship is missing or materially wrong.",
                    "Reject any human, office, business meeting, food, inset image, picture-in-picture, collage, framed photo, poster, caption, or unrelated secondary scene unless the current request explicitly asks for it.",
                    "Reject any tiled layout, multi-panel composition, contact sheet, storyboard, comic panel, gallery layout, multiple frames, grid layout, segmented image, split-screen composition, window-pane layout, mosaic, visible panel dividers, thick white separator lines, or white borders that divide the frame into parts.",
                    "Reject duplicated, repeated, or substituted subjects and repeated objects.",
                    "Minor artistic differences are acceptable only when every requested concept remains correct.",
                    `Current user request: ${String(userPrompt || "").trim()}`,
                    `Current final prompt: ${String(finalPrompt || "").trim()}`,
                    'Return JSON only: {"passed":true|false,"reason":"short reason","unexpectedElements":[],"missingElements":[]}',
                  ].join("\n"),
                },
                {
                  inlineData: image,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 300,
            responseMimeType: "application/json",
          },
        }),
      }
    );
    const payload = await readJsonResponse(response);
    if (!response.ok) {
      throw new Error(payload?.error?.message || `Image validation failed with status ${response.status}.`);
    }
    return parseImageValidationPayload(payload);
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateRawImageWithWaveSpeed({
  prompt = "A white chicken standing on a farm. No humans.",
  model = "wavespeed-ai/z-image/turbo",
  endpoint = "https://api.wavespeed.ai/api/v3/wavespeed-ai/z-image/turbo",
  aspectRatio = "1:1",
  seed,
} = {}) {
  const apiKey = requireApiKey();
  const safeSeed = randomSeed(seed);
  const body = {
    prompt: String(prompt || "").trim(),
    width: 1024,
    height: 1024,
    steps: 28,
    aspect_ratio: normalizeAspectRatio(aspectRatio),
    seed: safeSeed,
    enable_base64_output: false,
  };

  console.log("RAW_IMAGE_DEBUG_PROVIDER:", "wavespeed");
  console.log("RAW_IMAGE_DEBUG_MODEL:", model);
  console.log("RAW_IMAGE_DEBUG_ENDPOINT:", endpoint);
  console.log("RAW_IMAGE_DEBUG_SEED:", safeSeed);
  console.log("RAW WAVESPEED BODY SENT:", JSON.stringify(body, null, 2));

  const initial = await postWaveSpeed({
    apiKey,
    endpoint,
    body,
  });
  const resultUrl = await pollWaveSpeedResult({ apiKey, initial, mediaType: "image" });

  console.log("RAW_IMAGE_DEBUG_RESULT_URL:", resultUrl);

  return {
    provider: "wavespeed",
    model,
    endpoint,
    prompt: body.prompt,
    seed: safeSeed,
    resultUrl,
    raw: initial,
  };
}

export async function generateImageWithWaveSpeed({
  prompt,
  quality = "normal",
  aspectRatio = "16:9",
  style = "",
  requestId = "",
  seed,
  modelOverride = "",
  endpointOverride = "",
  allowFallback = true,
}) {
  const apiKey = requireApiKey();
  const normalizedQuality = normalizeQuality(quality);
  const baseConfig = getImageConfig(normalizedQuality);
  const model = String(modelOverride || baseConfig.model || "").trim();
  const endpoint = String(endpointOverride || (modelOverride ? buildEndpointFromModelPath(modelOverride) : baseConfig.endpoint) || "").trim();
  const analysis = analyzePromptV3(prompt);
  const hasStructuredLocalPrompt = Boolean(analysis?.finalPrompt && !hasArabicText(analysis.finalPrompt));
  const translatedPromptOverride = hasStructuredLocalPrompt
    ? analysis.finalPrompt
    : await translateArabicPromptForGeneration(prompt);
  const finalPrompt = buildFinalPrompt({
    userPrompt: prompt,
    quality: normalizedQuality,
    style,
    type: "image",
    translatedPromptOverride,
  });
  const negativePrompt = buildNegativePromptText(prompt, analysis);
  const safeSeed = randomSeed(seed);
  const body = {
    prompt: finalPrompt,
    negative_prompt: negativePrompt,
    aspect_ratio: normalizeAspectRatio(aspectRatio),
    seed: safeSeed,
    enable_base64_output: false,
  };
  const shouldSkipValidation =
    normalizedQuality === "normal" &&
    hasStructuredLocalPrompt &&
    !analysis?.promptRules?.length &&
    detectSingleSubjectIntent(prompt);

  console.log("PROVIDER:", "wavespeed");
  console.log("TYPE:", "image");
  console.log("QUALITY:", normalizedQuality);
  console.log("MODEL:", model);
  console.log("WAVESPEED MODEL:", model);
  console.log("REQUEST_ID:", requestId);
  logPromptDiagnostics({ userPrompt: prompt, finalPrompt });
  console.log("IMAGE_VALIDATION_MODE:", shouldSkipValidation ? "fast-path-skip" : "standard");
  console.log(
    "WAVESPEED BODY SENT:",
    JSON.stringify({
      ...body,
      prompt: promptVerboseLogsEnabled() ? compactForLog(body.prompt) : "[redacted]",
      negative_prompt: promptVerboseLogsEnabled() ? body.negative_prompt : "[redacted]",
    })
  );

  const attempts = !shouldSkipValidation && getPromptTranslationKey() && imageResultValidationEnabled()
    ? imageResultValidationAttempts()
    : 1;
  let lastValidation = null;
  let lastGeneratedResult = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const attemptSeed = attempt === 1 ? safeSeed : randomSeed();
    const attemptBody = {
      ...body,
      seed: attemptSeed,
    };
    const request = allowFallback
      ? await postWaveSpeedWithFallback({
          apiKey,
          endpoint,
          body: attemptBody,
          mediaType: "image",
          quality: normalizedQuality,
          model,
        })
      : {
          initial: await postWaveSpeed({ apiKey, endpoint, body: attemptBody }),
          endpoint,
          model,
          usedFallback: false,
        };
    const resultUrl = await pollWaveSpeedResult({
      apiKey,
      initial: request.initial,
      mediaType: "image",
    });
    lastGeneratedResult = {
      request,
      resultUrl,
      seed: attemptSeed,
    };

    console.log("NEW RESULT URL:", resultUrl);

    if (shouldSkipValidation) {
      lastValidation = {
        checked: false,
        passed: true,
        reason: "fast_path_simple_single_subject",
        unexpectedElements: [],
        missingElements: [],
      };
    } else {
      try {
        lastValidation = await validateGeneratedImageAgainstPrompt({
          resultUrl,
          userPrompt: prompt,
          finalPrompt,
        });
      } catch (error) {
        console.warn("IMAGE_RESULT_VALIDATION_ERROR:", error?.message || error);
        lastValidation = {
          checked: false,
          passed: !imageResultValidationRequired(),
          reason: "validator_error",
          unexpectedElements: [],
          missingElements: [],
        };
      }
    }

    console.log("IMAGE_RESULT_VALIDATION:", {
      requestId,
      attempt,
      seed: attemptSeed,
      model: request.model,
      ...lastValidation,
    });

    if (lastValidation.passed) {
      return {
        provider: "wavespeed",
        model: request.model,
        finalPrompt,
        seed: attemptSeed,
        resultUrl,
        validation: lastValidation,
        raw: request.initial,
      };
    }
  }

  if (lastValidation && !imageResultValidationRequired() && !validationIndicatesPanelArtifact(lastValidation)) {
    console.warn("IMAGE_RESULT_VALIDATION_BYPASS:", {
      reason: lastValidation.reason || "validation_not_passed",
      unexpectedElements: lastValidation.unexpectedElements || [],
      missingElements: lastValidation.missingElements || [],
    });
    if (!lastGeneratedResult) {
      throw serviceError("تعذر إتمام الطلب مؤقتًا، حاول لاحقًا. لم يتم خصم أي رصيد.", 502);
    }
    return {
      provider: "wavespeed",
      model: lastGeneratedResult.request.model,
      finalPrompt,
      seed: lastGeneratedResult.seed,
      resultUrl: lastGeneratedResult.resultUrl,
      validation: {
        ...lastValidation,
        bypassed: true,
      },
      raw: lastGeneratedResult.request.initial,
    };
  }

  throw serviceError(
    "تعذر إخراج نتيجة مطابقة للوصف بدقة في الوقت الحالي. لم يتم خصم أي رصيد.",
    422
  );
}

export async function generateVideoWithWaveSpeed({
  prompt,
  duration = 5,
  quality = "normal",
  aspectRatio = "16:9",
  style = "",
  requestId = "",
  seed,
  modelOverride = "",
  endpointOverride = "",
  allowFallback = true,
}) {
  const apiKey = requireApiKey();
  const normalizedQuality = normalizeQuality(quality);
  const baseConfig = getVideoConfig(normalizedQuality);
  const model = String(modelOverride || baseConfig.model || "").trim();
  const endpoint = String(endpointOverride || (modelOverride ? buildEndpointFromModelPath(modelOverride) : baseConfig.endpoint) || "").trim();
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
      allowFallback,
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
    allowFallback,
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
  allowFallback = true,
}) {
  const safeDuration = validateDuration(model, endpoint, duration);
  const translatedPromptOverride = await translateArabicPromptForGeneration(prompt);
  const finalPrompt = buildFinalPrompt({
    userPrompt: prompt,
    quality,
    style,
    type: "video",
    translatedPromptOverride,
  });
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
  console.log("WAVESPEED MODEL:", model);
  console.log("REQUEST_ID:", requestId);
  logPromptDiagnostics({ userPrompt: prompt, finalPrompt });
  console.log(
    "WAVESPEED BODY SENT:",
    JSON.stringify({
      ...body,
      prompt: promptVerboseLogsEnabled() ? compactForLog(body.prompt) : "[redacted]",
    })
  );

  const request = allowFallback
    ? await postWaveSpeedWithFallback({
        apiKey,
        endpoint,
        body,
        mediaType: "video",
        quality,
        model,
      })
    : {
        initial: await postWaveSpeed({ apiKey, endpoint, body }),
        endpoint,
        model,
        usedFallback: false,
      };
  const resultUrl = await pollWaveSpeedResult({ apiKey, initial: request.initial, mediaType: "video" });

  console.log("NEW RESULT URL:", resultUrl);

  return {
    provider: "wavespeed",
    model: request.model,
    finalPrompt,
    seed: safeSeed,
    resultUrl,
    raw: request.initial,
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
  allowFallback = true,
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
      allowFallback,
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
