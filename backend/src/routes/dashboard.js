import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { getUserActivationCode } from "../services/activationCodes.js";

const router = Router();

router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      legacySubscription,
      accessCode,
      usageTotals,
      recentUsage,
      recentGenerations,
      totalWorks,
      totalImages,
      totalVideos,
      newWorks,
    ] = await Promise.all([
      prisma.subscription.findFirst({
        where: { userId: req.user.id },
        orderBy: { createdAt: "desc" },
        include: { code: true },
      }),
      getUserActivationCode(req.user.id),
      prisma.usageLog.groupBy({
        by: ["type"],
        where: { userId: req.user.id },
        _sum: { amountUsed: true },
      }),
      prisma.usageLog.findMany({
        where: { userId: req.user.id },
        orderBy: { createdAt: "desc" },
        take: 6,
      }),
      prisma.generation.findMany({
        where: { userId: req.user.id },
        orderBy: { createdAt: "desc" },
        take: 6,
      }),
      prisma.usageLog.count({ where: { userId: req.user.id } }),
      prisma.usageLog.count({ where: { userId: req.user.id, type: "image" } }),
      prisma.usageLog.count({ where: { userId: req.user.id, type: "video" } }),
      prisma.usageLog.count({ where: { userId: req.user.id, createdAt: { gte: weekAgo } } }),
    ]);

    const totals = usageTotals.reduce(
      (acc, item) => {
        if (item.type === "image") {
          acc.imagesUsed += item._sum.amountUsed || 0;
        }
        if (item.type === "video") {
          acc.videosUsed += item._sum.amountUsed || 0;
        }
        return acc;
      },
      { imagesUsed: 0, videosUsed: 0 }
    );

    const subscription = accessCode
      ? {
          packageName: accessCode.ownerName || `كود ${accessCode.code}`,
          code: accessCode.code,
          status: accessCode.statusKey === "expired" ? "expired" : "active",
          imageBalance: accessCode.imageAvailable,
          videoBalance: accessCode.videoAvailable,
          videoMaxDurationSeconds: 60,
          startAt: accessCode.activatedAt || accessCode.createdAt,
          endAt: accessCode.expiresAt,
          imageLimit: accessCode.imageLimit,
          videoLimit: accessCode.videoLimit,
          imageUsed: accessCode.imageUsed,
          videoUsed: accessCode.videoUsed,
          isRenewable: accessCode.isRenewable,
          renewalType: accessCode.renewalType,
          renewalLabel: accessCode.renewalLabel,
          email: accessCode.email,
          ownerName: accessCode.ownerName,
          accessTypeLabel: accessCode.accessTypeLabel,
        }
      : legacySubscription
        ? {
            packageName: legacySubscription.packageName,
            code: legacySubscription.code?.code || null,
            status: legacySubscription.status,
            imageBalance: legacySubscription.imageBalance,
            videoBalance: legacySubscription.videoBalance,
            videoMaxDurationSeconds: legacySubscription.videoMaxDurationSeconds,
            startAt: legacySubscription.startAt,
            endAt: legacySubscription.endAt,
            imageLimit: legacySubscription.imageBalance,
            videoLimit: legacySubscription.videoBalance,
            imageUsed: 0,
            videoUsed: 0,
            isRenewable: legacySubscription.renewalEnabled,
            renewalType: legacySubscription.renewalEveryDays
              ? `${legacySubscription.renewalEveryDays} يوم`
              : null,
            renewalLabel: legacySubscription.renewalEnabled ? "متجدد" : "غير متجدد",
            email: null,
            ownerName: legacySubscription.packageName,
            accessTypeLabel: "اشتراك",
          }
        : null;

    return res.json({
      dashboard: {
        user: {
          id: req.user.id,
          fullName: req.user.fullName,
          email: req.user.email,
        },
        subscription,
        accessCode,
        usageTotals: totals,
        stats: {
          totalWorks,
          totalImages,
          totalVideos,
          newWorks,
        },
        recentUsage,
        recentWorks: recentGenerations,
      },
    });
  })
);

export default router;
