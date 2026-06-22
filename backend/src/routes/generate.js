import { Router } from "express";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { getAuthWorkspace } from "../middleware/auth.js";
import { aiLimiter } from "../middleware/rateLimit.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { withDbRetry } from "../utils/dbRetry.js";
import { logError, logInfo } from "../utils/logger.js";
import { serializeBigInt } from "../utils/serializeBigInt.js";
import {
  buildSmartPromptEnhancementAsync,
  generateImageWithWaveSpeed,
  generateVideoWithWaveSpeed,
} from "../services/wavespeedService.js";
import { getSetting } from "../services/settings.js";
import { getModelMonitorDecision } from "../services/modelMonitor.js";
import { IMAGE_MODELS, VIDEO_MODELS } from "../services/wavespeedModels.js";
import {
  ensureGenerationFeedbackInfrastructure,
  getFeedbackRoutingDecision,
  getModelFeedbackStats,
  upsertGenerationFeedback,
  upsertPromptAnalytics,
} from "../services/generationFeedback.js";
import {
  buildGenerationStorageKey,
  downloadRemoteAsset,
  uploadBufferToB2,
} from "../services/b2Storage.js";
import { ensureWorkspacesTable } from "../services/workspaces.js";
import {
  assertAllowedGenerationContent,
  assertValidPrompt,
  calculateRequiredCredits,
  normalizeDuration,
  normalizeGenerationType,
  normalizeQuality,
} from "../utils/credits.js";
import {
  analyzePromptComplexity,
  isComplexGenerationPrompt as isComplexPromptV2,
} from "../utils/promptComplexity.js";

const router = Router();

function promptVerboseLogsEnabled() {
  return String(process.env.PROMPT_VERBOSE_LOGS || "false").trim().toLowerCase() === "true";
}

function logGenerationPromptDiagnostics({ prompt, diagnostics, requestId, seed }) {
  if (promptVerboseLogsEnabled()) {
    console.log("USER_PROMPT:", prompt);
    console.log("ENHANCED_PROMPT:", diagnostics.enhancedPrompt || "");
    console.log("FINAL_PROMPT_PREVIEW:", diagnostics.finalPrompt || "");
    console.log("NEGATIVE_PROMPT:", diagnostics.negativePrompt || "");
  } else {
    console.log("PROMPT_PIPELINE:", {
      requestId,
      seed,
      userPromptLength: String(prompt || "").length,
      finalPromptLength: String(diagnostics.finalPrompt || "").length,
      translationMode: diagnostics.debug?.translationMode || "local",
    });
  }
}

function httpError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
}

function providerFailureMessage(error, type) {
  const fallback = "طھط¹ط°ط± ط¥طھظ…ط§ظ… ط§ظ„ط·ظ„ط¨ ظ…ط¤ظ‚طھظ‹ط§طŒ ط­ط§ظˆظ„ ظ„ط§ط­ظ‚ظ‹ط§. ظ„ظ… ظٹطھظ… ط®طµظ… ط£ظٹ ط±طµظٹط¯.";
  const raw = String(error?.message || "").trim();

  if (!raw) {
    return fallback;
  }

  if (/unauthorized|invalid api|invalid key|api key|forbidden|401|403/i.test(raw)) {
    return fallback;
  }

  if (error?.statusCode && error.statusCode < 500) {
    return fallback;
  }

  return fallback;
}

function getKeyId(req) {
  const keyId = Number(req.cookies?.key_session);
  if (!Number.isFinite(keyId)) {
    httpError("ط£ط¯ط®ظ„ ظ…ظپطھط§ط­ظƒ ط£ظˆظ„ظ‹ط§ ظ„ظ„ظˆطµظˆظ„ ط¥ظ„ظ‰ ط§ظ„طھظˆظ„ظٹط¯.", 401);
  }
  return keyId;
}

function getRemainingSlots(key, type) {
  if (Number(key.balance || 0) > 0) {
    return Number.MAX_SAFE_INTEGER;
  }

  const limit = type === "video" ? Number(key.videoLimit || 0) : Number(key.imageLimit || 0);
  const used = type === "video" ? Number(key.videoUsed || 0) : Number(key.imageUsed || 0);
  return Math.max(limit - used, 0);
}

function isComplexGenerationPrompt(prompt) {
  const text = String(prompt || "").toLowerCase();
  const relationWords = [
    "ط¨ط¬ط§ظ†ط¨",
    "ظپظˆظ‚",
    "ط¯ط§ط®ظ„",
    "ظٹظ…ط³ظƒ",
    "ظٹط±طھط¯ظٹ",
    "ظٹظ‚ظˆط¯",
    "with",
    "next to",
    "inside",
    "wearing",
    "driving",
    "\u0645\u0639",
  ];
  const colorWords = [
    "ط£ط³ظˆط¯",
    "ط§ط³ظˆط¯",
    "ط£ط¨ظٹط¶",
    "ط§ط¨ظٹط¶",
    "ط£ط­ظ…ط±",
    "ط§ط­ظ…ط±",
    "ط£ط®ط¶ط±",
    "ط§ط®ط¶ط±",
    "ط£طµظپط±",
    "ط§طµظپط±",
    "ط£ط²ط±ظ‚",
    "ط§ط²ط±ظ‚",
    "black",
    "white",
    "red",
    "green",
    "yellow",
    "blue",
  ];
  const subjectWords = [
    "ط±ط¬ظ„",
    "ط§ظ…ط±ط£ط©",
    "ط´ط®طµ",
    "ظƒظ„ط¨",
    "ظ‚ط·",
    "ظ‚ط·ط©",
    "ط±ظˆط¨ظˆطھ",
    "ط³ظٹط§ط±ط©",
    "ظ…ظ†ط²ظ„",
    "ظ‚ظ…ط±",
    "man",
    "woman",
    "dog",
    "cat",
    "robot",
    "car",
    "house",
    "moon",
    "\u0630\u0626\u0628",
    "\u0630\u064a\u0628",
    "\u062b\u0639\u0628\u0627\u0646",
    "\u062b\u0639\u0627\u0628\u064a\u0646",
    "\u0623\u0641\u0639\u0649",
    "\u0627\u0641\u0639\u0649",
    "\u0635\u064a\u0627\u0631\u0629",
  ];

  const relations = relationWords.filter((word) => text.includes(word)).length;
  const colors = colorWords.filter((word) => text.includes(word)).length;
  const subjects = subjectWords.filter((word) => text.includes(word)).length;
  const hasPersonAndAnimal = /(ط±ط¬ظ„|ط§ظ…ط±ط£ط©|ط´ط®طµ|man|woman|person)/.test(text) && /(ظƒظ„ط¨|ظ‚ط·|ظ‚ط·ط©|dog|cat)/.test(text);
  const hasRobotFantasy = /(ط±ظˆط¨ظˆطھ|robot)/.test(text) && /(ظ‚ظ…ط±|ظپط¶ط§ط،|moon|space)/.test(text);

  return subjects > 2 || relations > 0 || colors > 1 || hasPersonAndAnimal || hasRobotFantasy;
}

