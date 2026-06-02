import { Router } from "express";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { asyncHandler } from "../utils/asyncHandler.js";
import { prisma } from "../lib/prisma.js";
import { setSetting, getSetting, getPublicSettings } from "../services/settings.js";
import { withDbRetry } from "../utils/dbRetry.js";
import { calculateDefaultKeyCredits } from "../utils/credits.js";
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

const createPlanSchema = z.object({
  name: z.string().trim().min(2, "أدخل اسم الباقة."),
  description: z.string().trim().max(220).optional().default(""),
  imagesLimit: z.coerce.number().int().min(0, "حد الصور غير صالح."),
  videosLimit: z.coerce.number().int().min(0, "حد الفيديوهات غير صالح."),
  validityDays: z.coerce.number().int().min(1, "مدة الصلاحية يجب أن تكون يومًا واحدًا على الأقل."),
  price: z.coerce.number().min(0, "السعر غير صالح."),
  isActive: z.boolean().optional().default(true),
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

  const notes = String(code.notes || "");

  if (notes.includes("manualActive:true") || code.activatedAt || code.activatedByUserId || code.isUsed) {
    return { key: "active", label: "نشط" };
  }

  if (notes.includes("approved:true")) {
    return { key: "approved", label: "معتمد" };
  }

  return { key: "unused", label: "غير مستخدم" };
}

const DEFAULT_KEY_PLANS = [
  {
    id: "starter",
    name: "انطلاقة",
    description: "بداية سهلة للمستخدمين الجدد",
    imagesLimit: 5,
    videosLimit: 5,
    validityDays: 30,
    price: 59,
    isActive: true,
  },
  {
    id: "creator",
    name: "إبداع",
    description: "للمبدعين والمحترفين",
    imagesLimit: 25,
    videosLimit: 15,
    validityDays: 90,
    price: 149,
    isActive: true,
  },
  {
    id: "pro",
    name: "تميز",
    description: "الأفضل لأصحاب الأعمال",
    imagesLimit: 100,
    videosLimit: 50,
    validityDays: 180,
    price: 299,
    isActive: true,
  },
  {
    id: "business",
    name: "احترافية",
    description: "للاستخدام المكثف والفرق",
    imagesLimit: 600,
    videosLimit: 200,
    validityDays: 365,
    price: 699,
    isActive: true,
  },
];

function generateKeyCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const part = () =>
    Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");

  return `APRO-${part()}-${part()}-${part()}`;
}

async function generateUniqueKeyCode() {
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const code = generateKeyCode();
    const existing = await prisma.activationCode.findUnique({ where: { code } });
    if (!existing) return code;
  }

  const error = new Error("تعذر توليد مفتاح فريد. حاول مرة أخرى.");
  error.statusCode = 500;
  throw error;
}

function serializeKeyPlan(plan) {
  return {
    id: plan.id,
    name: plan.name,
    description: plan.description || "باقة مرنة لإدارة رصيد الصور والفيديوهات",
    imagesLimit: Number(plan.imagesLimit ?? plan.imageQuota ?? 0),
    videosLimit: Number(plan.videosLimit ?? plan.videoQuota ?? 0),
    validityDays: Number(plan.validityDays || 30),
    price: Number(plan.price || 0),
    isActive: plan.isActive !== false,
    createdAt: plan.createdAt || null,
    updatedAt: plan.updatedAt || null,
  };
}

