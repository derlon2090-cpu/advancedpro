import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { prisma } from "../lib/prisma.js";
import { verifyToken } from "../utils/jwt.js";
import { fetchWaveSpeedModels, generateRawImageWithWaveSpeed } from "../services/wavespeedService.js";

const router = Router();

async function requireAdminDebugSession(req, res, next) {
  try {
    const token = req.cookies?.admin_session;
    if (!token) {
      return res.status(401).json({
        success: false,
        message: "جلسة الأدمن مطلوبة لتشغيل اختبار التوليد الخام.",
      });
    }

    let payload;
    try {
      payload = verifyToken(token);
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: "جلسة الأدمن غير صالحة.",
      });
    }

    if (payload?.scope !== "admin") {
      return res.status(403).json({
        success: false,
        message: "هذا الاختبار مخصص للأدمن فقط.",
      });
    }

    const admin = await prisma.user.findFirst({
      where: {
        id: Number(payload.id),
        status: "active",
        role: { in: ["admin", "owner"] },
      },
      select: { id: true },
    });

    if (!admin) {
      return res.status(401).json({
        success: false,
        message: "لم يتم العثور على جلسة أدمن فعالة.",
      });
    }

    return next();
  } catch (error) {
    return next(error);
  }
}

router.get(
  "/wavespeed-models",
  asyncHandler(async (req, res) => {
    const includeRaw = req.query.raw === "1" || req.query.raw === "true";
    const result = await fetchWaveSpeedModels({ includeRaw });

    return res.json({
      success: true,
      endpoint: result.endpoint,
      count: result.count,
      models: result.models,
      raw: includeRaw ? result.raw : undefined,
    });
  })
);

router.post(
  "/raw-image",
  requireAdminDebugSession,
  asyncHandler(async (req, res) => {
    const prompt =
      String(req.body?.prompt || "").trim() ||
      "A white chicken standing on a farm. No humans.";
    const result = await generateRawImageWithWaveSpeed({
      prompt,
      model: String(req.body?.model || "wavespeed-ai/z-image/turbo").trim(),
      endpoint:
        String(req.body?.endpoint || "").trim() ||
        "https://api.wavespeed.ai/api/v3/wavespeed-ai/z-image/turbo",
      aspectRatio: String(req.body?.aspectRatio || "1:1").trim(),
      seed: req.body?.seed,
    });

    return res.json({
      success: true,
      debug: {
        provider: result.provider,
        model: result.model,
        endpoint: result.endpoint,
        prompt: result.prompt,
        seed: result.seed,
        resultUrl: result.resultUrl,
      },
    });
  })
);

export default router;
