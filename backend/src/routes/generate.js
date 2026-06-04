import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { aiLimiter } from "../middleware/rateLimit.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { withDbRetry } from "../utils/dbRetry.js";
import { logError, logInfo } from "../utils/logger.js";
import { generateFluxImage } from "../services/fluxService.js";
import { generateWaveSpeedVideo } from "../services/wavespeedService.js";
import {
  assertValidPrompt,
  calculateRequiredCredits,
  normalizeDuration,
  normalizeGenerationType,
  normalizeQuality,
} from "../utils/credits.js";

const router = Router();

function httpError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
}

function providerFailureMessage(error, type) {
  const fallback = "فشل التوليد، لم يتم خصم أي رصيد.";
  const raw = String(error?.message || "").trim();

  if (!raw) {
    return fallback;
  }

  if (raw.includes("BFL_API_KEY") || raw.includes("WAVESPEED_API_KEY")) {
    return raw;
  }

  if (/unauthorized|invalid api|invalid key|api key|forbidden|401|403/i.test(raw)) {
    return type === "video"
      ? "مفتاح WaveSpeed غير صحيح أو غير مفعل في Render. لم يتم خصم أي رصيد."
      : "مفتاح BFL غير صحيح أو غير مفعل في Render. لم يتم خصم أي رصيد.";
  }

  if (error?.statusCode && error.statusCode < 500) {
    return `${raw} لم يتم خصم أي رصيد.`;
  }

  return `${fallback} السبب: ${raw}`;
}

function getKeyId(req) {
  const keyId = Number(req.cookies?.key_session);
  if (!Number.isFinite(keyId)) {
    httpError("أدخل مفتاحك أولًا للوصول إلى التوليد.", 401);
  }
  return keyId;
}

function getRemainingSlots(key, type) {
  const limit = type === "video" ? Number(key.videoLimit || 0) : Number(key.imageLimit || 0);
  const used = type === "video" ? Number(key.videoUsed || 0) : Number(key.imageUsed || 0);
  return Math.max(limit - used, 0);
}

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

