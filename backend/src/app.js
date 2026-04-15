import cors from "cors";
import cookieParser from "cookie-parser";
import { randomUUID } from "crypto";
import express from "express";
import morgan from "morgan";
import authRoutes from "./routes/auth.js";
import publicRoutes from "./routes/public.js";
import activateRoutes from "./routes/activate.js";
import dashboardRoutes from "./routes/dashboard.js";
import profileRoutes from "./routes/profile.js";
import generateRoutes from "./routes/generate.js";
import aiRoutes from "./routes/ai.js";
import adminRoutes from "./routes/admin.js";
import bootstrapRoutes from "./routes/bootstrap.js";
import downloadRoutes from "./routes/download.js";
import usageRoutes from "./routes/usage.js";
import { requireAuth } from "./middleware/auth.js";
import { prisma } from "./lib/prisma.js";
import { apiLimiter } from "./middleware/rateLimit.js";
import { logError } from "./utils/logger.js";

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
app.use((req, res, next) => {
  req.requestId = randomUUID();
  res.setHeader("X-Request-Id", req.requestId);
  next();
});

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
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
app.use("/api/activate", activateRoutes);
app.use("/api/user/code", activateRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/generate", generateRoutes);
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
    message =
      "جداول قاعدة البيانات غير موجودة. شغّل prisma db push في Render لإنشائها.";
  }

  if (err?.code === "P1000" || err?.code === "P1001") {
    statusCode = 500;
    message = "تعذر الاتصال بقاعدة البيانات. تحقق من DATABASE_URL.";
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