async function ensureAdminPlansTable() {
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Plan"
      ADD COLUMN IF NOT EXISTS "description" TEXT
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "Plan"
      ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true
    `);
  } catch (error) {
    console.error("ADMIN_PLANS_ENSURE_ERROR", error);
  }
}

async function getAdminPlans() {
  try {
    await ensureAdminPlansTable();
    const plans = await prisma.plan.findMany({
      orderBy: { id: "asc" },
    });

    if (plans.length) {
      return plans.map((plan) => serializeKeyPlan(plan));
    }
  } catch (error) {
    console.error("ADMIN_PLANS_FALLBACK_ERROR", error);
  }

  return DEFAULT_KEY_PLANS;
}

async function resolveAdminPlan(planId) {
  const plans = await getAdminPlans();
  const normalized = String(planId || "").trim();
  const plan = plans.find((item) => String(item.id) === normalized);
  if (!plan) {
    const error = new Error("اختر باقة صالحة.");
    error.statusCode = 400;
    throw error;
  }
  return plan;
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

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  const realIp = req.headers["x-real-ip"];
  const firstForwarded = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return String(firstForwarded || realIp || req.ip || "unknown").split(",")[0].trim() || "unknown";
}

async function getActivityRows() {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS activity_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        user_type VARCHAR(32),
        action VARCHAR(80) NOT NULL,
        module VARCHAR(80) NOT NULL,
        description TEXT,
        status VARCHAR(32) NOT NULL DEFAULT 'success',
        ip_address VARCHAR(96),
        user_agent TEXT,
        browser VARCHAR(120),
        os VARCHAR(120),
        route TEXT,
        metadata JSONB,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    return prisma.$queryRawUnsafe(`
      SELECT id, user_id, user_type, action, module, description, status, ip_address,
             user_agent, browser, os, route, metadata, created_at
      FROM activity_logs
      ORDER BY created_at DESC
      LIMIT 500
    `);
  } catch (error) {
    console.error("ADMIN_ACTIVITY_LOGS_ERROR", error);
    return [];
  }
}

function serializeActivityRow(row) {
  return {
    id: row.id,
    userId: row.user_id || null,
    userType: row.user_type || "admin",
    userName: row.user_name || "النظام",
    userEmail: row.user_email || null,
    action: row.action,
    module: row.module,
    description: row.description || "تم تنفيذ العملية داخل النظام.",
    details: row.description || "تم تنفيذ العملية داخل النظام.",
    status: row.status || "success",
    ipAddress: row.ip_address || "unknown",
    userAgent: row.user_agent || "unknown",
    browser: row.browser || "غير معروف",
    os: row.os || "غير معروف",
    route: row.route || "/admin/dashboard",
    metadata: row.metadata || {},
    createdAt: row.created_at || row.createdAt,
  };
}

function synthesizeActivity({ codes, projects, req }) {
  const adminName = req.admin?.fullName || req.admin?.email || "الأدمن";
  const adminEmail = req.admin?.email || "admin@advancedpro.com";
  const ip = getClientIp(req);
  const keyActivities = codes.slice(0, 30).map((code) => ({
    id: `key-${code.id}`,
    userId: req.admin?.id || null,
    userType: "admin",
    userName: adminName,
    userEmail: adminEmail,
    action: code.activatedAt ? "key-activated" : "key-created",
    module: "keys",
    description: code.activatedAt ? `تم تفعيل مفتاح ${code.code}` : `تم إنشاء مفتاح ${code.code}`,
    details: `${code.code} - ${code.ownerName || code.email || "بدون عميل"}`,
    status: code.isActive ? "success" : "warning",
    ipAddress: ip,
    userAgent: req.headers["user-agent"] || "unknown",
    browser: "غير معروف",
    os: "غير معروف",
    route: code.activatedAt ? "/admin/keys" : "/admin/keys/create",
    metadata: { codeId: code.id, code: code.code },
    createdAt: code.activatedAt || code.createdAt,
  }));

  const projectActivities = projects.slice(0, 30).map((project) => ({
    id: `project-${project.id}`,
    userId: req.admin?.id || null,
    userType: "admin",
    userName: "النظام",
    userEmail: adminEmail,
    action: project.type === "video" ? "video-created" : "image-created",
    module: "projects",
    description: project.type === "video" ? `تم إنشاء فيديو #${project.id}` : `تم إنشاء صورة #${project.id}`,
    details: `مشروع #${project.id}`,
    status: project.status === "failed" ? "failed" : "success",
    ipAddress: ip,
    userAgent: req.headers["user-agent"] || "unknown",
    browser: "غير معروف",
    os: "غير معروف",
    route: "/dashboard",
    metadata: { projectId: project.id },
    createdAt: project.created_at || project.createdAt,
  }));

  return [...keyActivities, ...projectActivities]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 100);
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

