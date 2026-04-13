import bcrypt from "bcryptjs";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { signToken } from "../utils/jwt.js";

const router = Router();

const bootstrapSchema = z.object({
  fullName: z.string().min(2).optional(),
  email: z.string().email().optional(),
  password: z.string().min(8).optional(),
});

function generateStrongPassword(length = 16) {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const numbers = "23456789";
  const symbols = "!@#$%^&*_-+=?";
  const all = `${upper}${lower}${numbers}${symbols}`;

  let password = "";
  password += upper[Math.floor(Math.random() * upper.length)];
  password += lower[Math.floor(Math.random() * lower.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += symbols[Math.floor(Math.random() * symbols.length)];

  for (let i = password.length; i < length; i += 1) {
    password += all[Math.floor(Math.random() * all.length)];
  }

  return password
    .split("")
    .sort(() => Math.random() - 0.5)
    .join("");
}

router.post(
  "/admin",
  asyncHandler(async (req, res) => {
    const values = bootstrapSchema.parse(req.body || {});

    const adminCount = await prisma.user.count({ where: { role: "admin" } });
    if (adminCount > 0) {
      return res.status(409).json({
        message: "تم إنشاء حساب الأدمن بالفعل. استخدم تسجيل الدخول.",
      });
    }

    const email = values.email || "admin@advancedpro.local";
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({
        message: "هذا البريد مسجل بالفعل. استخدم تسجيل الدخول.",
      });
    }

    const generatedPassword = values.password ? null : generateStrongPassword();
    const finalPassword = values.password || generatedPassword;

    const passwordHash = await bcrypt.hash(finalPassword, 10);
    const user = await prisma.user.create({
      data: {
        fullName: values.fullName || "Admin",
        email,
        passwordHash,
        role: "admin",
        status: "active",
      },
    });

    const token = signToken({ id: user.id, email: user.email });

    return res.json({
      message: "تم إنشاء حساب الأدمن بنجاح.",
      token,
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
      },
      credentials: {
        email,
        password: generatedPassword,
      },
      redirectTo: "/admin",
    });
  })
);

export default router;
