import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { aiLimiter } from "../middleware/rateLimit.js";
import { generateImage, generateVideo } from "../services/aiProvider.js";
import {
  consumeActivationCodeUsageByKey,
  getActivationCodeById,
} from "../services/activationCodes.js";

const router = Router();

function httpError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
}

function buildGenerationPrompt({ prompt, quality, style, durationSeconds }) {
  return [
    prompt,
    quality ? `Quality: ${quality}` : "",
    style ? `Style: ${style}` : "",
    durationSeconds ? `Duration: ${durationSeconds} seconds` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function getKeyId(req) {
  const keyId = Number(req.cookies?.key_session);
  if (!Number.isFinite(keyId)) {
    httpError("أدخل مفتاحك أولًا للوصول إلى الإنشاء.", 401);
  }
  return keyId;
}

async function assertKeyCanGenerate(keyId, type) {
  const key = await getActivationCodeById(keyId);
  if (!key) {
    httpError("جلسة المفتاح غير صالحة.", 401);
  }
  if (!key.isActive || key.statusKey === "expired") {
    httpError("هذا المفتاح غير متاح.");
  }

  const remaining = type === "video" ? key.videoAvailable : key.imageAvailable;
  if (remaining < 1) {
    httpError(type === "video" ? "لا يوجد رصيد فيديو كافٍ" : "لا يوجد رصيد صور كافٍ");
  }
}

router.post(
  "/",
  aiLimiter,
  asyncHandler(async (req, res) => {
    const keyId = getKeyId(req);
    const type = String(req.body.type || "image");
    const prompt = String(req.body.prompt || "").trim();
    const quality = String(req.body.quality || "high").trim();
    const style = String(req.body.style || "").trim();
    const durationSeconds = Number(req.body.durationSeconds || req.body.duration || 0) || undefined;

    if (!prompt) {
      httpError("اكتب وصفًا واضحًا قبل الإرسال.");
    }

    if (!["image", "video"].includes(type)) {
      httpError("نوع الإنشاء غير صالح.");
    }

    await assertKeyCanGenerate(keyId, type);

    const enhancedPrompt = buildGenerationPrompt({
      prompt,
      quality,
      style,
      durationSeconds,
    });

    let result;
    if (type === "video") {
      result = await generateVideo({ prompt: enhancedPrompt });
    } else {
      result = await generateImage({ prompt: enhancedPrompt });
    }

    const accessCode = await consumeActivationCodeUsageByKey({
      keyId,
      type,
      promptText: enhancedPrompt,
      outputUrl: result?.resultUrl || null,
      duration: durationSeconds || null,
      quality,
      style,
    });

    return res.json({
      message: "تم إنشاء الطلب بنجاح.",
      resultUrl: result?.resultUrl || null,
      status: result?.resultUrl ? "completed" : "processing",
      accessCode,
    });
  })
);

export default router;
