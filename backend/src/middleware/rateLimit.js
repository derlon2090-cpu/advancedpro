import rateLimit from "express-rate-limit";

const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000);
const max = Number(process.env.RATE_LIMIT_MAX || 300);
const aiWindowMs = Number(process.env.AI_RATE_LIMIT_WINDOW_MS || windowMs);
const aiMax = Number(process.env.AI_RATE_LIMIT_MAX || 30);

const baseMessage = "تم تجاوز الحد المسموح للطلبات. حاول لاحقًا.";

export const apiLimiter = rateLimit({
  windowMs,
  max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: baseMessage },
});

export const aiLimiter = rateLimit({
  windowMs: aiWindowMs,
  max: aiMax,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    if (req.user?.id) {
      return `user:${req.user.id}`;
    }
    return req.ip;
  },
  message: { message: "تم تجاوز الحد المسموح لطلبات الذكاء الاصطناعي." },
});