function modelForQuality(type, quality) {
  const source = type === "video" ? VIDEO_MODELS : IMAGE_MODELS;
  return source?.[quality]?.model || null;
}

async function getModelQualityDecision(type, model) {
  if (!model) return null;
  const raw = await getSetting(`model_quality:${type}:${model}`, null).catch(() => null);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (_error) {
    return null;
  }
}

function modelDecisionAllowsPrompt(decision, complexPrompt) {
  if (!decision) return false;
  const passed = Number(decision.passed || 0);
  const total = Number(decision.total || 0);
  if (total < 5) return false;
  return complexPrompt ? passed >= 4 : passed >= 3;
}

async function resolveQualityForPrompt({ type, quality, prompt }) {
  const requireApprovedModels = process.env.REQUIRE_APPROVED_MODELS === "true";
  const complexPrompt = isComplexPromptV2(prompt);

  if (!complexPrompt) {
    if (!requireApprovedModels) {
      return { quality, routed: false, reason: "simple_prompt" };
    }

    const model = modelForQuality(type, quality);
    const monitorDecision = await getModelMonitorDecision(type, model);
    if (monitorDecision.disabled) {
      return {
        quality,
        routed: false,
        blocked: true,
        reason: "model_disabled_by_monitor",
        model,
        decision: monitorDecision,
      };
    }
    const decision = await getModelQualityDecision(type, model);
    if (modelDecisionAllowsPrompt(decision, false)) {
      return { quality, routed: false, reason: "approved_simple_model", model, decision };
    }

    return {
      quality,
      routed: false,
      blocked: true,
      reason: "model_not_approved_for_simple_prompt",
      model,
      decision,
    };
  }

  const order = ["normal", "high", "ultra"];
  const requestedIndex = Math.max(order.indexOf(quality), 0);
  const startIndex = requestedIndex;
  for (const candidateQuality of order.slice(startIndex)) {
    const model = modelForQuality(type, candidateQuality);
    const monitorDecision = await getModelMonitorDecision(type, model);
    if (monitorDecision.disabled) {
      console.log("MODEL_MONITOR_AUTO_ROUTING_SKIP:", {
        type,
        quality: candidateQuality,
        model,
        reason: monitorDecision.reason,
        checkedAt: monitorDecision.checkedAt,
      });
      continue;
    }
    const decision = await getModelQualityDecision(type, model);
    if (decision?.complexPromptsAllowed === true || modelDecisionAllowsPrompt(decision, true)) {
      const feedbackDecision = await getFeedbackRoutingDecision(model);
      if (!feedbackDecision.allowed) {
        console.log("MODEL_FEEDBACK_AUTO_ROUTING_SKIP:", {
          type,
          quality: candidateQuality,
          model,
          reason: feedbackDecision.reason,
          stats: feedbackDecision.stats,
        });
        continue;
      }

      return {
        quality: candidateQuality,
        routed: candidateQuality !== quality,
        reason: "approved_complex_model",
        model,
        decision,
      };
    }
  }

  if (requireApprovedModels) {
    return {
      quality,
      routed: false,
      blocked: true,
      reason: "no_approved_model_for_complex_prompt",
    };
  }

  for (const candidateQuality of order.slice(startIndex)) {
    const model = modelForQuality(type, candidateQuality);
    const monitorDecision = await getModelMonitorDecision(type, model);
    if (!monitorDecision.disabled) {
      return {
        quality: candidateQuality,
        routed: candidateQuality !== quality,
        reason: candidateQuality === quality ? "no_approved_model_record" : "monitor_safe_fallback",
        model,
        decision: monitorDecision,
      };
    }
  }

  return { quality, routed: false, reason: "no_approved_model_record" };
}

router.post(
  "/enhance",
  aiLimiter,
  asyncHandler(async (req, res) => {
    const prompt = assertValidPrompt(req.body.prompt);
    assertAllowedGenerationContent(prompt);
    const type = normalizeGenerationType(req.body.type || "image");
    const quality = normalizeQuality(req.body.quality || "normal");
    const style = String(req.body.style || "").trim();
    const result = await buildSmartPromptEnhancementAsync({
      userPrompt: prompt,
      type,
      quality,
      style,
    });

    logGenerationPromptDiagnostics({
      prompt,
      diagnostics: result,
      requestId: "smart-enhance",
      seed: null,
    });

    return res.json({
      success: true,
      ...result,
    });
  })
);

function serializeKeyBalance(key) {
  return {
    id: key.id,
    creditsRemaining: Math.max(Number(key.balance || 0), 0),
    imagesLimit: Number(key.imageLimit || 0),
    imagesUsed: Number(key.imageUsed || 0),
    imagesRemaining: Math.max(Number(key.imageLimit || 0) - Number(key.imageUsed || 0), 0),
    videosLimit: Number(key.videoLimit || 0),
    videosUsed: Number(key.videoUsed || 0),
    videosRemaining: Math.max(Number(key.videoLimit || 0) - Number(key.videoUsed || 0), 0),
    expiresAt: key.expiresAt,
  };
}

function serializeGeneration(row) {
  const stableResultUrl = row.storage_url || row.result_url;
  const stableThumbnailUrl = row.thumbnail_url || row.storage_url || row.result_url;
  return {
    id: row.id,
    requestId: row.request_id,
    userPrompt: row.prompt,
    prompt: row.prompt,
    finalPrompt: row.final_prompt,
    enhancedPrompt: row.enhanced_prompt,
    negativePrompt: row.negative_prompt,
    type: row.type,
    quality: row.quality,
    style: row.style,
    aspectRatio: row.aspect_ratio,
    duration: row.duration,
    provider: row.provider,
    model: row.model,
    seed: row.seed,
    creditsUsed: Number(row.credits_used || 0),
    xpCost: Number(row.credits_used || 0),
    status: row.status,
    resultUrl: stableResultUrl,
    originalResultUrl: row.result_url || null,
    storageUrl: row.storage_url || null,
    storageKey: row.storage_key || null,
    thumbnailUrl: stableThumbnailUrl || null,
    mimeType: row.mime_type || null,
    fileSize: row.file_size == null ? null : Number(row.file_size),
    isFavorite: Boolean(row.is_favorite),
    createdAt: row.created_at,
    completedAt: row.completed_at,
    generationTimeMs:
      row.generation_time_ms == null ? null : Math.max(0, Math.round(Number(row.generation_time_ms))),
    userRating: row.user_rating || null,
    qualityScore: row.quality_score == null ? null : Number(row.quality_score),
  };
}

