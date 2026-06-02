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
  calculateCredits,
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

function safeProviderErrorMessage(error, type) {
  const fallback =
    type === "image"
      ? "تعذر الاتصال بمزود الصور أو رفض الطلب."
      : "تعذر الاتصال بمزود الفيديو أو رفض الطلب.";
  const raw = String(error?.message || fallback)
    .replace(/BFL_API_KEY\s*=\s*[^\s"']+/gi, "BFL_API_KEY=***")
    .replace(/WAVESPEED_API_KEY\s*=\s*[^\s"']+/gi, "WAVESPEED_API_KEY=***")
    .replace(/x-key:\s*[^\s"']+/gi, "x-key: ***")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer ***");

  return raw.length > 240 ? `${raw.slice(0, 240)}...` : raw;
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
  await withDbRetry(() =>
    prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS generations (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        key_id INTEGER,
        type VARCHAR(32) NOT NULL,
        prompt TEXT NOT NULL,
        quality VARCHAR(32),
        duration INTEGER,
        credits_used INTEGER NOT NULL DEFAULT 0,
        status VARCHAR(32) NOT NULL DEFAULT 'queued',
        result_url TEXT,
        provider VARCHAR(64),
        error_message TEXT,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `)
  );
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
  const rows = await withDbRetry(() =>
    prisma.$queryRaw`
      SELECT id
      FROM generations
      WHERE key_id = ${keyId}
        AND status IN ('queued', 'processing')
        AND created_at > NOW() - INTERVAL '15 minutes'
      LIMIT 1
    `
  );

  if (rows.length > 0) {
    httpError("لديك طلب قيد المعالجة حاليًا. انتظر اكتماله قبل إرسال طلب جديد.", 409);
  }
}

async function createGenerationRecord({
  keyId,
  type,
  prompt,
  quality,
  duration,
  creditsUsed,
  status = "processing",
}) {
  const rows = await withDbRetry(() =>
    prisma.$queryRaw`
      INSERT INTO generations (key_id, type, prompt, quality, duration, credits_used, status)
      VALUES (${keyId}, ${type}, ${prompt}, ${quality}, ${duration}, ${creditsUsed}, ${status})
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
}) {
  return withDbRetry(() =>
    prisma.$transaction(async (tx) => {
      await ensureProjectsTable(tx);

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

      const updatedKey = await tx.activationCode.update({
        where: { id: keyId },
        data: {
          balance: { decrement: creditsUsed },
          [slotField]: { increment: 1 },
          isUsed: true,
        },
      });

      await tx.$executeRaw`
        UPDATE generations
        SET status = 'completed',
            result_url = ${resultUrl},
            provider = ${provider}
        WHERE id = ${generationId}
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
    const creditsUsed = calculateCredits(type, quality, duration || 5);

    await assertNoRunningGeneration(keyId);
    await loadAndValidateKey({ keyId, type, creditsUsed });

    const generationId = await createGenerationRecord({
      keyId,
      type,
      prompt,
      quality,
      duration,
      creditsUsed,
    });

    let result;

    try {
      if (type === "image") {
        result = await generateFluxImage({ prompt, quality, style });
      } else {
        result = await generateWaveSpeedVideo({ prompt, duration, quality, style });
      }
    } catch (error) {
      await markGenerationFailed({ generationId, message: error.message });
      logError(error, { scope: "generateProvider", keyId, generationId, type });
      httpError(
        `فشل ${type === "image" ? "توليد الصورة" : "توليد الفيديو"}: ${safeProviderErrorMessage(error, type)} لم يتم خصم أي رصيد.`,
        error.statusCode || 502
      );
    }

    if (!result?.resultUrl) {
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
      });
    } catch (error) {
      await markGenerationFailed({ generationId, message: "تم إنشاء النتيجة لكن تعذر حفظها أو خصم الرصيد." });
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
    });

    return res.json({
      message: "تم الإنشاء بنجاح.",
      generationId,
      resultUrl: result.resultUrl,
      status: "completed",
      creditsUsed,
      creditsRemaining: Number(updatedKey.balance || 0),
      accessCode: serializeKeyBalance(updatedKey),
    });
  })
);

export default router;
