import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { signToken } from "../utils/jwt.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";

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
      return res.status(400).json({ message: "البريد الإلكتروني مستخدم بالفعل." });
    }

    const passwordHash = await bcrypt.hash(values.password, 10);
    const user = await prisma.user.create({
      data: {
        fullName: values.fullName,
        email: values.email,
        passwordHash,
      },
    });

    const token = signToken({ id: user.id, email: user.email });
    const cookieSecure = process.env.COOKIE_SECURE === "true";
    res.cookie("token", token, {
      httpOnly: true,
      sameSite: "none",
      secure: cookieSecure,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.json({
      message: "تم إنشاء الحساب بنجاح.",
      token,
      redirectTo: "/dashboard",
    });
  })
);

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const values = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: values.email } });

    if (!user) {
      return res.status(400).json({ message: "بيانات الدخول غير صحيحة." });
    }

    const isValid = await bcrypt.compare(values.password, user.passwordHash);
    if (!isValid) {
      return res.status(400).json({ message: "بيانات الدخول غير صحيحة." });
    }

    if (user.status !== "active") {
      return res.status(403).json({ message: "الحساب غير نشط." });
    }

    const token = signToken({ id: user.id, email: user.email });
    const cookieSecure = process.env.COOKIE_SECURE === "true";
    res.cookie("token", token, {
      httpOnly: true,
      sameSite: "none",
      secure: cookieSecure,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.json({
      message: "تم تسجيل الدخول بنجاح.",
      token,
      redirectTo: "/dashboard",
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
