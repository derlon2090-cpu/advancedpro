import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { getPublicSettings } from "../services/settings.js";
import { aiLimiter } from "../middleware/rateLimit.js";
import { answerPlatformQuestion } from "../services/platformAssistant.js";

const router = Router();

router.get(
  "/settings",
  asyncHandler(async (_req, res) => {
    const settings = await getPublicSettings();
    return res.json({ settings });
  })
);

router.post(
  "/assistant/chat",
  aiLimiter,
  asyncHandler(async (req, res) => {
    const answer = await answerPlatformQuestion({
      message: req.body?.message,
      history: req.body?.history,
    });
    return res.json({ success: true, answer });
  })
);

export default router;
