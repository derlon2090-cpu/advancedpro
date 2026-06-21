import cors from "cors";
import cookieParser from "cookie-parser";
import { randomUUID } from "crypto";
import express from "express";
import morgan from "morgan";
import authRoutes from "./routes/auth.js";
import publicRoutes from "./routes/public.js";
import activateRoutes from "./routes/activate.js";
import keyRoutes from "./routes/keys.js";
import dashboardRoutes from "./routes/dashboard.js";
import profileRoutes from "./routes/profile.js";
import generateRoutes from "./routes/generate.js";
import debugRoutes from "./routes/debug.js";
import aiRoutes from "./routes/ai.js";
import adminRoutes from "./routes/admin.js";
import bootstrapRoutes from "./routes/bootstrap.js";
import downloadRoutes from "./routes/download.js";
import usageRoutes from "./routes/usage.js";
import { getAuthWorkspace, requireAuth } from "./middleware/auth.js";
import { prisma } from "./lib/prisma.js";
import { apiLimiter } from "./middleware/rateLimit.js";
import { getAiKeyStatus } from "./services/aiProvider.js";
import { getActivationCodeById } from "./services/activationCodes.js";
import { ensureWorkspaceForActivationKey } from "./services/workspaces.js";
import { asyncHandler } from "./utils/asyncHandler.js";
import { logError } from "./utils/logger.js";
import { serializeBigInt } from "./utils/serializeBigInt.js";

const app = express();
app.set("trust proxy", 1);

function sanitizePayload(payload) {
  if (!payload || typeof payload !== "object") {
    return payload;
  }

  if (Array.isArray(payload)) {
    return payload.map((item) => sanitizePayload(item));
  }

  return Object.fromEntries(
    Object.entries(payload).map(([key, value]) => {
      const normalizedKey = key.toLowerCase();
      if (
        normalizedKey.includes("password") ||
        normalizedKey.includes("token") ||
        normalizedKey.includes("secret") ||
        normalizedKey.includes("cookie")
      ) {
        return [key, "[redacted]"];
      }

      return [key, sanitizePayload(value)];
    })
  );
}

const originEnv = process.env.FRONTEND_ORIGIN || "*";
const allowedOrigins = originEnv.split(",").map((value) => value.trim());

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));
app.use(cookieParser());
app.use(morgan("dev"));
app.use((_req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (body) => originalJson(serializeBigInt(body));
  next();
});
app.use((req, res, next) => {
  req.requestId = randomUUID();
  res.setHeader("X-Request-Id", req.requestId);
  next();
});

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    aiKeys: getAiKeyStatus(),
  });
});

app.get("/api/health/db", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok" });
  } catch (error) {
    logError(error, { scope: "health-db" });
    res.status(500).json({
      status: "error",
      message: error?.message || "Database connection failed",
      code: error?.code,
    });
  }
});

app.use("/api", apiLimiter);
app.use("/api/debug", debugRoutes);
app.use("/api/public/keys", keyRoutes);
app.use("/api/public", publicRoutes);
app.use("/api/auth", authRoutes);
app.get("/api/me", requireAuth, (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      fullName: req.user.fullName,
      email: req.user.email,
      role: req.user.role,
    },
  });
});

function maskAccessCode(code) {
  const value = String(code || "").trim();
  if (!value) {
    return null;
  }

  const suffix = value.slice(-4);
  return `APRO-XXXX-XXXX-${suffix}`;
}

function resolvePlanName(accessCode) {
  const directPlan = String(accessCode?.planName || "").trim();
  if (directPlan) {
    return directPlan;
  }

  const notePlan = String(accessCode?.notes || "")
    .match(/(?:^|[;,\s])plan:([^;,\n]+)/i)?.[1]
    ?.trim();
  if (notePlan) {
    return notePlan;
  }

  const ownerName = String(accessCode?.ownerName || "").trim();
  if (ownerName) {
    return ownerName;
  }

  return "الباقة الحالية";
}

app.get(
  "/api/me/key",
  asyncHandler(async (req, res) => {
    const auth = await getAuthWorkspace(req).catch(() => null);
    const keyId = Number(auth?.activationKeyId || req.cookies?.key_session);

    if (!Number.isFinite(keyId)) {
      return res.status(401).json({
        message: "أدخل مفتاحك أولًا للوصول إلى اللوحة.",
      });
    }

    const accessCode = await getActivationCodeById(keyId);

    if (!accessCode) {
      return res.status(404).json({
        message: "جلسة المفتاح غير صالحة.",
      });
    }

    const imagesLimit = Number(accessCode.imageLimit || 0);
    const videosLimit = Number(accessCode.videoLimit || 0);
    const imagesUsed = Number(accessCode.imageUsed || 0);
    const videosUsed = Number(accessCode.videoUsed || 0);
    const isExpired =
      accessCode.expiresAt && new Date(accessCode.expiresAt).getTime() < Date.now();
    const status =
      !accessCode.isActive ? "disabled" : isExpired || accessCode.statusKey === "expired" ? "expired" : "active";
    const customerName = accessCode.ownerName || "العميل";

    return res.json({
      customerName,
      planName: resolvePlanName(accessCode),
      codeMasked: maskAccessCode(accessCode.code),
      creditsRemaining: Math.max(Number(accessCode.creditsRemaining || 0), 0),
      imagesLimit,
      imagesUsed,
      imagesRemaining: Math.max(imagesLimit - imagesUsed, 0),
      videosLimit,
      videosUsed,
      videosRemaining: Math.max(videosLimit - videosUsed, 0),
      expiresAt: accessCode.expiresAt || null,
      activatedAt: accessCode.activatedAt || null,
      status,
      activationKeyId: accessCode.id,
      workspace:
        auth?.workspace ||
        (await ensureWorkspaceForActivationKey({
          activationKeyId: accessCode.id,
          preferredName: accessCode.ownerName || accessCode.planName || "",
        })),
    });
  })
);
app.use("/api/activate", activateRoutes);
app.use("/api/activate-key", activateRoutes);
app.use("/api/user/code", activateRoutes);
app.use("/api/keys", keyRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/generate", generateRoutes);
app.use("/api/generations", generateRoutes);
app.use("/api/projects", generateRoutes);
app.use("/api/results", generateRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/usage", usageRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/bootstrap", bootstrapRoutes);
app.use("/api/download", downloadRoutes);

app.use((err, req, res, _next) => {
  const errorCode = err?.code || null;
  const requestId = req.requestId || randomUUID();
  let statusCode = err?.statusCode || 500;
  let message = err?.message || "حدث خطأ غير متوقع.";

  if (err?.code === "P2021") {
    statusCode = 500;
    message = "تعذر تجهيز قاعدة البيانات مؤقتًا. حاول مرة أخرى بعد قليل.";
  }

  if (err?.code === "P1000" || err?.code === "P1001") {
    statusCode = 500;
    message = "تعذر الاتصال بالخادم مؤقتًا. حاول مرة أخرى بعد قليل.";
  }

  if (err?.code === "LIMIT_FILE_SIZE") {
    statusCode = 413;
    message = "حجم الملف أكبر من المسموح.";
  }
  logError(err, {
    requestId,
    path: req.originalUrl || req.path,
    method: req.method,
    userId: req.user?.id,
    code: errorCode,
    query: sanitizePayload(req.query),
    body: sanitizePayload(req.body),
  });
  res.status(statusCode).json({ message, code: errorCode, requestId });
});

export default app;
