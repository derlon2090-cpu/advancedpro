import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.post(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const codeValue = String(req.body.code || "").trim();

    if (!codeValue) {
      return res.status(400).json({ message: "أدخل كود التفعيل أولًا." });
    }

    const code = await prisma.code.findUnique({ where: { code: codeValue } });

    if (!code || !code.isActive) {
      return res.status(400).json({ message: "الكود غير صالح أو غير نشط." });
    }

    if (code.redeemedCount >= code.maxRedemptions) {
      return res.status(400).json({ message: "تم استخدام الكود من قبل." });
    }

    if (code.assignedEmail && code.assignedEmail !== req.user.email) {
      return res.status(400).json({ message: "هذا الكود مخصص لحساب آخر، يرجى التواصل مع الدعم." });
    }

    const startAt = new Date();
    const endAt = new Date(startAt);
    endAt.setDate(endAt.getDate() + (code.validityDays || 30));

    const subscription = await prisma.subscription.create({
      data: {
        userId: req.user.id,
        codeId: code.id,
        packageName: code.planName,
        imageBalance: code.imageQuota,
        videoBalance: code.videoQuota,
        videoMaxDurationSeconds: code.videoMaxDurationSeconds,
        startAt,
        endAt,
        renewalEnabled: code.renewalEnabled,
        renewalEveryDays: code.renewalEveryDays,
        renewalMode: code.renewalMode,
        renewalImageQuota: code.renewalImageQuota,
        renewalVideoQuota: code.renewalVideoQuota,
      },
    });

    await prisma.code.update({
      where: { id: code.id },
      data: { redeemedCount: { increment: 1 } },
    });

    await prisma.codeRedemption.create({
      data: {
        userId: req.user.id,
        codeId: code.id,
      },
    });

    return res.json({
      message: "تم تفعيل الكود بنجاح.",
      subscriptionId: subscription.id,
    });
  })
);

export default router;
