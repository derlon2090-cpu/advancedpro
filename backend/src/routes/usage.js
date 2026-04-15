import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";
import {
  consumeActivationCodeUsage,
  getUserActivationCode,
} from "../services/activationCodes.js";

const router = Router();

router.use(requireAuth);

router.post(
  "/image",
  asyncHandler(async (req, res) => {
    const accessCode = await consumeActivationCodeUsage({
      userId: req.user.id,
      type: "image",
      promptText: String(req.body.promptText || "").trim() || null,
      outputUrl: String(req.body.outputUrl || "").trim() || null,
    });

    return res.json({
      message: "تم خصم صورة من الرصيد بنجاح.",
      accessCode,
    });
  })
);

router.post(
  "/video",
  asyncHandler(async (req, res) => {
    const accessCode = await consumeActivationCodeUsage({
      userId: req.user.id,
      type: "video",
      promptText: String(req.body.promptText || "").trim() || null,
      outputUrl: String(req.body.outputUrl || "").trim() || null,
    });

    return res.json({
      message: "تم خصم فيديو من الرصيد بنجاح.",
      accessCode,
    });
  })
);

router.get(
  "/current",
  asyncHandler(async (req, res) => {
    const accessCode = await getUserActivationCode(req.user.id);
    return res.json({ accessCode });
  })
);

export default router;
