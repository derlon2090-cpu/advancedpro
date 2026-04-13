import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { signToken } from "../utils/jwt.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";
import { activateCodeForUser } from "../services/codeActivation.js";

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
    return res.json({ message: "تم استقبال طلب الاستعادة وسيتم التواصل معك." });
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
