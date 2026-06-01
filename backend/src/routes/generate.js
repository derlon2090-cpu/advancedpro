import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";
import { aiLimiter } from "../middleware/rateLimit.js";
import { handleImageRequest, handleVideoRequest } from "../services/aiWorkflow.js";

const router = Router();

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

router.post(
  "/",
  requireAuth,
  aiLimiter,
  asyncHandler(async (req, res) => {
    const type = String(req.body.type || "image");
    const prompt = String(req.body.prompt || "").trim();
    const quality = String(req.body.quality || "high").trim();
    const style = String(req.body.style || "").trim();
    const durationSeconds = Number(req.body.durationSeconds || req.body.duration || 0) || undefined;
    const enhancedPrompt = buildGenerationPrompt({
      prompt,
      quality,
      style,
      durationSeconds,
    });

    if (type === "video") {
      const result = await handleVideoRequest({
        userId: req.user.id,
        prompt: enhancedPrompt,
        durationSeconds,
      });
      return res.json({
        message: "طلب الفيديو قيد المعالجة.",
        ...result,
      });
    }

    const result = await handleImageRequest({
      userId: req.user.id,
      prompt: enhancedPrompt,
    });
    return res.json({
      message: "تم إنشاء الطلب بنجاح.",
      ...result,
    });
  })
);

export default router;
