import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { fetchWaveSpeedModels } from "../services/wavespeedService.js";

const router = Router();

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

export default router;
