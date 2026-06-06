import { Prisma } from "@prisma/client";

export const MODEL_QUALITY_IMAGE_MODELS = [
  {
    id: "wavespeed-ai/z-image/turbo",
    label: "Z Image Turbo",
    type: "image",
    quality: "normal",
    intendedUse: "simple",
    useLabel: "Simple image prompts only",
    endpoint: "https://api.wavespeed.ai/api/v3/wavespeed-ai/z-image/turbo",
  },
  {
    id: "bytedance/seedream-v4.5",
    label: "Seedream 4.5",
    type: "image",
    quality: "high",
    intendedUse: "medium",
    useLabel: "Medium image prompts and common multi-subject scenes",
    endpoint: "https://api.wavespeed.ai/api/v3/bytedance/seedream-v4.5",
  },
  {
    id: "google/nano-banana-pro",
    label: "Nano Banana Pro",
    type: "image",
    quality: "ultra",
    intendedUse: "complex",
    useLabel: "Complex professional image prompts",
    endpoint: "https://api.wavespeed.ai/api/v3/google/nano-banana-pro/text-to-image",
  },
];

export const MODEL_QUALITY_VIDEO_MODELS = [
  {
    id: "wavespeed-ai/wan-2.2/t2v-480p-ultra-fast",
    label: "Wan 2.2 Ultra Fast",
    type: "video",
    quality: "normal",
    intendedUse: "simple",
    useLabel: "Economic short videos",
    endpoint: "https://api.wavespeed.ai/api/v3/wavespeed-ai/wan-2.2/t2v-480p-ultra-fast",
  },
  {
    id: "wavespeed-ai/wan-2.2-animate/text-to-video",
    label: "Wan 2.2 Animate",
    type: "video",
    quality: "high",
    intendedUse: "medium",
    useLabel: "Medium quality motion tests",
    endpoint: "https://api.wavespeed.ai/api/v3/wavespeed-ai/wan-2.2-animate/text-to-video",
  },
  {
    id: "kwaivgi/kling-v3.0-std/text-to-video",
    label: "Kling 3.0 Standard",
    type: "video",
    quality: "ultra",
    intendedUse: "complex",
    useLabel: "High quality video prompts",
    endpoint: "https://api.wavespeed.ai/api/v3/kwaivgi/kling-v3.0-std/text-to-video",
  },
  {
    id: "wavespeed-ai/wan-2.7/text-to-video",
    label: "Wan 2.7",
    type: "video",
    quality: "high",
    intendedUse: "medium",
    useLabel: "Alternative medium/high video model",
    endpoint: "https://api.wavespeed.ai/api/v3/wavespeed-ai/wan-2.7/text-to-video",
  },
];

export const MODEL_QUALITY_IMAGE_TESTS = [
  {
    id: "image-chicken-farm",
    prompt: "دجاجة بيضاء واقفة في مزرعة خضراء",
    expectedItems: ["white chicken", "farm", "green environment", "no humans"],
  },
  {
    id: "image-black-cat-dog",
    prompt: "قط أسود بجانب كلب أسود داخل حديقة",
    expectedItems: ["black cat", "black dog", "garden", "both visible"],
  },
  {
    id: "image-two-robots-moon",
    prompt: "روبوت أخضر بجانب روبوت أصفر على سطح القمر",
    expectedItems: ["green robot", "yellow robot", "moon surface", "exactly two robots"],
  },
  {
    id: "image-businessman-ferrari-dog",
    prompt: "رجل أعمال يرتدي بدلة سوداء داخل سيارة فراري حمراء ومعه كلب أسود بجانبه",
    expectedItems: ["businessman", "black suit", "red Ferrari", "black dog", "inside car"],
  },
  {
    id: "image-glass-house-lake",
    prompt: "منزل زجاجي حديث بجانب بحيرة وقت الغروب",
    expectedItems: ["modern glass house", "lake", "sunset", "no people"],
  },
];

