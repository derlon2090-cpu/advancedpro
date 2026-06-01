import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { signToken } from "../utils/jwt.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";
import { activateCodeForUser } from "../services/codeActivation.js";
import { sendResetCodeEmail } from "../utils/email.js";

const TRIAL_PACKAGE_NAME = "تجربة مجانية";
const TRIAL_DAYS = Number(process.env.TRIAL_DAYS || 7);

const router = Router();

const registerSchema = z.object({
  fullName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const forgotSchema = z.object({
  email: z.string().email(),
});

const resetSchema = z.object({
  email: z.string().email(),
  code: z.string().min(6),
  password: z.string().min(8),
});

function validatePasswordRules(password) {
  if (password.length < 8) {
    return "كلمة المرور يجب أن تكون 8 أحرف على الأقل.";
  }
  if (!/[A-Z]/.test(password)) {
    return "أضف حرفًا كبيرًا واحدًا على الأقل داخل كلمة المرور.";
  }
  if (!/\d/.test(password)) {
    return "أضف رقمًا واحدًا على الأقل داخل كلمة المرور.";
  }
  return "";
}

router.post(
  "/register",
  asyncHandler(async (req, res) => {
    const values = registerSchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { email: values.email } });

    if (existing) {
      return res.status(400).json({
        message: "هذا البريد مسجل مسبقًا، يرجى تسجيل الدخول بدلًا من إنشاء حساب جديد",
      });
    }

    const passwordHash = await bcrypt.hash(values.password, 10);
    const user = await prisma.user.create({
      data: {
        fullName: values.fullName,
        email: values.email,
        passwordHash,
      },
    });

    const trialStart = new Date();
    const trialEnd = new Date(trialStart);
    trialEnd.setDate(trialEnd.getDate() + TRIAL_DAYS);

    await prisma.subscription.create({
      data: {
        userId: user.id,
        packageName: TRIAL_PACKAGE_NAME,
        imageBalance: 1,
        videoBalance: 1,
        videoMaxDurationSeconds: 60,
        startAt: trialStart,
        endAt: trialEnd,
        status: "active",
      },
    });

    await activateCodeForUser({ userId: user.id, email: user.email, silent: true });

    const token = signToken({ id: user.id, email: user.email });
    const cookieSecure = process.env.COOKIE_SECURE === "true";
    res.cookie("token", token, {
      httpOnly: true,
      sameSite: "none",
      secure: cookieSecure,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.json({
      message: "تم إنشاء الحساب بنجاح 🎉",
      token,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
      },
      redirectTo: user.role === "admin" ? "/admin" : "/student.html",
    });
  })
);

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const values = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: values.email } });

    if (!user) {
      return res.status(400).json({ message: "البريد أو كلمة المرور غير صحيحة" });
    }

    const isValid = await bcrypt.compare(values.password, user.passwordHash);
    if (!isValid) {
      return res.status(400).json({ message: "البريد أو كلمة المرور غير صحيحة" });
    }

    if (user.status !== "active") {
      return res.status(403).json({ message: "الحساب غير نشط." });
    }

    if (["admin", "owner"].includes(user.role)) {
      return res.status(403).json({
        message: "استخدم رابط الأدمن المخصص للدخول.",
      });
    }

    await activateCodeForUser({ userId: user.id, email: user.email, silent: true });

    const token = signToken({ id: user.id, email: user.email });
    const cookieSecure = process.env.COOKIE_SECURE === "true";
    res.cookie("token", token, {
      httpOnly: true,
      sameSite: "none",
      secure: cookieSecure,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.json({
      message: "تم تسجيل الدخول بنجاح 🎉",
      token,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
      },
      redirectTo: user.role === "admin" ? "/admin" : "/student.html",
    });
  })
);

router.post(
  "/logout",
  asyncHandler(async (_req, res) => {
    res.clearCookie("token", {
      httpOnly: true,
      sameSite: "none",
      secure: process.env.COOKIE_SECURE === "true",
    });
    return res.json({ message: "تم تسجيل الخروج." });
  })
);

router.post(
  "/forgot-password",
  asyncHandler(async (_req, res) => {
    const { email } = forgotSchema.parse(_req.body || {});
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      return res.status(404).json({ message: "هذا البريد غير مسجل." });
    }

    const now = new Date();
    if (user.resetCodeRequestedAt) {
      const diff = now.getTime() - new Date(user.resetCodeRequestedAt).getTime();
      if (diff < 30 * 1000) {
        return res.status(429).json({ message: "انتظر قليلًا قبل طلب كود جديد." });
      }
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetCodeHash: codeHash,
        resetCodeExpiresAt: expiresAt,
        resetCodeRequestedAt: now,
      },
    });

    await sendResetCodeEmail({ to: user.email, code });

    return res.json({
      message: "تم إرسال رمز التحقق إلى بريدك الإلكتروني.",
      redirectTo: "/reset-password.html",
      email: user.email,
    });
  })
);

router.post(
  "/reset-password",
  asyncHandler(async (req, res) => {
    const values = resetSchema.parse(req.body || {});
    const user = await prisma.user.findUnique({ where: { email: values.email } });

    if (!user || !user.resetCodeHash || !user.resetCodeExpiresAt) {
      return res.status(400).json({ message: "الكود غير صحيح أو منتهي." });
    }

    if (new Date(user.resetCodeExpiresAt) < new Date()) {
      return res.status(400).json({ message: "انتهت صلاحية الكود، اطلب رمزًا جديدًا." });
    }

    const isValidCode = await bcrypt.compare(values.code, user.resetCodeHash);
    if (!isValidCode) {
      return res.status(400).json({ message: "الكود غير صحيح." });
    }

    const passwordError = validatePasswordRules(values.password);
    if (passwordError) {
      return res.status(400).json({ message: passwordError });
    }

    const newHash = await bcrypt.hash(values.password, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: newHash,
        resetCodeHash: null,
        resetCodeExpiresAt: null,
        resetCodeRequestedAt: null,
      },
    });

    return res.json({
      message: "تم تغيير كلمة المرور بنجاح.",
      redirectTo: "/login",
    });
  })
);

router.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    return res.json({
      user: {
        id: req.user.id,
        fullName: req.user.fullName,
        email: req.user.email,
        role: req.user.role,
      },
    });
  })
);

export default router;
