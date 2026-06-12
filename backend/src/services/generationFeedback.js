import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { withDbRetry } from "../utils/dbRetry.js";

const RATING_SCORES = {
  excellent: 100,
  acceptable: 60,
  mismatch: 0,
};

export function isPromptAnalyticsEnabled() {
  return String(process.env.PROMPT_ANALYTICS_ENABLED || "false").trim().toLowerCase() === "true";
}

export function normalizeGenerationRating(value) {
  const rating = String(value || "").trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(RATING_SCORES, rating)) {
    return rating;
  }
  const error = new Error("قيمة التقييم غير صالحة.");
  error.statusCode = 400;
  throw error;
}

export function scoreForGenerationRating(value) {
  return RATING_SCORES[normalizeGenerationRating(value)];
}

export function ratingSuccess(value) {
  return normalizeGenerationRating(value) !== "mismatch";
}

export async function ensureGenerationDiagnosticsTable(db = prisma) {
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS generations (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      key_id INTEGER,
      type VARCHAR(32) NOT NULL,
      prompt TEXT NOT NULL,
      provider VARCHAR(64),
      model VARCHAR(180),
      final_prompt TEXT,
      enhanced_prompt TEXT,
      negative_prompt TEXT,
      duration INTEGER,
      quality VARCHAR(32),
      style VARCHAR(64),
      aspect_ratio VARCHAR(32),
      seed BIGINT,
      credits_used INTEGER NOT NULL DEFAULT 0,
      status VARCHAR(32) NOT NULL DEFAULT 'processing',
      result_url TEXT,
      error_message TEXT,
      request_id VARCHAR(120),
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at TIMESTAMP(3)
    )
  `);
}

export async function ensureGenerationDiagnosticsColumns(db = prisma) {
  await ensureGenerationDiagnosticsTable(db);
  await db.$executeRawUnsafe(`ALTER TABLE generations ADD COLUMN IF NOT EXISTS enhanced_prompt TEXT`);
  await db.$executeRawUnsafe(`ALTER TABLE generations ADD COLUMN IF NOT EXISTS negative_prompt TEXT`);
}

export async function ensureGenerationFeedbackTables(db = prisma) {
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS generation_feedback (
      id SERIAL PRIMARY KEY,
      generation_id INTEGER NOT NULL UNIQUE,
      key_id INTEGER,
      model VARCHAR(180),
      prompt TEXT,
      rating VARCHAR(24) NOT NULL,
      score INTEGER NOT NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS generation_feedback_model_idx
    ON generation_feedback(model, created_at DESC)
  `);

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS prompt_analytics (
      id SERIAL PRIMARY KEY,
      generation_id INTEGER UNIQUE,
      prompt TEXT NOT NULL,
      enhanced_prompt TEXT,
      final_prompt TEXT,
      negative_prompt TEXT,
      model VARCHAR(180),
      rating VARCHAR(24),
      success BOOLEAN NOT NULL DEFAULT true,
      quality_score INTEGER,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await db.$executeRawUnsafe(`ALTER TABLE prompt_analytics ADD COLUMN IF NOT EXISTS enhanced_prompt TEXT`);
  await db.$executeRawUnsafe(`ALTER TABLE prompt_analytics ADD COLUMN IF NOT EXISTS negative_prompt TEXT`);
  await db.$executeRawUnsafe(`ALTER TABLE prompt_analytics ADD COLUMN IF NOT EXISTS quality_score INTEGER`);
  await db.$executeRawUnsafe(`ALTER TABLE prompt_analytics ADD COLUMN IF NOT EXISTS rating VARCHAR(24)`);
  await db.$executeRawUnsafe(`ALTER TABLE prompt_analytics ADD COLUMN IF NOT EXISTS success BOOLEAN NOT NULL DEFAULT true`);
  await db.$executeRawUnsafe(`ALTER TABLE prompt_analytics ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`);

  await db.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS prompt_analytics_model_idx
    ON prompt_analytics(model, created_at DESC)
  `);
}

export async function ensureGenerationFeedbackInfrastructure(db = prisma) {
  await ensureGenerationDiagnosticsColumns(db);
  await ensureGenerationFeedbackTables(db);
}

export async function upsertPromptAnalytics({
  generationId,
  prompt,
  enhancedPrompt = null,
  finalPrompt = null,
  negativePrompt = null,
  model = null,
  rating = null,
  success = true,
  qualityScore = null,
}) {
  if (!isPromptAnalyticsEnabled()) {
    return { stored: false, reason: "prompt_analytics_disabled" };
  }

  await ensureGenerationFeedbackTables();
  const normalizedRating = rating ? normalizeGenerationRating(rating) : null;
  const score = qualityScore == null && normalizedRating ? scoreForGenerationRating(normalizedRating) : qualityScore;

  await withDbRetry(() =>
    prisma.$executeRaw`
      INSERT INTO prompt_analytics (
        generation_id,
        prompt,
        enhanced_prompt,
        final_prompt,
        negative_prompt,
        model,
        rating,
        success,
        quality_score
      )
      VALUES (
        ${generationId ?? null},
        ${prompt || ""},
        ${enhancedPrompt || null},
        ${finalPrompt || null},
        ${negativePrompt || null},
        ${model || null},
        ${normalizedRating},
        ${Boolean(success)},
        ${score == null ? null : Number(score)}
      )
      ON CONFLICT (generation_id)
      DO UPDATE SET
        prompt = EXCLUDED.prompt,
        enhanced_prompt = COALESCE(EXCLUDED.enhanced_prompt, prompt_analytics.enhanced_prompt),
        final_prompt = COALESCE(EXCLUDED.final_prompt, prompt_analytics.final_prompt),
        negative_prompt = COALESCE(EXCLUDED.negative_prompt, prompt_analytics.negative_prompt),
        model = COALESCE(EXCLUDED.model, prompt_analytics.model),
        rating = COALESCE(EXCLUDED.rating, prompt_analytics.rating),
        success = EXCLUDED.success,
        quality_score = COALESCE(EXCLUDED.quality_score, prompt_analytics.quality_score),
        updated_at = CURRENT_TIMESTAMP
    `
  );

  return { stored: true };
}

export async function upsertGenerationFeedback({ generationId, keyId, model, prompt, rating }) {
  await ensureGenerationFeedbackTables();
  const normalizedRating = normalizeGenerationRating(rating);
  const score = scoreForGenerationRating(normalizedRating);
  const storedPrompt = isPromptAnalyticsEnabled() ? prompt || "" : null;

  await withDbRetry(() =>
    prisma.$executeRaw`
      INSERT INTO generation_feedback (generation_id, key_id, model, prompt, rating, score)
      VALUES (${generationId}, ${keyId || null}, ${model || null}, ${storedPrompt}, ${normalizedRating}, ${score})
      ON CONFLICT (generation_id)
      DO UPDATE SET
        key_id = EXCLUDED.key_id,
        model = EXCLUDED.model,
        prompt = ${storedPrompt},
        rating = EXCLUDED.rating,
        score = EXCLUDED.score,
        updated_at = CURRENT_TIMESTAMP
    `
  );

  await upsertPromptAnalytics({
    generationId,
    prompt: storedPrompt,
    model,
    rating: normalizedRating,
    success: ratingSuccess(normalizedRating),
    qualityScore: score,
  });

  return {
    rating: normalizedRating,
    score,
  };
}

export function serializeModelFeedbackStatsRow(row) {
  const total = Number(row.total || 0);
  const positive = Number(row.positive || 0);
  const averageScore = Number(row.average_score || 0);
  return {
    model: row.model || "unknown",
    total,
    excellent: Number(row.excellent || 0),
    acceptable: Number(row.acceptable || 0),
    mismatch: Number(row.mismatch || 0),
    successRate: total ? Math.round((positive / total) * 1000) / 10 : 0,
    userSatisfaction: total ? Math.round((averageScore / 100) * 1000) / 10 : 0,
    averageScore: Math.round(averageScore * 10) / 10,
    autoRoutingDisabled: total >= 100 && (averageScore < 65 || positive / total < 0.7),
  };
}

export async function getModelFeedbackStats({ model = "", limit = 50 } = {}) {
  await ensureGenerationFeedbackTables();
  const conditions = [];
  if (model) {
    conditions.push(Prisma.sql`model = ${model}`);
  }
  const whereClause = conditions.length
    ? Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`
    : Prisma.empty;

  const rows = await withDbRetry(() =>
    prisma.$queryRaw(
      Prisma.sql`
        SELECT
          COALESCE(model, 'unknown') AS model,
          COUNT(*)::int AS total,
          SUM(CASE WHEN rating = 'excellent' THEN 1 ELSE 0 END)::int AS excellent,
          SUM(CASE WHEN rating = 'acceptable' THEN 1 ELSE 0 END)::int AS acceptable,
          SUM(CASE WHEN rating = 'mismatch' THEN 1 ELSE 0 END)::int AS mismatch,
          SUM(CASE WHEN rating IN ('excellent', 'acceptable') THEN 1 ELSE 0 END)::int AS positive,
          AVG(score)::float AS average_score
        FROM generation_feedback
        ${whereClause}
        GROUP BY COALESCE(model, 'unknown')
        ORDER BY total DESC, average_score DESC
        LIMIT ${Math.min(Math.max(Number(limit) || 50, 1), 250)}
      `
    )
  );

  return rows.map(serializeModelFeedbackStatsRow);
}

