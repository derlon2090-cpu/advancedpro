import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { asyncHandler } from "../utils/asyncHandler.js";
import { prisma } from "../lib/prisma.js";
import { setSetting, getSetting, getPublicSettings } from "../services/settings.js";
import { withDbRetry } from "../utils/dbRetry.js";
import { signToken, verifyToken } from "../utils/jwt.js";
import { upsertOwnerFromEnv } from "../services/ownerBootstrap.js";
import {
  createActivationCode,
  deleteActivationCode,
  ensureActivationCodesTable,
  listActivationCodes,
  updateActivationCode,
} from "../services/activationCodes.js";

const router = Router();

const ADMIN_SECRET_PATH = (process.env.ADMIN_SECRET_PATH || "advanced-pro-control").replace(/^\/+|\/+$/g, "");
const ADMIN_LOGIN_PATH = `/${ADMIN_SECRET_PATH}`;

function setAdminSessionCookie(res, admin) {
  const cookieSecure = process.env.COOKIE_SECURE === "true";
  const token = signToken({
    id: admin.id,
    email: admin.email,
    role: admin.role,
    scope: "admin",
  });

  res.cookie("admin_session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSecure,
    path: "/",
    maxAge: 1000 * 60 * 60 * 24 * 7,
  });

  return token;
}

function clearAdminSessionCookie(res) {
  res.clearCookie("admin_session", { path: "/" });
}

async function getAdminFromRequest(req) {
  const token = req.cookies?.admin_session;
  if (!token) {
    return null;
  }

  let payload;
  try {
    payload = verifyToken(token);
  } catch (error) {
    return null;
  }

  if (payload?.scope !== "admin") {
    return null;
  }

  const admin = await prisma.user.findFirst({
    where: {
      id: Number(payload.id),
      status: "active",
      role: { in: ["admin", "owner"] },
    },
  });

  return admin || null;
}

async function requireAdminSession(req, res, next) {
  try {
    const admin = await getAdminFromRequest(req);
    if (!admin) {
      return res.status(401).json({
        message: "جلسة الأدمن غير صالحة.",
        redirectTo: ADMIN_LOGIN_PATH,
      });
    }

    req.admin = admin;
    return next();
  } catch (error) {
    return next(error);
  }
}

const createAdminSchema = z.object({
  fullName: z.string().min(2).optional(),
  email: z.string().email(),
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

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const setupSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  passwordConfirm: z.string().min(8),
});

async function countAdmins() {
  return prisma.user.count({
    where: {
      role: { in: ["admin", "owner"] },
    },
  });
}

router.get(
  "/session",
  asyncHandler(async (req, res) => {
    const admin = await getAdminFromRequest(req);
    if (!admin) {
      return res.status(401).json({
        message: "جلسة الأدمن غير صالحة.",
        redirectTo: ADMIN_LOGIN_PATH,
      });
    }

    return res.json({
      admin: {
        id: admin.id,
        name: admin.fullName,
        email: admin.email,
        role: admin.role,
      },
      secretPath: ADMIN_SECRET_PATH,
    });
  })
);

router.post(
  "/login",
  asyncHandler(async (req, res) => {
    const values = loginSchema.parse(req.body || {});
    const ownerEmail = (process.env.OWNER_EMAIL || process.env.ADMIN_EMAIL || "")
      .trim()
      .toLowerCase();
    const ownerPassword = process.env.OWNER_PASSWORD || process.env.ADMIN_PASSWORD || "";
    let ownerBootstrapResult = null;

    try {
      ownerBootstrapResult = await upsertOwnerFromEnv(prisma, { info: () => {} });
    } catch (error) {
      console.error("OWNER_BOOTSTRAP_ON_LOGIN_ERROR", error);
    }

    const admin = await prisma.user.findFirst({
      where: {
        email: values.email.toLowerCase(),
        role: { in: ["admin", "owner"] },
        status: "active",
      },
    });

    if (!admin) {
      if (values.email.toLowerCase() === "owner@advancedpro.com" && (!ownerEmail || !ownerPassword)) {
        return res.status(503).json({
          message: "بيانات OWNER_EMAIL و OWNER_PASSWORD غير مفعلة في السيرفر.",
        });
      }
      return res.status(401).json({ message: "البريد أو كلمة المرور غير صحيحة." });
    }

    const isValid = await bcrypt.compare(values.password, admin.passwordHash);
    if (!isValid) {
      if (values.email.toLowerCase() === ownerEmail && ownerBootstrapResult?.skipped) {
        return res.status(503).json({
          message: "بيانات OWNER_EMAIL و OWNER_PASSWORD غير مفعلة في السيرفر.",
        });
      }
      return res.status(401).json({ message: "البريد أو كلمة المرور غير صحيحة." });
    }

    setAdminSessionCookie(res, admin);
    return res.json({
      success: true,
      redirectTo: "/admin/dashboard",
      admin: {
        id: admin.id,
        name: admin.fullName,
        email: admin.email,
        role: admin.role,
      },
    });
  })
);