export const MODEL_QUALITY_VIDEO_TESTS = [
  {
    id: "video-black-sports-car",
    prompt: "سيارة رياضية سوداء تسير في شارع مضاء ليلا، حركة كاميرا سينمائية",
    expectedItems: ["black sports car", "night street", "cinematic movement"],
  },
  {
    id: "video-yellow-robot-moon",
    prompt: "روبوت أصفر يمشي على سطح القمر ببطء",
    expectedItems: ["yellow robot", "walking", "moon surface"],
  },
  {
    id: "video-black-cat-dog",
    prompt: "قطة سوداء تجلس بجانب كلب أسود في حديقة، حركة بسيطة وطبيعية",
    expectedItems: ["black cat", "black dog", "garden", "both visible"],
  },
  {
    id: "video-businessman-office",
    prompt: "رجل أعمال يرتدي بدلة سوداء يمشي داخل مكتب حديث",
    expectedItems: ["businessman", "black suit", "modern office", "walking"],
  },
  {
    id: "video-sea-waves-birds",
    prompt: "موج البحر عند الغروب مع طيور تطير في السماء",
    expectedItems: ["sea waves", "sunset", "birds flying"],
  },
];

export const RELEASE_SMOKE_TESTS = [
  MODEL_QUALITY_IMAGE_TESTS[0],
  MODEL_QUALITY_IMAGE_TESTS[1],
  MODEL_QUALITY_IMAGE_TESTS[4],
  MODEL_QUALITY_IMAGE_TESTS[3],
  MODEL_QUALITY_IMAGE_TESTS[2],
];

export function modelOptionsForType(type) {
  return type === "video" ? MODEL_QUALITY_VIDEO_MODELS : MODEL_QUALITY_IMAGE_MODELS;
}

export function testsForType(type) {
  return type === "video" ? MODEL_QUALITY_VIDEO_TESTS : MODEL_QUALITY_IMAGE_TESTS;
}

export function findModelQualityOption(type, model) {
  const normalized = String(model || "").trim();
  return modelOptionsForType(type).find((item) => item.id === normalized || item.label === normalized);
}

export function parseExpectedItems(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_error) {
      return [];
    }
  }
  return Array.isArray(value?.items) ? value.items : [];
}

export function serializeModelQualityRow(row) {
  return {
    id: Number(row.id),
    type: row.type,
    model: row.model,
    prompt: row.prompt,
    finalPrompt: row.final_prompt || "",
    resultUrl: row.result_url || "",
    expectedItems: parseExpectedItems(row.expected_items),
    score: Number(row.score || 0),
    status: row.status || "review",
    notes: row.notes || "",
    createdAt: row.created_at,
  };
}

export function summarizeModelQualityRows(rows, type, model) {
  const latestByPrompt = new Map();
  for (const row of rows) {
    const key = row.prompt;
    if (!latestByPrompt.has(key)) latestByPrompt.set(key, row);
  }

  const latestRows = Array.from(latestByPrompt.values()).slice(0, 5);
  const passed = latestRows.filter((row) => row.status === "passed").length;
  const failed = latestRows.filter((row) => row.status === "failed").length;
  const review = latestRows.filter((row) => row.status === "review").length;
  const total = latestRows.length;

  let recommendation = "Waiting for all five tests and manual visual review.";
  let usage = "review";
  if (total >= 5) {
    if (passed === 5) {
      recommendation = "Excellent. Approved for ultra quality and complex prompts.";
      usage = "ultra";
    } else if (passed === 4) {
      recommendation = "Good. Approved for high quality with monitoring on complex prompts.";
      usage = "high";
    } else if (passed === 3) {
      recommendation = "Average. Use only for normal quality and simple prompts.";
      usage = "normal";
    } else {
      recommendation = "Not approved. Results are below the minimum quality bar.";
      usage = "disabled";
    }
  }

  return {
    type,
    model,
    total,
    passed,
    failed,
    review,
    recommendation,
    usage,
    complexPromptsAllowed: passed >= 4,
    releaseReady: total >= 5 && passed >= 4,
  };
}

