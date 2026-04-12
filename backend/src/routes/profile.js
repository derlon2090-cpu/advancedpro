import bcrypt from "bcryptjs";
import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const subscription = await prisma.subscription.findFirst({
      where: { userId: req.user.id },
      orderBy: { createdAt: "desc" },
    });

    const recentUsage = await prisma.usageLog.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: "desc" },
      take: 6,
    });

    return res.json({
      profile: {
        user: {
          id: req.user.id,
          fullName: req.user.fullName,
          email: req.user.email,
          status: req.user.status,
          createdAt: req.user.createdAt,
        },
        subscription: subscription || null,
        recentUsage,
      },
    });
  })
);

router.patch(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const fullName = String(req.body.fullName || "").trim();

    if (fullName.length < 2) {
      return res.status(400).json({ message: "أدخل اسمًا واضحًا لا يقل عن حرفين." });
    }

    await prisma.user.update({
      where: { id: req.user.id },
      data: { fullName },
    });

    return res.json({ message: "تم تحديث الملف الشخصي." });
  })
);

router.post(
  "/password",
  requireAuth,
  asyncHandler(async (req, res) => {
    const currentPassword = String(req.body.currentPassword || "");
    const newPassword = String(req.body.newPassword || "");

    if (!currentPassword || newPassword.length < 8) {
      return res.status(400).json({ message: "تأكد من كلمة المرور الجديدة." });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);

    if (!isValid) {
      return res.status(400).json({ message: "كلمة المرور الحالية غير صحيحة." });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: req.user.id },
      data: { passwordHash },
    });

    return res.json({ message: "تم تحديث كلمة المرور." });
  })
);

export default router;