router.post("/logout", (_req, res) => {
  clearAdminSessionCookie(res);
  return res.json({ success: true, redirectTo: ADMIN_LOGIN_PATH });
});

router.get(
  "/setup-status",
  asyncHandler(async (_req, res) => {
    const adminCount = await countAdmins();
    return res.json({
      enabled: adminCount === 0,
      loginPath: ADMIN_LOGIN_PATH,
    });
  })
);

router.post(
  "/setup",
  asyncHandler(async (req, res) => {
    const values = setupSchema.parse(req.body || {});
    if (values.password !== values.passwordConfirm) {
      return res.status(400).json({ message: "تأكيد كلمة المرور غير مطابق." });
    }

    const adminCount = await countAdmins();
    if (adminCount > 0) {
      return res.status(409).json({
        message: "صفحة الإعداد معطلة لأن حساب الأدمن موجود بالفعل.",
        redirectTo: ADMIN_LOGIN_PATH,
      });
    }

    const passwordHash = await bcrypt.hash(values.password, 10);
    const admin = await prisma.user.create({
      data: {
        fullName: values.name,
        email: values.email.toLowerCase(),
        passwordHash,
        role: "owner",
        status: "active",
      },
    });

    setAdminSessionCookie(res, admin);
    return res.json({
      success: true,
      redirectTo: "/admin/dashboard",
    });
  })
);

router.use(requireAdminSession);

