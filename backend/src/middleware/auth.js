import { prisma } from "../lib/prisma.js";
import { verifyToken } from "../utils/jwt.js";

export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const bearerToken = header.startsWith("Bearer ") ? header.slice(7) : null;
    const cookieToken = req.cookies?.token;
    const token = bearerToken || cookieToken;

    if (!token) {
      return res.status(401).json({ message: "الرجاء تسجيل الدخول." });
    }

    const payload = verifyToken(token);
    const user = await prisma.user.findUnique({ where: { id: payload.id } });

    if (!user || user.status !== "active") {
      return res.status(401).json({ message: "الحساب غير نشط." });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ message: "توكن غير صالح." });
  }
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ message: "غير مصرح." });
  }

  return next();
}
