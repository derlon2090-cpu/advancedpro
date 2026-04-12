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

    const usageTotals = await prisma.usageLog.groupBy({
      by: ["type"],
      where: { userId: req.user.id },
      _sum: { amountUsed: true },
    });

    const recentUsage = await prisma.usageLog.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: "desc" },
      take: 6,
    });

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
              code: subscription.codeId ? String(subscription.codeId) : null,
              imageBalance: subscription.imageBalance,
              videoBalance: subscription.videoBalance,
              videoMaxDurationSeconds: subscription.videoMaxDurationSeconds,
              endAt: subscription.endAt,
            }
          : null,
        usageTotals: totals,
        recentUsage,
      },
    });
  })
);

export default router;