router.get(
  "/summary",
  asyncHandler(async (_req, res) => {

    const [totalUsers, totalAdmins, activeSubscriptions, activeCodes, requestsLast7Days] =
      await Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: { role: "admin" } }),
        prisma.subscription.count({ where: { status: "active" } }),
        prisma.activationCode.count({ where: { isActive: true } }),
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

function startOfDay(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function formatDayKey(date) {
  return date.toISOString().slice(0, 10);
}

function classifyPlanName(code) {
  const total = Number(code.imageLimit || 0) + Number(code.videoLimit || 0);
  if (total <= 10) return "باقة انطلاقة";
  if (total <= 40) return "باقة إبداع";
  if (total <= 150) return "باقة تميز";
  return "باقة احتراف";
}

function getAdminKeyStatus(code, now = new Date()) {
  if (!code.isActive) {
    return { key: "disabled", label: "معطل" };
  }

  if (code.expiresAt && new Date(code.expiresAt).getTime() < now.getTime()) {
    return { key: "expired", label: "منتهي" };
  }

  if (code.activatedAt || code.activatedByUserId || code.isUsed) {
    return { key: "active", label: "نشط" };
  }

  return { key: "unused", label: "غير مستخدم" };
}

async function getProjectRows() {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS projects (
        id SERIAL PRIMARY KEY,
        key_id INTEGER NOT NULL,
        type VARCHAR(32) NOT NULL,
        prompt TEXT NOT NULL,
        duration INTEGER,
        quality VARCHAR(32),
        style VARCHAR(64),
        result_url TEXT,
        status VARCHAR(32) NOT NULL DEFAULT 'completed',
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    return prisma.$queryRawUnsafe(`
      SELECT id, key_id, type, status, created_at
      FROM projects
      ORDER BY created_at DESC
      LIMIT 200
    `);
  } catch (error) {
    console.error("ADMIN_PROJECT_STATS_ERROR", error);
    return [];
  }
}

router.get(
  "/stats",
  asyncHandler(async (_req, res) => {
    await ensureActivationCodesTable();

    const now = new Date();
    const sevenDaysAgo = startOfDay(new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000));

    const [codes, usageLogs, projects] = await Promise.all([
      prisma.activationCode.findMany({
        orderBy: { createdAt: "desc" },
        take: 500,
      }),
      prisma.usageLog.findMany({
        where: { createdAt: { gte: sevenDaysAgo } },
        orderBy: { createdAt: "desc" },
        take: 500,
      }),
      getProjectRows(),
    ]);

    const counters = {
      totalKeys: codes.length,
      activeKeys: 0,
      unusedKeys: 0,
      expiredKeys: 0,
      disabledKeys: 0,
      imagesUsed: 0,
      videosUsed: 0,
    };

    const planMap = new Map();
    for (const code of codes) {
      const status = getAdminKeyStatus(code, now);
      if (status.key === "active") counters.activeKeys += 1;
      if (status.key === "unused") counters.unusedKeys += 1;
      if (status.key === "expired") counters.expiredKeys += 1;
      if (status.key === "disabled") counters.disabledKeys += 1;

      counters.imagesUsed += Number(code.imageUsed || 0);
      counters.videosUsed += Number(code.videoUsed || 0);

      const planName = classifyPlanName(code);
      planMap.set(planName, (planMap.get(planName) || 0) + 1);
    }

    const usageByDay = new Map();
    for (let index = 0; index < 7; index += 1) {
      const day = new Date(sevenDaysAgo);
      day.setDate(sevenDaysAgo.getDate() + index);
      usageByDay.set(formatDayKey(day), {
        date: formatDayKey(day),
        label: day.toLocaleDateString("ar-SA", { weekday: "short" }),
        images: 0,
        videos: 0,
      });
    }

    for (const log of usageLogs) {
      const key = formatDayKey(new Date(log.createdAt));
      const bucket = usageByDay.get(key);
      if (!bucket) continue;
      if (log.type === "video") bucket.videos += Number(log.amountUsed || 1);
      else bucket.images += Number(log.amountUsed || 1);
    }

    for (const project of projects) {
      const key = formatDayKey(new Date(project.created_at || project.createdAt));
      const bucket = usageByDay.get(key);
      if (!bucket) continue;
      if (project.type === "video") bucket.videos += 1;
      if (project.type === "image") bucket.images += 1;
    }

    const totalProjects = projects.length;
    const completedProjects = projects.filter((project) => project.status !== "failed").length;
    const totalUsage = counters.imagesUsed + counters.videosUsed;
    const successRate =
      totalProjects > 0 ? Math.round((completedProjects / totalProjects) * 1000) / 10 : 100;

    const latestKeys = codes.slice(0, 6).map((code) => {
      const status = getAdminKeyStatus(code, now);
      return {
        id: code.id,
        code: code.code,
        customer: code.ownerName || code.email || "عميل غير محدد",
        email: code.email || null,
        plan: classifyPlanName(code),
        expiresAt: code.expiresAt,
        status: status.key,
        statusLabel: status.label,
      };
    });

    const recentActivity = [
      ...codes.slice(0, 5).map((code) => ({
        id: `key-${code.id}`,
        type: code.activatedAt ? "key-activated" : "key-created",
        title: code.activatedAt ? "تم تفعيل مفتاح" : "تم إنشاء مفتاح جديد",
        description: `${code.code} - ${code.ownerName || code.email || "بدون عميل"}`,
        createdAt: code.activatedAt || code.createdAt,
      })),
      ...projects.slice(0, 5).map((project) => ({
        id: `project-${project.id}`,
        type: project.type === "video" ? "video-created" : "image-created",
        title: project.type === "video" ? "تم إنشاء فيديو" : "تم إنشاء صورة",
        description: `مشروع #${project.id}`,
        createdAt: project.created_at || project.createdAt,
      })),
    ]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 8);

    return res.json({
      totalKeys: counters.totalKeys,
      activeKeys: counters.activeKeys,
      unusedKeys: counters.unusedKeys,
      expiredKeys: counters.expiredKeys,
      disabledKeys: counters.disabledKeys,
      totalUsage,
      imagesUsed: counters.imagesUsed,
      videosUsed: counters.videosUsed,
      totalProjects,
      successRate,
      averageImagesPerDay: Math.round((counters.imagesUsed / 7) * 10) / 10,
      averageVideosPerDay: Math.round((counters.videosUsed / 7) * 10) / 10,
      keysByPlan: Array.from(planMap.entries()).map(([name, value]) => ({ name, value })),
      usageLast7Days: Array.from(usageByDay.values()),
      latestKeys,
      recentActivity,
    });
  })
);