export async function ensureModelQualityTestsTable(prisma) {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS model_quality_tests (
      id SERIAL PRIMARY KEY,
      type VARCHAR(24) NOT NULL,
      model VARCHAR(180) NOT NULL,
      prompt TEXT NOT NULL,
      final_prompt TEXT,
      result_url TEXT,
      expected_items JSONB,
      score INTEGER NOT NULL DEFAULT 0,
      status VARCHAR(24) NOT NULL DEFAULT 'review',
      notes TEXT,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS model_quality_tests_type_model_idx
    ON model_quality_tests(type, model, created_at DESC)
  `);
}

export async function loadModelQualityRows(prisma, { type = "image", model = "", limit = 100 } = {}) {
  await ensureModelQualityTestsTable(prisma);
  const conditions = [Prisma.sql`type = ${type}`];
  if (model) {
    conditions.push(Prisma.sql`model = ${model}`);
  }
  const whereClause = Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`;
  const rows = await prisma.$queryRaw(
    Prisma.sql`
      SELECT id, type, model, prompt, final_prompt, result_url, expected_items, score, status, notes, created_at
      FROM model_quality_tests
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ${Math.min(Math.max(Number(limit) || 100, 1), 250)}
    `
  );
  return rows.map(serializeModelQualityRow);
}

export async function getModelQualityRegistry(prisma) {
  await ensureModelQualityTestsTable(prisma);
  const models = [...MODEL_QUALITY_IMAGE_MODELS, ...MODEL_QUALITY_VIDEO_MODELS];
  const registry = [];

  for (const model of models) {
    const rows = await loadModelQualityRows(prisma, {
      type: model.type,
      model: model.id,
      limit: 100,
    });
    const summary = summarizeModelQualityRows(rows, model.type, model.id);
    registry.push({
      ...model,
      ...summary,
      approvedUsage:
        summary.usage === "ultra"
          ? "ultra_and_complex"
          : summary.usage === "high"
            ? "high"
            : summary.usage === "normal"
              ? "normal_simple_only"
              : "not_approved",
    });
  }

  return registry;
}

export async function getReleaseSmokeReport(prisma) {
  await ensureModelQualityTestsTable(prisma);
  const registry = await getModelQualityRegistry(prisma);
  const modelFailures = registry
    .filter((item) => item.total < 5 || item.passed < 4)
    .map((item) => ({
      type: item.type,
      model: item.model,
      label: item.label,
      passed: item.passed,
      total: item.total,
      reason: item.total < 5 ? "missing_five_tests" : "less_than_four_passed",
    }));

  const promptChecks = [];
  for (const test of RELEASE_SMOKE_TESTS) {
    const rows = await prisma.$queryRaw(
      Prisma.sql`
        SELECT id, type, model, prompt, final_prompt, result_url, expected_items, score, status, notes, created_at
        FROM model_quality_tests
        WHERE type = 'image'
          AND prompt = ${test.prompt}
          AND status = 'passed'
        ORDER BY created_at DESC
        LIMIT 1
      `
    );
    promptChecks.push({
      id: test.id,
      prompt: test.prompt,
      expectedItems: test.expectedItems,
      passed: rows.length > 0,
      lastPassed: rows[0] ? serializeModelQualityRow(rows[0]) : null,
    });
  }

  const promptFailures = promptChecks.filter((item) => !item.passed);
  const passed = modelFailures.length === 0 && promptFailures.length === 0;

  return {
    passed,
    status: passed ? "release_ready" : "deployment_blocked",
    checkedAt: new Date().toISOString(),
    modelFailures,
    promptFailures,
    promptChecks,
    registry,
  };
}
