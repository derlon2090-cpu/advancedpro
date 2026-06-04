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

router.post(
  "/activate",
  asyncHandler(async (req, res) => {
    const codeValue = String(req.body.code || "").trim();
    const accessCode = await activateAdminCodeAsKeySession({ codeValue });
    setKeySessionCookie(res, accessCode.id);

    return res.json({
      success: true,
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
