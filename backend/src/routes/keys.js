import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  activateAdminCodeAsKeySession,
  buildActivationSuccessMessage,
} from "../services/activationCodes.js";

const router = Router();

function setKeySessionCookie(res, keyId) {
  const cookieSecure = process.env.COOKIE_SECURE === "true";
  res.cookie("key_session", String(keyId), {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSecure,
    path: "/",
    maxAge: 1000 * 60 * 60 * 24 * 30,
  });
}

function getActivationErrorCode(error) {
  const status = Number(error?.statusCode || error?.status || 500);
  const message = String(error?.message || "").toLowerCase();

  if (status === 404 || message.includes("غير صحيح") || message.includes("invalid")) {
    return "INVALID_KEY";
  }

  if (status === 410 || message.includes("انتهت") || message.includes("expired")) {
    return "EXPIRED_KEY";
  }

  if (status === 403 || message.includes("غير متاح") || message.includes("موقوف") || message.includes("disabled")) {
    return "DISABLED_KEY";
  }

  if (message.includes("استخدام") || message.includes("used")) {
    return "USED_KEY";
  }

  return "SERVER_ERROR";
}

router.post(
  "/activate",
  asyncHandler(async (req, res) => {
    const codeValue = String(req.body.code || "").trim();
    let accessCode = null;

    try {
      accessCode = await activateAdminCodeAsKeySession({ codeValue });
    } catch (error) {
      const code = getActivationErrorCode(error);
      return res.status(error?.statusCode || 500).json({
        success: false,
        code,
        message: error?.message || "تعذر إتمام العملية حالياً.",
      });
    }

    setKeySessionCookie(res, accessCode.id);

    return res.json({
      success: true,
      code: "SUCCESS",
      message: buildActivationSuccessMessage(accessCode),
      accessCode,
      codeInfo: accessCode,
      redirectTo: "/dashboard",
    });
  })
);

router.post("/logout", (_req, res) => {
  const cookieSecure = process.env.COOKIE_SECURE === "true";
  res.clearCookie("key_session", {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSecure,
    path: "/",
  });
  return res.json({ success: true });
});

export default router;
