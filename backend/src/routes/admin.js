import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { setSetting, getSetting, getPublicSettings } from "../services/settings.js";

const router = Router();

router.use(requireAuth, requireAdmin);

router.get(
  "/summary",
  asyncHandler(async (_req, res) => {
    const [totalUsers, totalAdmins, activeSubscriptions, activeCodes, requestsLast7Days] =
      await Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: { role: "admin" } }),
        prisma.subscription.count({ where: { status: "active" } }),
        prisma.code.count({ where: { isActive: true } }),
        prisma.usageLog.count({
          where: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
        }),
      ]);

    return res.json({
      summary: {
        totalUsers,
        totalAdmins,
        activeSubscriptions,
        activeCodes,
        requestsLast7Days,
      },
    });
  })
);

router.get(
  "/users",
  asyncHandler(async (req, res) => {
    const search = String(req.query.search || "").trim();
    const where = search
      ? {
          OR: [
            { email: { contains: search, mode: "insensitive" } },
            { fullName: { contains: search, mode: "insensitive" } },
          ],
        }
      : {};

    const users = await prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        subscriptions: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    return res.json({
      users: users.map((user) => {
        const subscription = user.subscriptions[0];
        return {
          id: user.id,
          fullName: user.fullName,
          email: user.email,
          status: user.status,
          role: user.role,
          currentPackage: subscription?.packageName || null,
          subscriptionEndAt: subscription?.endAt || null,
        };
      }),
    });
  })
);

router.patch(
  "/users",
  asyncHandler(async (req, res) => {
    const id = Number(req.body.id);
    const status = String(req.body.status || "active");
    const role = String(req.body.role || "user");

    await prisma.user.update({
      where: { id },
      data: { status, role },
    });

    return res.json({ message: "تم تحديث المستخدم." });
  })
);

router.get(
  "/codes",
  asyncHandler(async (req, res) => {
    const search = String(req.query.search || "").trim();
    const where = search
      ? {
          OR: [
            { code: { contains: search, mode: "insensitive" } },
            { planName: { contains: search, mode: "insensitive" } },
            { assignedEmail: { contains: search, mode: "insensitive" } },
          ],
        }
      : {};

    const codes = await prisma.code.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    return res.json({ codes });
  })
);

router.post(
  "/codes",
  asyncHandler(async (req, res) => {
    const payload = req.body;

    await prisma.code.create({
      data: {
        code: payload.code,
        planName: payload.planName,
        imageQuota: Number(payload.imageQuota || 0),
        videoQuota: Number(payload.videoQuota || 0),
        videoMaxDurationSeconds: Number(payload.videoMaxDurationSeconds || 60),
        validityDays: Number(payload.validityDays || 30),
        renewalEnabled: Boolean(payload.renewalEnabled),
        renewalEveryDays: payload.renewalEveryDays ? Number(payload.renewalEveryDays) : null,
        renewalMode: payload.renewalMode || "topup",
        renewalImageQuota: Number(payload.renewalImageQuota || 0),
        renewalVideoQuota: Number(payload.renewalVideoQuota || 0),
        maxRedemptions: Number(payload.maxRedemptions || 1),
        isActive: Boolean(payload.isActive),
        assignedEmail: payload.assignedEmail || null,
      },
    });

    return res.json({ message: "تم إنشاء الكود." });
  })
);

router.patch(
  "/codes",
  asyncHandler(async (req, res) => {
    const payload = req.body;
    const id = Number(payload.id);

    await prisma.code.update({
      where: { id },
      data: {
        code: payload.code,
        planName: payload.planName,
        imageQuota: Number(payload.imageQuota || 0),
        videoQuota: Number(payload.videoQuota || 0),
        videoMaxDurationSeconds: Number(payload.videoMaxDurationSeconds || 60),
        validityDays: Number(payload.validityDays || 30),
        renewalEnabled: Boolean(payload.renewalEnabled),
        renewalEveryDays: payload.renewalEveryDays ? Number(payload.renewalEveryDays) : null,
        renewalMode: payload.renewalMode || "topup",
        renewalImageQuota: Number(payload.renewalImageQuota || 0),
        renewalVideoQuota: Number(payload.renewalVideoQuota || 0),
        maxRedemptions: Number(payload.maxRedemptions || 1),
        isActive: Boolean(payload.isActive),
        assignedEmail: payload.assignedEmail || null,
      },
    });

    return res.json({ message: "تم تحديث الكود." });
  })
);

router.get(
  "/subscriptions",
  asyncHandler(async (req, res) => {
    const search = String(req.query.search || "").trim();
    const where = search
      ? {
          OR: [
            { packageName: { contains: search, mode: "insensitive" } },
            { user: { email: { contains: search, mode: "insensitive" } } },
          ],
        }
      : {};

    const subs = await prisma.subscription.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { user: true, code: true },
    });

    return res.json({
      subscriptions: subs.map((sub) => ({
        id: sub.id,
        fullName: sub.user.fullName,
        email: sub.user.email,
        packageName: sub.packageName,
        code: sub.code?.code || null,
        imageBalance: sub.imageBalance,
        videoBalance: sub.videoBalance,
        endAt: sub.endAt,
        status: sub.status,
      })),
    });
  })
);

router.patch(
  "/subscriptions",
  asyncHandler(async (req, res) => {
    const payload = req.body;
    const id = Number(payload.id);

    await prisma.subscription.update({
      where: { id },
      data: {
        status: payload.status || "active",
        imageBalance: Number(payload.imageBalance || 0),
        videoBalance: Number(payload.videoBalance || 0),
        endAt: payload.endAt ? new Date(payload.endAt) : undefined,
      },
    });

    return res.json({ message: "تم تحديث الاشتراك." });
  })
);

router.get(
  "/settings",
  asyncHandler(async (_req, res) => {
    const settings = await getPublicSettings();
    return res.json({
      settings: {
        store_url: settings.storeUrl,
        support_whatsapp: settings.supportWhatsapp,
        support_whatsapp_message: settings.supportWhatsappMessage,
      },
    });
  })
);

router.post(
  "/settings",
  asyncHandler(async (req, res) => {
    const storeUrl = req.body.storeUrl || (await getSetting("store_url", ""));
    const supportWhatsapp =
      req.body.supportWhatsapp || (await getSetting("support_whatsapp", ""));
    const supportWhatsappMessage =
      req.body.supportWhatsappMessage || (await getSetting("support_whatsapp_message", ""));

    await setSetting("store_url", storeUrl);
    await setSetting("support_whatsapp", supportWhatsapp);
    await setSetting("support_whatsapp_message", supportWhatsappMessage);

    return res.json({ message: "تم تحديث الإعدادات." });
  })
);

export default router;