export async function getFeedbackRoutingDecision(model) {
  if (!model) {
    return { allowed: true, reason: "no_model" };
  }
  const stats = await getModelFeedbackStats({ model, limit: 1 }).catch(() => []);
  const item = stats.find((entry) => entry.model === model);
  if (!item || item.total < 100) {
    return { allowed: true, reason: "insufficient_feedback", stats: item || null };
  }
  if (item.autoRoutingDisabled) {
    return { allowed: false, reason: "low_user_feedback", stats: item };
  }
  return { allowed: true, reason: "feedback_ok", stats: item };
}

export async function getPromptAnalyticsStats({ limit = 40 } = {}) {
  if (!isPromptAnalyticsEnabled()) {
    return [];
  }

  await ensureGenerationFeedbackTables();
  const rows = await withDbRetry(() =>
    prisma.$queryRaw(
      Prisma.sql`
        SELECT
          prompt,
          COALESCE(model, 'unknown') AS model,
          COUNT(*)::int AS total,
          SUM(CASE WHEN success = true THEN 1 ELSE 0 END)::int AS successful,
          SUM(CASE WHEN success = false THEN 1 ELSE 0 END)::int AS failed,
          AVG(COALESCE(quality_score, CASE WHEN success = true THEN 75 ELSE 0 END))::float AS average_score,
          MAX(updated_at) AS last_seen_at
        FROM prompt_analytics
        GROUP BY prompt, COALESCE(model, 'unknown')
        ORDER BY failed DESC, average_score ASC, total DESC
        LIMIT ${Math.min(Math.max(Number(limit) || 40, 1), 250)}
      `
    )
  );

  return rows.map((row) => {
    const total = Number(row.total || 0);
    const successful = Number(row.successful || 0);
    return {
      prompt: row.prompt || "",
      model: row.model || "unknown",
      total,
      successful,
      failed: Number(row.failed || 0),
      successRate: total ? Math.round((successful / total) * 1000) / 10 : 0,
      averageScore: Math.round(Number(row.average_score || 0) * 10) / 10,
      lastSeenAt: row.last_seen_at || null,
    };
  });
}