router.post(
  "/admins",
  asyncHandler(async (req, res) => {
    const values = createAdminSchema.parse(req.body || {});
    const existing = await prisma.user.findUnique({ where: { email: values.email } });

    if (existing) {
      return res.status(409).json({ message: "هذا البريد مسجل بالفعل." });
    }

    let generatedPassword = null;
    let finalPassword = values.password;
    if (!finalPassword) {
      generatedPassword = generateStrongPassword();
      finalPassword = generatedPassword;
    } else {
      const passwordError = validatePasswordRules(finalPassword);
      if (passwordError) {
        return res.status(400).json({ message: passwordError });
      }
    }

    const passwordHash = await bcrypt.hash(finalPassword, 10);
    const user = await prisma.user.create({
      data: {
        fullName: values.fullName || "Admin",
        email: values.email,
        passwordHash,
        role: "admin",
        status: "active",
      },
    });

    return res.json({
      message: "تم إنشاء الأدمن بنجاح.",
      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
      },
      credentials: {
        email: user.email,
        password: generatedPassword,
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

function mapCodeRecord(code) {
  const now = new Date();
  const subscription = code.subscriptions?.[0];
  const remaining = subscription
    ? Number(subscription.imageBalance || 0) + Number(subscription.videoBalance || 0)
    : 0;
  const expired = subscription && (new Date(subscription.endAt) < now || subscription.status !== "active");

  let statusKey = "available";
  let statusLabel = "متاح";

  if (!code.isActive) {
    statusKey = "disabled";
    statusLabel = "معطل";
  } else if (subscription) {
    if (expired) {
      statusKey = "expired";
      statusLabel = "منتهي";
    } else if (remaining <= 0) {
      statusKey = "used";
      statusLabel = "تم الاستخدام";
    } else {
      statusKey = "in-use";
      statusLabel = "قيد الاستخدام";
    }
  } else if (code.redeemedCount >= code.maxRedemptions) {
    statusKey = "used";
    statusLabel = "تم الاستخدام";
  }

  return {
    ...code,
    statusKey,
    statusLabel,
    activatedAt: subscription?.startAt || null,
    expiresAt: subscription?.endAt || null,
    activatedBy: subscription?.user?.email || null,
    remainingImages: subscription?.imageBalance ?? null,
    remainingVideos: subscription?.videoBalance ?? null,
  };
}

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
      include: {
        subscriptions: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: { user: true },
        },
      },
    });

    return res.json({ codes: codes.map(mapCodeRecord) });
  })
);

router.post(
  "/codes",
  asyncHandler(async (req, res) => {
    const payload = req.body;
    const code = String(payload.code || "").trim();
    const planName = String(payload.planName || "").trim();

    if (!code || !planName) {
      return res.status(400).json({ message: "الرجاء إدخال الكود واسم الباقة." });
    }

    const existing = await prisma.code.findUnique({ where: { code } });
    if (existing) {
      return res.status(409).json({ message: "هذا الكود موجود مسبقًا." });
    }

    let created;
    try {
      created = await prisma.code.create({
        data: {
          code,
          planName,
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
    } catch (error) {
      if (error?.code === "P2002") {
        return res.status(409).json({ message: "هذا الكود موجود مسبقًا." });
      }
      if (error?.code === "P2021") {
        return res.status(500).json({
          message: "جداول قاعدة البيانات غير موجودة. شغّل prisma db push في Render.",
        });
      }
      if (error?.code === "P1000" || error?.code === "P1001") {
        return res.status(500).json({
          message: "تعذر الاتصال بقاعدة البيانات. تحقق من DATABASE_URL.",
        });
      }
      return res.status(500).json({ message: "تعذر حفظ الكود. حاول مرة أخرى." });
    }
    const fullRecord = await prisma.code.findUnique({
      where: { id: created.id },
      include: {
        subscriptions: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: { user: true },
        },
      },
    });

    return res.json({ message: "تم إنشاء الكود.", code: mapCodeRecord(fullRecord || created) });
  })
);

router.post(
  "/codes/create",
  asyncHandler(async (req, res) => {

    const createdCode = await createActivationCode(req.body || {});
    /*

      return res.status(400).json({ success: false, message: "الرجاء إدخال الكود." });
    }

    if (Number.isNaN(balance) || balance < 0) {
      return res.status(400).json({ success: false, message: "رصيد الكود غير صالح." });
    }

    const existing = await withDbRetry(() =>
      prisma.activationCode.findUnique({ where: { code } })
    );
    if (existing) {
      return res.status(409).json({ success: false, message: "هذا الكود موجود مسبقًا." });
    }

    const newCode = await withDbRetry(() =>
      prisma.activationCode.create({
        data: {
          code,
          balance,
          isActive,
          isUsed: false,
        },
      })
    );

    */
    return res.status(201).json({
      success: true,
      message: "تم حفظ الكود بنجاح",
      code: createdCode,
    });
  })
);

router.get(
  "/codes/list",
  asyncHandler(async (req, res) => {
    const codes = await listActivationCodes({
      search: String(req.query.search || ""),
    });

    return res.json({ success: true, codes });
  })
);

router.put(
  "/codes/:id",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const code = await updateActivationCode(id, req.body || {});

    return res.json({
      success: true,
      message: "تم تحديث الكود بنجاح.",
      code,
    });
  })
);

router.delete(
  "/codes/:id",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    await deleteActivationCode(id);

    return res.json({
      success: true,
      message: "تم حذف الكود بنجاح.",
    });
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

router.delete(
  "/codes/:id",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    try {
      await prisma.code.delete({ where: { id } });
      return res.json({ message: "تم حذف الكود." });
    } catch (error) {
      return res.status(409).json({
        message: "لا يمكن حذف الكود بعد التفعيل. يمكنك تعطيله بدلاً من ذلك.",
      });
    }
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
