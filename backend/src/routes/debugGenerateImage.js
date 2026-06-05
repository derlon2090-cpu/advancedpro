import { Router } from "express";
import { debugGenerateFixedFluxImage } from "../services/fluxService.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

router.post(
  "/",
  asyncHandler(async (_req, res) => {
    const result = await debugGenerateFixedFluxImage();

    return res.json({
      success: true,
      message: "تم تنفيذ اختبار BFL المباشر.",
      prompt: result.prompt,
      provider: result.provider,
      model: result.model,
      resultUrl: result.resultUrl,
    });
  })
);

export default router;
