import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";
import { activateCodeForUser } from "../services/codeActivation.js";

const router = Router();

router.post(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const codeValue = String(req.body.code || "").trim();

    if (!codeValue) {
      return res.status(400).json({ message: "أدخل كود التفعيل أولًا." });
    }

    const subscription = await activateCodeForUser({
      userId: req.user.id,
      email: req.user.email,
      codeValue,
    });

    return res.json({
      message: "تم تفعيل الكود بنجاح.",
      subscriptionId: subscription.id,
    });
  })
);

export default router;
