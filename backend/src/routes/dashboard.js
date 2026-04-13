import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      subscription,
      usageTotals,
      recentUsage,
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
      prisma.usageLog.count({ where: { userId: req.user.id } }),
      prisma.usageLog.count({ where: { userId: req.user.id, type: "image" } }),
      prisma.usageLog.count({ where: { userId: req.user.id, type: "video" } }),
      prisma.usageLog.count({ where: { userId: req.user.id, createdAt: { gte: weekAgo } } }),
    ]);

    const totals = usageTotals.reduce(
      (acc, item) => {
        if (item.type === "image") acc.imagesUsed += item._sum.amountUsed || 0;
        if (item.type === "video") acc.videosUsed += item._sum.amountUsed || 0;
        return acc;
      },
      { imagesUsed: 0, videosUsed: 0 }
    );

    return res.json({
      dashboard: {
        user: {
          id: req.user.id,
          fullName: req.user.fullName,
          email: req.user.email,
        },
        subscription: subscription
          ? {
              packageName: subscription.packageName,
              code: subscription.code?.code || null,
              status: subscription.status,
              imageBalance: subscription.imageBalance,
              videoBalance: subscription.videoBalance,
              videoMaxDurationSeconds: subscription.videoMaxDurationSeconds,
              endAt: subscription.endAt,
            }
          : null,
        usageTotals: totals,
        stats: {
          totalWorks,
          totalImages,
          totalVideos,
          newWorks,
        },
        recentUsage,
      },
    });
  })
);

export default router;
