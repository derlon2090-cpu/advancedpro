import { prisma } from "../lib/prisma.js";
import { withDbRetry } from "../utils/dbRetry.js";
import { verifyToken } from "../utils/jwt.js";
import { getActivationCodeById } from "../services/activationCodes.js";
import { ensureWorkspaceForActivationKey, getWorkspaceById } from "../services/workspaces.js";

export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const bearerToken = header.startsWith("Bearer ") ? header.slice(7) : null;
    const cookieToken = req.cookies?.token;
    const token = bearerToken || cookieToken;

    if (!token) {
      return res.status(401).json({ message: "الرجاء تسجيل الدخول." });
    }

    let payload;
    try {
      payload = verifyToken(token);
    } catch (error) {
      return res.status(401).json({ message: "التوكن غير صالح." });
    }

    const user = await withDbRetry(() =>
      prisma.user.findUnique({ where: { id: payload.id } })
    );

    if (!user || user.status !== "active") {
      return res.status(401).json({ message: "الحساب غير نشط." });
    }

    req.user = user;
    return next();
  } catch (error) {
    return next(error);
  }
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ message: "غير مصرح." });
  }

  return next();
}

function tokenFromRequest(req) {
  const header = req.headers.authorization || "";
  const bearerToken = header.startsWith("Bearer ") ? header.slice(7) : null;
  const cookieToken = req.cookies?.token || req.cookies?.advancedpro_token;
  return bearerToken || cookieToken || null;
}

export async function getAuthWorkspace(req) {
  const token = tokenFromRequest(req);
  let payload = null;

  if (token) {
    try {
      payload = verifyToken(token);
    } catch (_error) {
      payload = null;
    }
  }

  let activationKeyId = Number(payload?.activationKeyId || payload?.keyId || req.cookies?.key_session);
  if (!Number.isFinite(activationKeyId)) {
    const error = new Error("الجلسة غير مفعلة أو غير صالحة.");
    error.statusCode = 401;
    throw error;
  }

  const accessCode = await getActivationCodeById(activationKeyId);
  if (!accessCode || !accessCode.isActive || accessCode.statusKey === "expired") {
    const error = new Error("جلسة المفتاح غير صالحة.");
    error.statusCode = 401;
    throw error;
  }

  let workspaceId = Number(payload?.workspaceId);
  if (Number.isFinite(workspaceId)) {
    const existing = await getWorkspaceById(workspaceId);
    if (!existing || Number(existing.activationKeyId) !== Number(activationKeyId)) {
      workspaceId = NaN;
    }
  }

  const workspace =
    Number.isFinite(workspaceId)
      ? await getWorkspaceById(workspaceId)
      : await ensureWorkspaceForActivationKey({
          activationKeyId,
          preferredName: accessCode.ownerName || accessCode.planName || "",
        });

  if (!workspace) {
    const error = new Error("تعذر تهيئة مساحة العمل.");
    error.statusCode = 500;
    throw error;
  }

  req.authWorkspace = {
    activationKeyId: Number(activationKeyId),
    workspaceId: Number(workspace.id),
    activationKey: accessCode,
    workspace,
    tokenPayload: payload,
  };

  return req.authWorkspace;
}