async function loadCompletedGenerationById({ keyId, workspaceId, generationId }) {
  const rows = await withDbRetry(() =>
    prisma.$queryRaw`
      SELECT g.id,
             g.workspace_id,
             g.request_id,
             g.type,
             g.prompt,
             g.quality,
             g.style,
             g.aspect_ratio,
             g.duration,
             g.provider,
             g.model,
             g.seed,
             g.final_prompt,
             g.enhanced_prompt,
             g.negative_prompt,
             g.credits_used,
             g.status,
             g.result_url,
             g.storage_url,
             g.storage_key,
             g.thumbnail_url,
             g.mime_type,
             g.file_size,
             g.is_favorite,
             g.created_at,
             g.completed_at,
             EXTRACT(EPOCH FROM (g.completed_at - g.created_at)) * 1000 AS generation_time_ms,
             gf.rating AS user_rating,
             gf.score AS quality_score
      FROM generations g
      LEFT JOIN generation_feedback gf ON gf.generation_id = g.id
      WHERE (g.workspace_id = ${workspaceId} OR (g.workspace_id IS NULL AND g.key_id = ${keyId}))
        AND g.id = ${generationId}
        AND g.status = 'completed'
        AND COALESCE(g.storage_url, g.result_url) IS NOT NULL
        AND g.deleted_at IS NULL
      LIMIT 1
    `
  );

  return rows[0] || null;
}

async function ensureGenerationTable() {
  const statements = [
    `
      CREATE TABLE IF NOT EXISTS generations (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        key_id INTEGER,
        workspace_id INTEGER,
        type VARCHAR(32) NOT NULL,
        prompt TEXT NOT NULL,
        quality VARCHAR(32),
        duration INTEGER,
        provider VARCHAR(64),
        model VARCHAR(128),
        final_prompt TEXT,
        request_id VARCHAR(80),
        style VARCHAR(64),
        aspect_ratio VARCHAR(32),
        seed BIGINT,
        credits_used INTEGER NOT NULL DEFAULT 0,
        status VARCHAR(32) NOT NULL DEFAULT 'queued',
        result_url TEXT,
        storage_url TEXT,
        storage_key TEXT,
        thumbnail_url TEXT,
        mime_type VARCHAR(120),
        file_size BIGINT,
        error_message TEXT,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP(3)
      )
    `,
    `ALTER TABLE generations ADD COLUMN IF NOT EXISTS workspace_id INTEGER`,
    `ALTER TABLE generations ADD COLUMN IF NOT EXISTS provider VARCHAR(64)`,
    `ALTER TABLE generations ADD COLUMN IF NOT EXISTS model VARCHAR(128)`,
    `ALTER TABLE generations ADD COLUMN IF NOT EXISTS final_prompt TEXT`,
    `ALTER TABLE generations ADD COLUMN IF NOT EXISTS request_id VARCHAR(80)`,
    `ALTER TABLE generations ADD COLUMN IF NOT EXISTS style VARCHAR(64)`,
    `ALTER TABLE generations ADD COLUMN IF NOT EXISTS aspect_ratio VARCHAR(32)`,
    `ALTER TABLE generations ADD COLUMN IF NOT EXISTS seed BIGINT`,
    `ALTER TABLE generations ADD COLUMN IF NOT EXISTS enhanced_prompt TEXT`,
    `ALTER TABLE generations ADD COLUMN IF NOT EXISTS negative_prompt TEXT`,
    `ALTER TABLE generations ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP(3)`,
    `ALTER TABLE generations ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE generations ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP(3)`,
    `ALTER TABLE generations ADD COLUMN IF NOT EXISTS storage_url TEXT`,
    `ALTER TABLE generations ADD COLUMN IF NOT EXISTS storage_key TEXT`,
    `ALTER TABLE generations ADD COLUMN IF NOT EXISTS thumbnail_url TEXT`,
    `ALTER TABLE generations ADD COLUMN IF NOT EXISTS mime_type VARCHAR(120)`,
    `ALTER TABLE generations ADD COLUMN IF NOT EXISTS file_size BIGINT`,
    `CREATE INDEX IF NOT EXISTS generations_workspace_id_idx ON generations (workspace_id)`,
  ];

  for (const statement of statements) {
    await withDbRetry(() => prisma.$executeRawUnsafe(statement));
  }
}

