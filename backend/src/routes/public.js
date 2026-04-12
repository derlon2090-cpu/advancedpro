import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { getPublicSettings } from "../services/settings.js";

const router = Router();

router.get(
  "/settings",
  asyncHandler(async (_req, res) => {
    const settings = await getPublicSettings();
    return res.json({ settings });
  })
);

export default router;