router.get(
  "/activity",
  asyncHandler(async (req, res) => {
    await ensureActivationCodesTable();

    const [activityRows, codes, projects] = await Promise.all([
      getActivityRows(),
      prisma.activationCode.findMany({
        orderBy: { createdAt: "desc" },
        take: 200,
      }),
      getProjectRows(),
    ]);

    const activities = activityRows.length
      ? activityRows.map(serializeActivityRow)
      : synthesizeActivity({ codes, projects, req });

    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;

    return res.json({
      activities,
      summary: {
        totalEvents: activities.length,
        todayEvents: activities.filter((item) => now - new Date(item.createdAt).getTime() <= day).length,
        last7DaysEvents: activities.filter((item) => now - new Date(item.createdAt).getTime() <= 7 * day).length,
        last30DaysEvents: activities.filter((item) => now - new Date(item.createdAt).getTime() <= 30 * day).length,
        activeUsers: new Set(activities.map((item) => item.userName || item.userEmail || item.userId)).size,
      },
    });
  })
);

router.get(
  "/plans",
  asyncHandler(async (_req, res) => {
    const plans = await getAdminPlans();
    return res.json({ plans });
  })
);

router.post(
  "/plans",
  asyncHandler(async (req, res) => {
    await ensureAdminPlansTable();
    const values = createPlanSchema.parse(req.body || {});

    const existing = await prisma.plan.findFirst({
      where: { name: { equals: values.name, mode: "insensitive" } },
    });

    if (existing) {
      return res.status(409).json({ message: "هذه الباقة موجودة مسبقًا." });
    }

    const plan = await prisma.plan.create({
      data: {
        name: values.name,
        description: values.description || null,
        imageQuota: values.imagesLimit,
        videoQuota: values.videosLimit,
        videoMaxDurationSeconds: 60,
        validityDays: values.validityDays,
        price: values.price,
        isActive: values.isActive,
      },
    });

    return res.status(201).json({
      message: "تم حفظ الباقة بنجاح.",
      plan: serializeKeyPlan(plan),
    });
  })
);

router.get(
  "/keys",
  asyncHandler(async (req, res) => {
    await ensureActivationCodesTable();
    const search = String(req.query.search || "").trim();
    const codes = await listActivationCodes({ search });
    const now = new Date();
    const keyIds = codes.map((code) => Number(code.id)).filter(Number.isFinite);
    let lastUsageByKey = new Map();

    if (keyIds.length) {
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

      const usageRows = await prisma.$queryRaw`
        SELECT DISTINCT ON (key_id) key_id, type, created_at
        FROM projects
        WHERE key_id IN (${Prisma.join(keyIds)})
        ORDER BY key_id, created_at DESC
      `;
      lastUsageByKey = new Map(usageRows.map((row) => [Number(row.key_id), row]));
    }

    const items = codes.map((code) => {
      const status =
        code.statusKey === "expired"
          ? { key: "expired", label: "منتهي" }
          : getAdminKeyStatus(code, now);

      return {
        id: code.id,
        code: code.code,
        customerName: code.ownerName || "عميل غير محدد",
        customerEmail: code.email || "",
        planName: classifyPlanName({
          imageLimit: code.imageLimit,
          videoLimit: code.videoLimit,
        }),
        imagesLimit: code.imageLimit,
        videosLimit: code.videoLimit,
        imagesUsed: code.imageUsed,
        videosUsed: code.videoUsed,
        imagesRemaining: code.imageAvailable,
        videosRemaining: code.videoAvailable,
        isActive: code.isActive,
        lastUsage: lastUsageByKey.get(Number(code.id))?.created_at || null,
        lastUsageType: lastUsageByKey.get(Number(code.id))?.type || null,
        createdAt: code.createdAt,
        startsAt: code.startsAt || code.activatedAt || code.createdAt,
        expiresAt: code.expiresAt,
        status: status.key,
        statusLabel: status.label,
        expired: code.expiresAt ? new Date(code.expiresAt).getTime() < now.getTime() : false,
      };
    });

    const summary = {
      total: items.length,
      active: items.filter((item) => item.status === "active").length,
      unused: items.filter((item) => item.status === "unused").length,
      expired: items.filter((item) => item.status === "expired").length,
    };

    return res.json({ keys: items, summary });
  })
);