async function ensureCreditTransactionsTable(tx = prisma) {
  await tx.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS credit_transactions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      key_id INTEGER,
      amount INTEGER NOT NULL,
      type VARCHAR(64) NOT NULL,
      reason VARCHAR(255) NOT NULL,
      generation_id INTEGER UNIQUE,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await tx.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS credit_transactions_generation_id_unique
    ON credit_transactions (generation_id)
    WHERE generation_id IS NOT NULL
  `);
}

async function ensureProjectsTable(tx = prisma) {
  await tx.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS projects (
      id SERIAL PRIMARY KEY,
      key_id INTEGER NOT NULL,
      workspace_id INTEGER,
      generation_id INTEGER,
      type VARCHAR(32) NOT NULL,
      prompt TEXT NOT NULL,
      duration INTEGER,
      quality VARCHAR(32),
      style VARCHAR(64),
      model VARCHAR(128),
      result_url TEXT,
      storage_url TEXT,
      thumbnail_url TEXT,
      mime_type VARCHAR(120),
      file_size BIGINT,
      status VARCHAR(32) NOT NULL DEFAULT 'completed',
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const statements = [
    `ALTER TABLE projects ADD COLUMN IF NOT EXISTS workspace_id INTEGER`,
    `ALTER TABLE projects ADD COLUMN IF NOT EXISTS generation_id INTEGER`,
    `ALTER TABLE projects ADD COLUMN IF NOT EXISTS model VARCHAR(128)`,
    `ALTER TABLE projects ADD COLUMN IF NOT EXISTS storage_url TEXT`,
    `ALTER TABLE projects ADD COLUMN IF NOT EXISTS thumbnail_url TEXT`,
    `ALTER TABLE projects ADD COLUMN IF NOT EXISTS mime_type VARCHAR(120)`,
    `ALTER TABLE projects ADD COLUMN IF NOT EXISTS file_size BIGINT`,
    `CREATE INDEX IF NOT EXISTS projects_workspace_id_idx ON projects (workspace_id)`,
  ];

  for (const statement of statements) {
    await tx.$executeRawUnsafe(statement);
  }
}

async function backfillLegacyProjectsForWorkspace({ keyId, workspaceId }) {
  await ensureGenerationTable();
  await ensureProjectsTable();

  await withDbRetry(() =>
    prisma.$executeRaw`
      WITH legacy_projects AS (
        SELECT
          p.id,
          p.key_id,
          COALESCE(p.workspace_id, ${workspaceId}) AS workspace_id,
          p.type,
          p.prompt,
          p.duration,
          p.quality,
          p.style,
          p.model,
          p.result_url,
          p.storage_url,
          p.thumbnail_url,
          p.mime_type,
          p.file_size,
          p.status,
          p.created_at,
          CASE
            WHEN p.status = 'completed' THEN COALESCE(p.created_at, CURRENT_TIMESTAMP)
            ELSE NULL
          END AS completed_at
        FROM projects p
        WHERE p.key_id = ${keyId}
          AND NOT EXISTS (
            SELECT 1
            FROM generations g
            WHERE g.request_id = CONCAT('legacy-project-', p.id::text)
          )
      )
      INSERT INTO generations (
        key_id,
        workspace_id,
        type,
        prompt,
        quality,
        duration,
        provider,
        model,
        final_prompt,
        request_id,
        style,
        credits_used,
        status,
        result_url,
        storage_url,
        thumbnail_url,
        mime_type,
        file_size,
        created_at,
        completed_at
      )
      SELECT
        lp.key_id,
        lp.workspace_id,
        lp.type,
        lp.prompt,
        lp.quality,
        lp.duration,
        'legacy-projects',
        lp.model,
        lp.prompt,
        CONCAT('legacy-project-', lp.id::text),
        lp.style,
        0,
        COALESCE(NULLIF(lp.status, ''), 'completed'),
        COALESCE(lp.storage_url, lp.result_url),
        COALESCE(lp.storage_url, lp.result_url),
        COALESCE(lp.thumbnail_url, lp.storage_url, lp.result_url),
        lp.mime_type,
        lp.file_size,
        COALESCE(lp.created_at, CURRENT_TIMESTAMP),
        lp.completed_at
      FROM legacy_projects lp
    `
  );

  await withDbRetry(() =>
    prisma.$executeRaw`
      UPDATE projects p
      SET workspace_id = COALESCE(p.workspace_id, ${workspaceId}),
          generation_id = COALESCE(
            p.generation_id,
            (
              SELECT g.id
              FROM generations g
              WHERE g.request_id = CONCAT('legacy-project-', p.id::text)
              LIMIT 1
            )
          )
      WHERE p.key_id = ${keyId}
        AND (
          p.workspace_id IS NULL OR
          p.generation_id IS NULL
        )
    `
  );
}

async function createGenerationRecord({
  keyId,
  workspaceId,
  type,
  prompt,
  quality,
  duration,
  creditsUsed,
  provider = null,
  model = null,
  finalPrompt = null,
  enhancedPrompt = null,
  negativePrompt = null,
  requestId = null,
  style = null,
  aspectRatio = null,
  status = "processing",
}) {
  const rows = await withDbRetry(() =>
    prisma.$queryRaw`
      INSERT INTO generations (key_id, workspace_id, type, prompt, quality, duration, provider, model, final_prompt, request_id, style, aspect_ratio, credits_used, status)
      VALUES (${keyId}, ${workspaceId}, ${type}, ${prompt}, ${quality}, ${duration}, ${provider}, ${model}, ${finalPrompt}, ${requestId}, ${style}, ${aspectRatio}, ${creditsUsed}, ${status})
      RETURNING id
    `
  );

  if (enhancedPrompt || negativePrompt) {
    await withDbRetry(() =>
      prisma.$executeRaw`
        UPDATE generations
        SET enhanced_prompt = ${enhancedPrompt || null},
            negative_prompt = ${negativePrompt || null}
        WHERE id = ${Number(rows?.[0]?.id)}
      `
    );
  }

  return Number(rows?.[0]?.id);
}

async function markGenerationFailed({ generationId, message }) {
  if (!generationId) {
    return;
  }

  await withDbRetry(() =>
    prisma.$executeRaw`
      UPDATE generations
      SET status = 'failed', error_message = ${message || "ظپط´ظ„ ط§ظ„طھظˆظ„ظٹط¯"}
      WHERE id = ${generationId}
    `
  ).catch((error) => logError(error, { scope: "markGenerationFailed", generationId }));
}

async function completeGenerationAndDeduct({
  generationId,
  keyId,
  workspaceId,
  type,
  prompt,
  duration,
  quality,
  style,
  creditsUsed,
  resultUrl,
  storageUrl,
  storageKey,
  thumbnailUrl,
  mimeType,
  fileSize,
  provider,
  model,
  finalPrompt,
  enhancedPrompt,
  negativePrompt,
  aspectRatio,
  seed,
}) {
  return withDbRetry(() =>
    prisma.$transaction(async (tx) => {
      await ensureProjectsTable(tx);
      await ensureCreditTransactionsTable(tx);

      const generationRows = await tx.$queryRaw`
        SELECT status
        FROM generations
        WHERE id = ${generationId}
          AND (workspace_id = ${workspaceId} OR (workspace_id IS NULL AND key_id = ${keyId}))
        FOR UPDATE
      `;

      if (!generationRows.length) {
        httpError("ط³ط¬ظ„ ط§ظ„طھظˆظ„ظٹط¯ ط؛ظٹط± ظ…ظˆط¬ظˆط¯.", 500);
      }

      if (generationRows[0].status === "completed") {
        httpError("طھظ… ط®طµظ… ط±طµظٹط¯ ظ‡ط°ط§ ط§ظ„ط·ظ„ط¨ ظ…ط³ط¨ظ‚ظ‹ط§.", 409);
      }

      if (!["queued", "processing"].includes(generationRows[0].status)) {
        httpError("طھظ… ط¥ظ„ط؛ط§ط، ظ‡ط°ط§ ط§ظ„ط·ظ„ط¨ ط£ظˆ ظپط´ظ„ ط³ط§ط¨ظ‚ظ‹ط§طŒ ظˆظ„ظ† ظٹطھظ… ط®طµظ… ط£ظٹ ط±طµظٹط¯.", 409);
      }

      const current = await tx.activationCode.findUnique({
        where: { id: keyId },
      });

      if (!current) {
        httpError("ط¬ظ„ط³ط© ط§ظ„ظ…ظپطھط§ط­ ط؛ظٹط± طµط§ظ„ط­ط©.", 401);
      }

      const creditsRemaining = Number(current.balance || 0);
      if (creditsRemaining < creditsUsed) {
        httpError("ط±طµظٹط¯ظƒ ط؛ظٹط± ظƒط§ظپظچ ظ„ط¥طھظ…ط§ظ… ظ‡ط°ط§ ط§ظ„ط·ظ„ط¨.");
      }

      const slotField = type === "video" ? "videoUsed" : "imageUsed";
      if (getRemainingSlots(current, type) < 1) {
        httpError(type === "video" ? "ظ„ط§ ظٹظˆط¬ط¯ ط±طµظٹط¯ ظپظٹط¯ظٹظˆ ظƒط§ظپظچ" : "ظ„ط§ ظٹظˆط¬ط¯ ط±طµظٹط¯ طµظˆط± ظƒط§ظپظچ");
      }

      const updateResult = await tx.activationCode.updateMany({
        where: {
          id: keyId,
          balance: { gte: creditsUsed },
        },
        data: {
          balance: { decrement: creditsUsed },
          [slotField]: { increment: 1 },
          isUsed: true,
        },
      });

      if (updateResult.count !== 1) {
        httpError("ط±طµظٹط¯ظƒ ط؛ظٹط± ظƒط§ظپظچ ظ„ط¥طھظ…ط§ظ… ظ‡ط°ط§ ط§ظ„ط·ظ„ط¨.");
      }

      const updatedKey = await tx.activationCode.findUnique({
        where: { id: keyId },
      });

      await tx.$executeRaw`
        UPDATE generations
        SET status = 'completed',
            workspace_id = ${workspaceId},
            result_url = ${resultUrl},
            storage_url = ${storageUrl || resultUrl},
            storage_key = ${storageKey || null},
            thumbnail_url = ${thumbnailUrl || storageUrl || resultUrl},
            mime_type = ${mimeType || null},
            file_size = ${fileSize ?? null},
            provider = ${provider},
            model = ${model},
            final_prompt = ${finalPrompt || prompt},
            enhanced_prompt = ${enhancedPrompt || null},
            negative_prompt = ${negativePrompt || null},
            style = ${style || null},
            aspect_ratio = ${aspectRatio || null},
            seed = ${seed ?? null},
            completed_at = NOW()
        WHERE id = ${generationId}
      `;

      const reason =
        type === "video"
          ? `video_generation_${duration}s_${quality}`
          : `image_generation_${quality}`;

      await tx.$executeRaw`
        INSERT INTO credit_transactions (user_id, key_id, amount, type, reason, generation_id)
        VALUES (NULL, ${keyId}, ${-creditsUsed}, 'debit', ${reason}, ${generationId})
      `;

      await tx.$executeRaw`
        INSERT INTO projects (
          key_id,
          workspace_id,
          generation_id,
          type,
          prompt,
          duration,
          quality,
          style,
          model,
          result_url,
          storage_url,
          thumbnail_url,
          mime_type,
          file_size,
          status
        )
        VALUES (
          ${keyId},
          ${workspaceId},
          ${generationId},
          ${type},
          ${prompt},
          ${duration},
          ${quality},
          ${style},
          ${model || null},
          ${storageUrl || resultUrl},
          ${storageUrl || resultUrl},
          ${thumbnailUrl || storageUrl || resultUrl},
          ${mimeType || null},
          ${fileSize ?? null},
          'completed'
        )
      `;

      return updatedKey;
    })
  );
}

function scheduleGenerationCompletion(task) {
  setImmediate(() => {
    runGenerationCompletionTask(task).catch((error) => {
      logError(error, { scope: "scheduleGenerationCompletion", generationId: task.generationId });
    });
  });
}

async function runGenerationCompletionTask({
  generationId,
  keyId,
  workspaceId,
  type,
  prompt,
  duration,
  quality,
  style,
  aspectRatio,
  creditsUsed,
  promptDiagnostics,
  requestId,
  seed,
}) {
  let result;

  try {
    if (type === "image") {
      result = await generateImageWithWaveSpeed({
        prompt,
        quality,
        aspectRatio,
        style,
        requestId,
        seed,
      });
    } else {
      result = await generateVideoWithWaveSpeed({
        prompt,
        duration,
        quality,
        aspectRatio,
        style,
        requestId,
        seed,
      });
    }
  } catch (error) {
    await markGenerationFailed({ generationId, message: error.message });
    await upsertPromptAnalytics({
      generationId,
      prompt,
      enhancedPrompt: promptDiagnostics.enhancedPrompt || null,
      finalPrompt: promptDiagnostics.finalPrompt || prompt,
      negativePrompt: promptDiagnostics.negativePrompt || null,
      model: modelForQuality(type, quality),
      success: false,
    }).catch((analyticsError) => {
      logError(analyticsError, { scope: "upsertPromptAnalyticsFailedGeneration", generationId });
    });
    logError(error, { scope: "generateProvider", keyId, generationId, type });
    return;
  }

  if (!result?.resultUrl) {
    await markGenerationFailed({ generationId, message: "ظ„ظ… ظٹط±ط¬ط¹ ظ…ط²ظˆط¯ ط§ظ„طھظˆظ„ظٹط¯ ط±ط§ط¨ط· ظ†طھظٹط¬ط©." });
    return;
  }

  let persistedAsset = null;
  try {
    const asset = await downloadRemoteAsset(result.resultUrl);
    const storageKey = buildGenerationStorageKey({
      workspaceId,
      generationId,
      mimeType: asset.mimeType,
    });
    const uploaded = await uploadBufferToB2({
      key: storageKey,
      bytes: asset.bytes,
      mimeType: asset.mimeType,
    });

    persistedAsset = {
      storageKey: uploaded.storageKey,
      storageUrl: uploaded.storageUrl,
      thumbnailUrl: type === "image" ? uploaded.storageUrl : null,
      mimeType: asset.mimeType,
      fileSize: asset.fileSize,
    };
  } catch (error) {
    await markGenerationFailed({
      generationId,
      message: "طھط¹ط°ط± ط­ظپط¸ ط§ظ„ظ†طھظٹط¬ط© ظپظٹ ط§ظ„طھط®ط²ظٹظ† ط§ظ„ط¯ط§ط¦ظ…. ظ„ظ… ظٹطھظ… ط®طµظ… ط£ظٹ ط±طµظٹط¯.",
    });
    logError(error, {
      scope: "persistGenerationAsset",
      keyId,
      workspaceId,
      generationId,
      sourceUrl: result.resultUrl,
    });
    return;
  }

  try {
    const updatedKey = await completeGenerationAndDeduct({
      generationId,
      keyId,
      workspaceId,
      type,
      prompt,
      duration,
      quality,
      style,
      aspectRatio,
      creditsUsed,
      resultUrl: result.resultUrl,
      storageUrl: persistedAsset.storageUrl,
      storageKey: persistedAsset.storageKey,
      thumbnailUrl: persistedAsset.thumbnailUrl,
      mimeType: persistedAsset.mimeType,
      fileSize: persistedAsset.fileSize,
      provider: result.provider,
      model: result.model,
      finalPrompt: result.finalPrompt || prompt,
      enhancedPrompt: promptDiagnostics.enhancedPrompt || null,
      negativePrompt: promptDiagnostics.negativePrompt || null,
      seed: result.seed,
    });

    await upsertPromptAnalytics({
      generationId,
      prompt,
      enhancedPrompt: promptDiagnostics.enhancedPrompt || null,
      finalPrompt: result.finalPrompt || promptDiagnostics.finalPrompt || prompt,
      negativePrompt: promptDiagnostics.negativePrompt || null,
      model: result.model,
      success: true,
    }).catch((error) => {
      logError(error, { scope: "upsertPromptAnalytics", generationId });
    });

    logInfo("GENERATION_COMPLETED", {
      keyId,
      generationId,
      type,
      creditsUsed,
      provider: result.provider,
      seed: result.seed,
    });

    console.log("SAVED GENERATION ID:", generationId);
    console.log("SAVED RESULT URL:", result.resultUrl);
    console.log("REMAINING BALANCE:", Number(updatedKey.balance || 0));
  } catch (error) {
    if (error.statusCode !== 409) {
      await markGenerationFailed({ generationId, message: "طھظ… ط¥ظ†ط´ط§ط، ط§ظ„ظ†طھظٹط¬ط© ظ„ظƒظ† طھط¹ط°ط± ط­ظپط¸ظ‡ط§ ط£ظˆ ط®طµظ… ط§ظ„ط±طµظٹط¯." });
    }
    logError(error, {
      scope: "completeGenerationAndDeduct",
      keyId,
      generationId,
      resultUrl: result.resultUrl,
    });
  }
}

async function loadAndValidateKey({ keyId, type, creditsUsed }) {
  const key = await withDbRetry(() =>
    prisma.activationCode.findUnique({
      where: { id: keyId },
    })
  );

  if (!key) {
    httpError("ط¬ظ„ط³ط© ط§ظ„ظ…ظپطھط§ط­ ط؛ظٹط± طµط§ظ„ط­ط©.", 401);
  }

  const isExpired = key.expiresAt && new Date(key.expiresAt).getTime() < Date.now();
  if (!key.isActive || isExpired) {
    httpError("ظ‡ط°ط§ ط§ظ„ظ…ظپطھط§ط­ ط؛ظٹط± ظ…طھط§ط­ ط£ظˆ ط§ظ†طھظ‡طھ طµظ„ط§ط­ظٹطھظ‡.");
  }

  if (getRemainingSlots(key, type) < 1) {
    httpError(type === "video" ? "ظ„ط§ ظٹظˆط¬ط¯ ط±طµظٹط¯ ظپظٹط¯ظٹظˆ ظƒط§ظپظچ" : "ظ„ط§ ظٹظˆط¬ط¯ ط±طµظٹط¯ طµظˆط± ظƒط§ظپظچ");
  }

  if (Number(key.balance || 0) < creditsUsed) {
    httpError("ط±طµظٹط¯ظƒ ط؛ظٹط± ظƒط§ظپظچ ظ„ط¥طھظ…ط§ظ… ظ‡ط°ط§ ط§ظ„ط·ظ„ط¨.");
  }

  return key;
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    await ensureGenerationTable();
    await ensureGenerationFeedbackInfrastructure();

    const auth = await getAuthWorkspace(req);
    const keyId = auth.activationKeyId;
    const workspaceId = auth.workspaceId;
    await backfillLegacyProjectsForWorkspace({ keyId, workspaceId });
    const page = Math.max(Number(req.query.page || 1), 1);
    const limit = Math.min(Math.max(Number(req.query.limit || 60), 1), 60);
    const offset = (page - 1) * limit;
    const requestedType = String(req.query.type || "all").trim().toLowerCase();
    const typeFilter = requestedType === "image" || requestedType === "video" ? requestedType : "all";

    const countRows =
      typeFilter === "all"
        ? await withDbRetry(() =>
            prisma.$queryRaw`
              SELECT COUNT(*)::INT AS total
              FROM generations g
              WHERE (g.workspace_id = ${workspaceId} OR (g.workspace_id IS NULL AND g.key_id = ${keyId}))
                AND g.status IN ('queued', 'processing', 'completed', 'failed')
                AND g.deleted_at IS NULL
            `
          )
        : await withDbRetry(() =>
            prisma.$queryRaw`
              SELECT COUNT(*)::INT AS total
              FROM generations g
              WHERE (g.workspace_id = ${workspaceId} OR (g.workspace_id IS NULL AND g.key_id = ${keyId}))
                AND g.type = ${typeFilter}
                AND g.status IN ('queued', 'processing', 'completed', 'failed')
                AND g.deleted_at IS NULL
            `
          );

    const rows =
      typeFilter === "all"
        ? await withDbRetry(() =>
            prisma.$queryRaw`
              SELECT g.id,
                     g.workspace_id,
                     g.request_id,
                     g.type,
                     g.prompt,
                     g.quality,
                     g.style,
                     g.aspect_ratio,
                     g.duration,
                     g.provider,
                     g.model,
                     g.seed,
                     g.final_prompt,
                     g.enhanced_prompt,
                     g.negative_prompt,
                     g.credits_used,
                     g.status,
                     g.result_url,
                     g.storage_url,
                     g.storage_key,
                     g.thumbnail_url,
                     g.mime_type,
                     g.file_size,
                     g.is_favorite,
                     g.created_at,
                     g.completed_at,
                     EXTRACT(EPOCH FROM (g.completed_at - g.created_at)) * 1000 AS generation_time_ms,
                     gf.rating AS user_rating,
                     gf.score AS quality_score
              FROM generations g
              LEFT JOIN generation_feedback gf ON gf.generation_id = g.id
              WHERE (g.workspace_id = ${workspaceId} OR (g.workspace_id IS NULL AND g.key_id = ${keyId}))
                AND g.status IN ('queued', 'processing', 'completed', 'failed')
                AND g.deleted_at IS NULL
              ORDER BY g.created_at DESC
              LIMIT ${limit}
              OFFSET ${offset}
            `
          )
        : await withDbRetry(() =>
            prisma.$queryRaw`
              SELECT g.id,
                     g.workspace_id,
                     g.request_id,
                     g.type,
                     g.prompt,
                     g.quality,
                     g.style,
                     g.aspect_ratio,
                     g.duration,
                     g.provider,
                     g.model,
                     g.seed,
                     g.final_prompt,
                     g.enhanced_prompt,
                     g.negative_prompt,
                     g.credits_used,
                     g.status,
                     g.result_url,
                     g.storage_url,
                     g.storage_key,
                     g.thumbnail_url,
                     g.mime_type,
                     g.file_size,
                     g.is_favorite,
                     g.created_at,
                     g.completed_at,
                     EXTRACT(EPOCH FROM (g.completed_at - g.created_at)) * 1000 AS generation_time_ms,
                     gf.rating AS user_rating,
                     gf.score AS quality_score
              FROM generations g
              LEFT JOIN generation_feedback gf ON gf.generation_id = g.id
              WHERE (g.workspace_id = ${workspaceId} OR (g.workspace_id IS NULL AND g.key_id = ${keyId}))
                AND g.type = ${typeFilter}
                AND g.status IN ('queued', 'processing', 'completed', 'failed')
                AND g.deleted_at IS NULL
              ORDER BY g.created_at DESC
              LIMIT ${limit}
              OFFSET ${offset}
            `
          );

    const generations = rows.map(serializeGeneration);
    const total = Number(countRows?.[0]?.total || generations.length);

    return res.json({
      success: true,
      generations,
      projects: generations,
      pagination: {
        page,
        limit,
        total,
        hasMore: page * limit < total,
      },
    });
  })
);

router.get(
  "/feedback/stats",
  asyncHandler(async (_req, res) => {
    const stats = await getModelFeedbackStats({ limit: 100 });
    return res.json({
      success: true,
      stats,
    });
  })
);

router.post(
  "/:id/rating",
  asyncHandler(async (req, res) => {
    await ensureGenerationTable();
    await ensureGenerationFeedbackInfrastructure();

    const auth = await getAuthWorkspace(req);
    const keyId = auth.activationKeyId;
    const workspaceId = auth.workspaceId;
    const generationId = Number(req.params.id);
    if (!Number.isFinite(generationId)) {
      httpError("ظ…ط¹ط±ظپ ط§ظ„ظ†طھظٹط¬ط© ط؛ظٹط± طµط§ظ„ط­.", 400);
    }

    const generation = await loadCompletedGenerationById({ keyId, workspaceId, generationId });
    if (!generation) {
      httpError("ظ„ظ… ظٹطھظ… ط§ظ„ط¹ط«ظˆط± ط¹ظ„ظ‰ ط§ظ„ظ†طھظٹط¬ط© ط§ظ„ظ…ط·ظ„ظˆط¨ط©.", 404);
    }

    const feedback = await upsertGenerationFeedback({
      generationId,
      keyId,
      model: generation.model,
      prompt: generation.prompt,
      rating: req.body?.rating,
    });
    const stats = await getModelFeedbackStats({ model: generation.model, limit: 1 });

    console.log("GENERATION_USER_RATING:", {
      generationId,
      requestId: generation.request_id,
      model: generation.model,
      rating: feedback.rating,
      score: feedback.score,
    });

    return res.json({
      success: true,
      feedback,
      modelStats: stats[0] || null,
    });
  })
);

router.patch(
  "/:id/favorite",
  asyncHandler(async (req, res) => {
    await ensureGenerationTable();

    const auth = await getAuthWorkspace(req);
    const keyId = auth.activationKeyId;
    const workspaceId = auth.workspaceId;
    const generationId = Number(req.params.id);
    if (!Number.isFinite(generationId)) {
      httpError("ظ…ط¹ط±ظپ ط§ظ„ظ†طھظٹط¬ط© ط؛ظٹط± طµط§ظ„ط­.", 400);
    }

    const isFavorite = Boolean(req.body?.isFavorite);
    const rows = await withDbRetry(() =>
      prisma.$queryRaw`
        UPDATE generations
        SET is_favorite = ${isFavorite}
        WHERE id = ${generationId}
          AND (workspace_id = ${workspaceId} OR (workspace_id IS NULL AND key_id = ${keyId}))
          AND deleted_at IS NULL
        RETURNING id, is_favorite
      `
    );

    if (!rows.length) {
      httpError("ظ„ظ… ظٹطھظ… ط§ظ„ط¹ط«ظˆط± ط¹ظ„ظ‰ ط§ظ„ظ†طھظٹط¬ط© ط§ظ„ظ…ط·ظ„ظˆط¨ط©.", 404);
    }

    return res.json({
      success: true,
      generationId: Number(rows[0].id),
      isFavorite: Boolean(rows[0].is_favorite),
    });
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await ensureGenerationTable();

    const auth = await getAuthWorkspace(req);
    const keyId = auth.activationKeyId;
    const workspaceId = auth.workspaceId;
    const generationId = Number(req.params.id);
    if (!Number.isFinite(generationId)) {
      httpError("ظ…ط¹ط±ظپ ط§ظ„ظ†طھظٹط¬ط© ط؛ظٹط± طµط§ظ„ط­.", 400);
    }

    const rows = await withDbRetry(() =>
      prisma.$queryRaw`
        UPDATE generations
        SET deleted_at = NOW(),
            is_favorite = FALSE
        WHERE id = ${generationId}
          AND (workspace_id = ${workspaceId} OR (workspace_id IS NULL AND key_id = ${keyId}))
          AND deleted_at IS NULL
        RETURNING id
      `
    );

    if (!rows.length) {
      httpError("ظ„ظ… ظٹطھظ… ط§ظ„ط¹ط«ظˆط± ط¹ظ„ظ‰ ط§ظ„ظ†طھظٹط¬ط© ط§ظ„ظ…ط·ظ„ظˆط¨ط©.", 404);
    }

    return res.json({
      success: true,
      generationId: Number(rows[0].id),
    });
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    await ensureGenerationTable();
    await ensureGenerationFeedbackInfrastructure();

    const auth = await getAuthWorkspace(req);
    const keyId = auth.activationKeyId;
    const workspaceId = auth.workspaceId;
    const generationId = Number(req.params.id);
    await backfillLegacyProjectsForWorkspace({ keyId, workspaceId });

    if (!Number.isFinite(generationId)) {
      httpError("ظ…ط¹ط±ظپ ط§ظ„ظ†طھظٹط¬ط© ط؛ظٹط± طµط§ظ„ط­.", 400);
    }

    console.log("GET GENERATION ID:", generationId);

    const generation = await loadCompletedGenerationById({ keyId, workspaceId, generationId });

    if (!generation) {
      httpError("ظ„ظ… ظٹطھظ… ط§ظ„ط¹ط«ظˆط± ط¹ظ„ظ‰ ط§ظ„ظ†طھظٹط¬ط© ط§ظ„ظ…ط·ظ„ظˆط¨ط©.", 404);
    }

    console.log("GET GENERATION RESULT ID:", generation.id);
    console.log("GET GENERATION RESULT URL:", generation.result_url);

    return res.json({
      success: true,
      generation: serializeGeneration(generation),
    });
  })
);

router.get(
  "/:id/status",
  asyncHandler(async (req, res) => {
    await ensureGenerationTable();

    const auth = await getAuthWorkspace(req);
    const keyId = auth.activationKeyId;
    const workspaceId = auth.workspaceId;
    const generationId = Number(req.params.id);
    await backfillLegacyProjectsForWorkspace({ keyId, workspaceId });

    if (!Number.isFinite(generationId)) {
      httpError("ظ…ط¹ط±ظپ ط§ظ„ظ†طھظٹط¬ط© ط؛ظٹط± طµط§ظ„ط­.", 400);
    }

    const rows = await withDbRetry(() =>
      prisma.$queryRaw`
        SELECT g.id,
               g.workspace_id,
               g.request_id,
               g.type,
               g.prompt,
               g.quality,
               g.style,
               g.aspect_ratio,
               g.duration,
               g.provider,
               g.model,
               g.seed,
               g.final_prompt,
               g.enhanced_prompt,
               g.negative_prompt,
               g.credits_used,
               g.status,
               g.result_url,
               g.storage_url,
               g.storage_key,
               g.thumbnail_url,
               g.mime_type,
               g.file_size,
               g.is_favorite,
               g.created_at,
               g.completed_at,
               EXTRACT(EPOCH FROM (g.completed_at - g.created_at)) * 1000 AS generation_time_ms
        FROM generations g
        WHERE (g.workspace_id = ${workspaceId} OR (g.workspace_id IS NULL AND g.key_id = ${keyId}))
          AND g.id = ${generationId}
          AND g.deleted_at IS NULL
        LIMIT 1
      `
    );

    if (!rows.length) {
      httpError("ظ„ظ… ظٹطھظ… ط§ظ„ط¹ط«ظˆط± ط¹ظ„ظ‰ ط§ظ„ظ†طھظٹط¬ط© ط§ظ„ظ…ط·ظ„ظˆط¨ط©.", 404);
    }

    return res.json({
      success: true,
      generation: serializeGeneration(rows[0]),
    });
  })
);

router.post(
  "/",
  aiLimiter,
  asyncHandler(async (req, res) => {
    await ensureGenerationTable();
    await ensureWorkspacesTable();
    await ensureGenerationFeedbackInfrastructure();

    const auth = await getAuthWorkspace(req);
    const keyId = auth.activationKeyId;
    const workspaceId = auth.workspaceId;
    const type = normalizeGenerationType(req.body.type || "image");
    let quality = normalizeQuality(req.body.quality || "normal");
    const duration = type === "video" ? normalizeDuration(req.body.durationSeconds || req.body.duration || 5) : null;
    const style = String(req.body.style || "").trim();
    const aspectRatio = String(req.body.aspectRatio || req.body.aspect || "").trim();
    const prompt = assertValidPrompt(req.body.prompt);
    assertAllowedGenerationContent(prompt);
    const requestId = String(req.body.requestId || "").trim().slice(0, 80) || randomUUID();
    const providedSeed = Number(req.body.seed);
    const seed = Number.isFinite(providedSeed) ? providedSeed : Math.floor(Math.random() * 999999999);

    console.log("PROMPT_COMPLEXITY:", {
      requestId,
      ...analyzePromptComplexity(prompt),
    });

    const routing = await resolveQualityForPrompt({ type, quality, prompt });
    if (routing.blocked) {
      console.log("MODEL_QUALITY_BLOCKED:", {
        type,
        quality,
        prompt,
        reason: routing.reason,
        model: routing.model,
      });
      httpError("هذا النموذج لم يجتز اختبارات الجودة المطلوبة بعد. فعّل نموذجًا معتمدًا من لوحة الأدمن ثم أعد المحاولة.", 503);
    }

    if (routing.routed) {
      console.log("MODEL_QUALITY_SMART_ROUTING:", {
        type,
        fromQuality: quality,
        toQuality: routing.quality,
        model: routing.model,
        reason: routing.reason,
      });
      quality = routing.quality;
    }

    const creditsUsed = calculateRequiredCredits(type, quality, duration || 5);
    const promptDiagnostics = await buildSmartPromptEnhancementAsync({
      userPrompt: prompt,
      type,
      quality,
      style,
    });

    logGenerationPromptDiagnostics({
      prompt,
      diagnostics: promptDiagnostics,
      requestId,
      seed,
    });

    console.log("REQUEST_ID:", requestId);
    console.log("SEED:", seed);
    console.log("SELECTED TYPE:", type);
    console.log("SELECTED QUALITY:", quality);
    console.log("CREDITS USED:", creditsUsed);

    logInfo("GENERATION_REQUEST", {
      keyId,
      workspaceId,
      type,
      quality,
      duration,
      creditsUsed,
      prompt,
      requestId,
      seed,
    });

    await loadAndValidateKey({ keyId, type, creditsUsed });

    const generationId = await createGenerationRecord({
      keyId,
      workspaceId,
      type,
      prompt,
      quality,
      duration,
      creditsUsed,
      finalPrompt: promptDiagnostics.finalPrompt || prompt,
      enhancedPrompt: promptDiagnostics.enhancedPrompt || null,
      negativePrompt: promptDiagnostics.negativePrompt || null,
      requestId,
      style,
      aspectRatio,
    });

    scheduleGenerationCompletion({
      generationId,
      keyId,
      workspaceId,
      type,
      prompt,
      duration,
      quality,
      style,
      aspectRatio,
      creditsUsed,
      promptDiagnostics,
      requestId,
      seed,
    });

    return res.json({
      success: true,
      message: type === "video" ? "تم بدء إنشاء الفيديو." : "تم بدء إنشاء الصورة.",
      generationId,
      requestId,
      status: "processing",
      creditsUsed,
      generation: {
        id: generationId,
        requestId,
        type,
        prompt,
        quality,
        style,
        aspectRatio,
        duration,
        creditsUsed,
        status: "processing",
        createdAt: new Date().toISOString(),
      },
    });
  })
);

export default router;