async function ensureGenerationTable() {
  const statements = [
    `
      CREATE TABLE IF NOT EXISTS generations (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        key_id INTEGER,
        type VARCHAR(32) NOT NULL,
        prompt TEXT NOT NULL,
        quality VARCHAR(32),
        duration INTEGER,
        provider VARCHAR(64),
        model VARCHAR(128),
        final_prompt TEXT,
        request_id VARCHAR(80),
        credits_used INTEGER NOT NULL DEFAULT 0,
        status VARCHAR(32) NOT NULL DEFAULT 'queued',
        result_url TEXT,
        error_message TEXT,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP(3)
      )
    `,
    `ALTER TABLE generations ADD COLUMN IF NOT EXISTS provider VARCHAR(64)`,
    `ALTER TABLE generations ADD COLUMN IF NOT EXISTS model VARCHAR(128)`,
    `ALTER TABLE generations ADD COLUMN IF NOT EXISTS final_prompt TEXT`,
    `ALTER TABLE generations ADD COLUMN IF NOT EXISTS request_id VARCHAR(80)`,
    `ALTER TABLE generations ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP(3)`,
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
      type VARCHAR(32) NOT NULL,
      prompt TEXT NOT NULL,
      duration INTEGER,
      quality VARCHAR(32),
      style VARCHAR(64),
      result_url TEXT,
      status VARCHAR(32) NOT NULL DEFAULT 'completed',
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function assertNoRunningGeneration(keyId) {
  const staleSeconds = Math.max(Number(process.env.GENERATION_STALE_SECONDS || 30), 10);

  await withDbRetry(() =>
    prisma.$executeRaw`
      UPDATE generations
      SET status = 'failed',
          error_message = 'تم إلغاء طلب عالق تلقائيًا قبل إرسال طلب جديد.'
      WHERE key_id = ${keyId}
        AND status IN ('queued', 'processing')
        AND created_at < NOW() - (${`${staleSeconds} seconds`})::interval
    `
  );

  const rows = await withDbRetry(() =>
    prisma.$queryRaw`
      SELECT id, created_at
      FROM generations
      WHERE key_id = ${keyId}
        AND status IN ('queued', 'processing')
        AND created_at > NOW() - (${`${staleSeconds} seconds`})::interval
      LIMIT 1
    `
  );

  if (rows.length > 0) {
    httpError(`لديك طلب قيد المعالجة حاليًا. أعد المحاولة بعد ${staleSeconds} ثانية.`, 409);
  }
}

async function createGenerationRecord({
  keyId,
  type,
  prompt,
  quality,
  duration,
  creditsUsed,
  provider = null,
  model = null,
  finalPrompt = null,
  requestId = null,
  status = "processing",
}) {
  const rows = await withDbRetry(() =>
    prisma.$queryRaw`
      INSERT INTO generations (key_id, type, prompt, quality, duration, provider, model, final_prompt, request_id, credits_used, status)
      VALUES (${keyId}, ${type}, ${prompt}, ${quality}, ${duration}, ${provider}, ${model}, ${finalPrompt}, ${requestId}, ${creditsUsed}, ${status})
      RETURNING id
    `
  );

  return Number(rows?.[0]?.id);
}

async function markGenerationFailed({ generationId, message }) {
  if (!generationId) {
    return;
  }

  await withDbRetry(() =>
    prisma.$executeRaw`
      UPDATE generations
      SET status = 'failed', error_message = ${message || "فشل التوليد"}
      WHERE id = ${generationId}
    `
  ).catch((error) => logError(error, { scope: "markGenerationFailed", generationId }));
}

async function completeGenerationAndDeduct({
  generationId,
  keyId,
  type,
  prompt,
  duration,
  quality,
  style,
  creditsUsed,
  resultUrl,
  provider,
  model,
  finalPrompt,
}) {
  return withDbRetry(() =>
    prisma.$transaction(async (tx) => {
      await ensureProjectsTable(tx);
      await ensureCreditTransactionsTable(tx);

      const generationRows = await tx.$queryRaw`
        SELECT status
        FROM generations
        WHERE id = ${generationId}
        FOR UPDATE
      `;

      if (!generationRows.length) {
        httpError("سجل التوليد غير موجود.", 500);
      }

      if (generationRows[0].status === "completed") {
        httpError("تم خصم رصيد هذا الطلب مسبقًا.", 409);
      }

      if (!["queued", "processing"].includes(generationRows[0].status)) {
        httpError("تم إلغاء هذا الطلب أو فشل سابقًا، ولن يتم خصم أي رصيد.", 409);
      }

      const current = await tx.activationCode.findUnique({
        where: { id: keyId },
      });

      if (!current) {
        httpError("جلسة المفتاح غير صالحة.", 401);
      }

      const creditsRemaining = Number(current.balance || 0);
      if (creditsRemaining < creditsUsed) {
        httpError("رصيدك غير كافٍ لإتمام هذا الطلب.");
      }

      const slotField = type === "video" ? "videoUsed" : "imageUsed";
      if (getRemainingSlots(current, type) < 1) {
        httpError(type === "video" ? "لا يوجد رصيد فيديو كافٍ" : "لا يوجد رصيد صور كافٍ");
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
        httpError("رصيدك غير كافٍ لإتمام هذا الطلب.");
      }

      const updatedKey = await tx.activationCode.findUnique({
        where: { id: keyId },
      });

      await tx.$executeRaw`
        UPDATE generations
        SET status = 'completed',
            result_url = ${resultUrl},
            provider = ${provider},
            model = ${model},
            final_prompt = ${finalPrompt || prompt},
            completed_at = NOW()
        WHERE id = ${generationId}
      `;

      const reason =
        type === "video"
          ? `video_generation_${duration}s_${quality}`
          : `image_generation_${quality}`;

      await tx.$executeRaw`
        INSERT INTO credit_transactions (user_id, key_id, amount, type, reason, generation_id)
        VALUES (NULL, ${keyId}, ${-creditsUsed}, 'generation', ${reason}, ${generationId})
      `;

      await tx.$executeRaw`
        INSERT INTO projects (key_id, type, prompt, duration, quality, style, result_url, status)
        VALUES (${keyId}, ${type}, ${prompt}, ${duration}, ${quality}, ${style}, ${resultUrl}, 'completed')
      `;

      return updatedKey;
    })
  );
}

async function loadAndValidateKey({ keyId, type, creditsUsed }) {
  const key = await withDbRetry(() =>
    prisma.activationCode.findUnique({
      where: { id: keyId },
    })
  );

  if (!key) {
    httpError("جلسة المفتاح غير صالحة.", 401);
  }

  const isExpired = key.expiresAt && new Date(key.expiresAt).getTime() < Date.now();
  if (!key.isActive || isExpired) {
    httpError("هذا المفتاح غير متاح أو انتهت صلاحيته.");
  }

  if (getRemainingSlots(key, type) < 1) {
    httpError(type === "video" ? "لا يوجد رصيد فيديو كافٍ" : "لا يوجد رصيد صور كافٍ");
  }

  if (Number(key.balance || 0) < creditsUsed) {
    httpError("رصيدك غير كافٍ لإتمام هذا الطلب.");
  }

  return key;
}

router.post(
  "/",
  aiLimiter,
  asyncHandler(async (req, res) => {
    await ensureGenerationTable();

    const keyId = getKeyId(req);
    const type = normalizeGenerationType(req.body.type || "image");
    const quality = normalizeQuality(req.body.quality || "normal");
    const duration = type === "video" ? normalizeDuration(req.body.durationSeconds || req.body.duration || 5) : null;
    const style = String(req.body.style || "").trim();
    const prompt = assertValidPrompt(req.body.prompt);
    const requestId = String(req.body.requestId || "").trim().slice(0, 80) || `server-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const creditsUsed = calculateRequiredCredits(type, quality, duration || 5);

    console.log("REQUEST ID:", requestId);
    console.log("PROMPT SENT:", prompt);
    console.log("SELECTED TYPE:", type);
    console.log("SELECTED QUALITY:", quality);
    console.log("CREDITS USED:", creditsUsed);

    logInfo("GENERATION_REQUEST", {
      keyId,
      type,
      quality,
      duration,
      creditsUsed,
      prompt,
      requestId,
    });

    await assertNoRunningGeneration(keyId);
    await loadAndValidateKey({ keyId, type, creditsUsed });

    const generationId = await createGenerationRecord({
      keyId,
      type,
      prompt,
      quality,
      duration,
      creditsUsed,
      finalPrompt: prompt,
      requestId,
    });

    let result;

    try {
      if (type === "image") {
        result = await generateFluxImage({ prompt, quality, style, requestId });
      } else {
        result = await generateWaveSpeedVideo({ prompt, duration, quality, style });
      }

      logInfo("GENERATION_PROVIDER_RESULT", {
        keyId,
        generationId,
        type,
        provider: result?.provider,
        model: result?.model,
        seed: result?.seed,
        finalPrompt: result?.finalPrompt || prompt,
        resultUrl: result?.resultUrl,
      });
    } catch (error) {
      await markGenerationFailed({ generationId, message: error.message });
      logError(error, { scope: "generateProvider", keyId, generationId, type });
      httpError(providerFailureMessage(error, type), error.statusCode || 502);
      httpError("فشل التوليد، لم يتم خصم أي رصيد.", error.statusCode || 502);
    }

    if (!result?.resultUrl) {
      await markGenerationFailed({ generationId, message: "لم يرجع مزود التوليد رابط نتيجة." });
      httpError("فشل التوليد، لم يتم خصم أي رصيد. السبب: لم يرجع مزود التوليد رابط نتيجة.", 502);
      await markGenerationFailed({ generationId, message: "لم يرجع المزود رابط نتيجة." });
      httpError("فشل التوليد، لم يتم خصم أي رصيد.", 502);
    }

    let updatedKey;
    try {
      updatedKey = await completeGenerationAndDeduct({
        generationId,
        keyId,
        type,
        prompt,
        duration,
        quality,
        style,
        creditsUsed,
        resultUrl: result.resultUrl,
        provider: result.provider,
        model: result.model,
        finalPrompt: result.finalPrompt || prompt,
      });
    } catch (error) {
      if (error.statusCode !== 409) {
        await markGenerationFailed({ generationId, message: "تم إنشاء النتيجة لكن تعذر حفظها أو خصم الرصيد." });
      }
      logError(error, {
        scope: "completeGenerationAndDeduct",
        keyId,
        generationId,
        resultUrl: result.resultUrl,
      });
      httpError("تم إنشاء النتيجة لكن تعذر حفظها. لم يتم خصم الرصيد، وتم تسجيل الخطأ للمراجعة.", 500);
    }

    logInfo("GENERATION_COMPLETED", {
      keyId,
      generationId,
      type,
      creditsUsed,
      provider: result.provider,
      seed: result.seed,
    });

    return res.json({
      message: "تم الإنشاء بنجاح.",
      generationId,
      requestId,
      resultUrl: result.resultUrl,
      status: "completed",
      creditsUsed,
      creditsRemaining: Number(updatedKey.balance || 0),
      accessCode: serializeKeyBalance(updatedKey),
    });
  })
);

export default router;
