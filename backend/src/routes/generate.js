import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";
import { aiLimiter } from "../middleware/rateLimit.js";
import { handleImageRequest, handleVideoRequest } from "../services/aiWorkflow.js";

const router = Router();

router.post(
  "/",
  requireAuth,
  aiLimiter,
  asyncHandler(async (req, res) => {
    const type = String(req.body.type || "image");
    const prompt = String(req.body.prompt || "").trim();

    if (type === "video") {
      const result = await handleVideoRequest({
        userId: req.user.id,
        prompt,
        durationSeconds: req.body.durationSeconds,
      });
      return res.json({ message: "طلب الفيديو قيد المعالجة.", ...result });
    }

    const result = await handleImageRequest({ userId: req.user.id, prompt });
    return res.json({ message: "تم إنشاء الطلب بنجاح.", ...result });
  })
);

export default router;
