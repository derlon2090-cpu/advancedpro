import cors from "cors";
import cookieParser from "cookie-parser";
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
import { requireAuth } from "./middleware/auth.js";
import { apiLimiter } from "./middleware/rateLimit.js";
import { logError } from "./utils/logger.js";

const app = express();

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

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
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
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/generate", generateRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/bootstrap", bootstrapRoutes);
app.use("/api/download", downloadRoutes);

app.use((err, req, res, _next) => {
  let statusCode = err?.statusCode || 500;
  let message = err?.message || "حدث خطأ غير متوقع.";

  if (err?.code === "LIMIT_FILE_SIZE") {
    statusCode = 413;
    message = "حجم الملف أكبر من المسموح.";
  }
  logError(err, { path: req.path, method: req.method, userId: req.user?.id });
  res.status(statusCode).json({ message });
});

export default app;