router.post(
  "/keys",
  asyncHandler(async (req, res) => {
    await ensureActivationCodesTable();

    const customerName = String(req.body.customerName || "").trim();
    const customerEmail = String(req.body.customerEmail || "").trim().toLowerCase();
    const planId = String(req.body.planId || "").trim();
    const validityMode = String(req.body.validityMode || "plan").trim();

    if (!customerName) {
      return res.status(400).json({ message: "أدخل اسم العميل." });
    }

    if (customerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
      return res.status(400).json({ message: "البريد الإلكتروني غير صالح." });
    }

    if (!planId) {
      return res.status(400).json({ message: "اختر الباقة." });
    }

    const plan = await resolveAdminPlan(planId);
    let startsAt;
    let expiresAt;

    if (validityMode === "custom") {
      startsAt = req.body.startsAt ? new Date(req.body.startsAt) : null;
      expiresAt = req.body.expiresAt ? new Date(req.body.expiresAt) : null;

      if (!startsAt || !expiresAt || Number.isNaN(startsAt.getTime()) || Number.isNaN(expiresAt.getTime())) {
        return res.status(400).json({ message: "حدد تاريخ البداية والانتهاء." });
      }

      if (expiresAt.getTime() <= startsAt.getTime()) {
        return res.status(400).json({ message: "تاريخ الانتهاء يجب أن يكون بعد تاريخ البداية." });
      }
    } else {
      startsAt = new Date();
      expiresAt = new Date(startsAt);
      expiresAt.setDate(startsAt.getDate() + Number(plan.validityDays || 30));
    }

    let code = String(req.body.code || "").trim().toUpperCase();
    const manualCodeEnabled = Boolean(req.body.manualCodeEnabled);
    if (manualCodeEnabled) {
      if (!/^APRO-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(code)) {
        return res.status(400).json({
          message: "صيغة المفتاح غير صحيحة. استخدم APRO-XXXX-XXXX-XXXX.",
        });
      }
      const existing = await prisma.activationCode.findUnique({ where: { code } });
      if (existing) {
        return res.status(409).json({ message: "هذا المفتاح موجود مسبقًا." });
      }
    } else {
      code = await generateUniqueKeyCode();
    }

    const created = await prisma.activationCode.create({
      data: {
        code,
        email: customerEmail || null,
        ownerName: customerName,
        imageLimit: Number(plan.imagesLimit || 0),
        videoLimit: Number(plan.videosLimit || 0),
        imageUsed: 0,
        videoUsed: 0,
        balance: calculateDefaultKeyCredits({
          imageLimit: Number(plan.imagesLimit || 0),
          videoLimit: Number(plan.videosLimit || 0),
        }),
        isActive: true,
        isUsed: false,
        isRenewable: false,
        renewalType: null,
        startsAt,
        expiresAt,
        activatedAt: null,
        notes: `plan:${plan.name};price:${plan.price};createdByAdminId:${req.admin?.id || ""}`,
      },
    });

    return res.status(201).json({
      message: "تم إنشاء المفتاح بنجاح",
      key: {
        id: created.id,
        code: created.code,
        customerName,
        customerEmail: customerEmail || null,
        planName: plan.name,
        imagesLimit: created.imageLimit,
        videosLimit: created.videoLimit,
        imagesUsed: 0,
        videosUsed: 0,
        status: "unused",
        startsAt,
        expiresAt,
      },
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
