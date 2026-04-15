import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";
import {
  activateAdminCodeForUser,
  buildActivationSuccessMessage,
} from "../services/activationCodes.js";
import { activateCodeForUser as activateLegacyCodeForUser } from "../services/codeActivation.js";

const router = Router();

async function handleActivation(req, res) {
  const codeValue = String(req.body.code || "").trim();

  if (!codeValue) {
    return res.status(400).json({ message: "أدخل كود التفعيل أولًا." });
  }

  let accessCode = null;

  try {
    accessCode = await activateAdminCodeForUser({
      userId: req.user.id,
      email: req.user.email,
      codeValue,
    });
  } catch (error) {
    if (
      error?.statusCode &&
      [
        "الكود الخاص بك غير صحيح أو غير فعال",
        "هذا الكود غير مخصص لهذا الحساب",
        "أدخل كود التفعيل أولًا.",
      ].includes(error.message)
    ) {
      throw error;
    }
  }

  if (accessCode) {
    return res.json({
      message: buildActivationSuccessMessage(accessCode),
      accessCode,
      subscriptionId: accessCode.subscriptionId || null,
    });
  }

  const subscription = await activateLegacyCodeForUser({
    userId: req.user.id,
    email: req.user.email,
    codeValue,
  });

  return res.json({
    message: "تم تفعيل الكود بنجاح.",
    subscriptionId: subscription.id,
  });
}

router.post(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => handleActivation(req, res))
);

router.post(
  "/activate",
  requireAuth,
  asyncHandler(async (req, res) => handleActivation(req, res))
);

export default router;
