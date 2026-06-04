import { prisma } from "../lib/prisma.js";
import { withDbRetry } from "../utils/dbRetry.js";
import { calculateDefaultKeyCredits } from "../utils/credits.js";

const RENEWAL_TYPES = new Set(["daily", "weekly", "monthly"]);

function httpError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) {
      return true;
    }
    if (["false", "0", "no", "off"].includes(normalized)) {
      return false;
    }
  }

  return fallback;
}

function normalizeInteger(value, fieldLabel, fallback = 0) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    httpError(`${fieldLabel} غير صالح.`);
  }

  return Math.floor(parsed);
}

function normalizeDate(value) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    httpError("تاريخ انتهاء الكود غير صالح.");
  }

  return parsed;
}

function normalizeEmail(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
  if (!isValid) {
    httpError("البريد الإلكتروني المرتبط غير صالح.");
  }

  return normalized;
}

function addRenewalPeriod(date, renewalType) {
  const next = new Date(date);

  if (renewalType === "daily") {
    next.setDate(next.getDate() + 1);
    return next;
  }

  if (renewalType === "weekly") {
    next.setDate(next.getDate() + 7);
    return next;
  }

  if (renewalType === "monthly") {
    next.setMonth(next.getMonth() + 1);
    return next;
  }

  return null;
}

function getRenewalEveryDays(renewalType) {
  if (renewalType === "daily") {
    return 1;
  }
  if (renewalType === "weekly") {
    return 7;
  }
  if (renewalType === "monthly") {
    return 30;
  }
  return null;
}

function getRenewalLabel(renewalType) {
  if (renewalType === "daily") {
    return "يومي";
  }
  if (renewalType === "weekly") {
    return "أسبوعي";
  }
  if (renewalType === "monthly") {
    return "شهري";
  }
  return "غير متجدد";
}

function getAccessTypeLabel(email) {
  return email ? "مخصص لحساب واحد" : "متاح للاستخدام العام";
}

function getStatusMeta(code, now = new Date()) {
  if (!code.isActive) {
    return { key: "inactive", label: "غير مفعل" };
  }

  if (code.expiresAt && new Date(code.expiresAt).getTime() < now.getTime()) {
    return { key: "expired", label: "منتهي" };
  }

  const hasActivation = Boolean(code.activatedByUserId || code.activatedAt);
  const hasRemaining = code.remainingImages > 0 || code.remainingVideos > 0;

  if (hasActivation && hasRemaining) {
    return { key: "in-use", label: "قيد الاستخدام" };
  }

  if (hasActivation && !hasRemaining) {
    return { key: "used", label: "تم الاستخدام" };
  }

  return { key: "available", label: "متاح" };
}

function deriveLimits(record) {
  const fallbackBalance = Number(record.balance || 0);
  const imageLimit = Number(record.imageLimit || 0) || fallbackBalance;
  const videoLimit = Number(record.videoLimit || 0) || fallbackBalance;
  const imageUsed = Math.max(Number(record.imageUsed || 0), 0);
  const videoUsed = Math.max(Number(record.videoUsed || 0), 0);

  return {
    imageLimit,
    videoLimit,
    imageUsed,
    videoUsed,
    remainingImages: Math.max(imageLimit - imageUsed, 0),
    remainingVideos: Math.max(videoLimit - videoUsed, 0),
  };
}

function serializeActivationCode(record) {
  if (!record) {
    return null;
  }

  const limits = deriveLimits(record);
  const expiresAt = record.expiresAt ? new Date(record.expiresAt) : null;
  const createdAt = record.createdAt ? new Date(record.createdAt) : null;
  const activatedAt = record.activatedAt ? new Date(record.activatedAt) : null;
  const lastRenewedAt = record.lastRenewedAt ? new Date(record.lastRenewedAt) : null;
  const status = getStatusMeta({ ...record, ...limits });

  return {
    id: record.id,
    code: record.code,
    email: record.email || null,
    ownerName: record.ownerName || null,
    imageLimit: limits.imageLimit,
    videoLimit: limits.videoLimit,
    imageUsed: limits.imageUsed,
    videoUsed: limits.videoUsed,
    imageAvailable: limits.remainingImages,
    videoAvailable: limits.remainingVideos,
    creditsRemaining: Math.max(Number(record.balance || 0), 0),
    isActive: Boolean(record.isActive),
    isUsed: Boolean(record.isUsed),
    isRenewable: Boolean(record.isRenewable),
    renewalType: record.renewalType || null,
    renewalLabel: getRenewalLabel(record.renewalType),
    expiresAt,
    createdAt,
    updatedAt: record.updatedAt ? new Date(record.updatedAt) : null,
    notes: record.notes || "",
    activatedByUserId: record.activatedByUserId || null,
    activatedAt,
    startsAt: record.startsAt ? new Date(record.startsAt) : null,
    lastRenewedAt,
    subscriptionId: record.subscriptionId || null,
    accessType: record.email ? "private" : "public",
    accessTypeLabel: getAccessTypeLabel(record.email),
    statusKey: status.key,
    statusLabel: status.label,
    chatStatus: Boolean((record.activatedByUserId || record.activatedAt) && record.isActive) ? "مفتوح" : "مغلق",
  };
}

async function syncSubscriptionForCode(record) {
  if (!record?.activatedByUserId) {
    return null;
  }

  const serialized = serializeActivationCode(record);
  const farFuture = new Date(record.activatedAt || record.createdAt || new Date());
  farFuture.setFullYear(farFuture.getFullYear() + 10);

  const subscriptionData = {
    userId: record.activatedByUserId,
    packageName: record.ownerName || `كود ${record.code}`,
    imageBalance: serialized.imageAvailable,
    videoBalance: serialized.videoAvailable,
    videoMaxDurationSeconds: 60,
    startAt: record.activatedAt || record.createdAt || new Date(),
    endAt: record.expiresAt || farFuture,
    renewalEnabled: Boolean(record.isRenewable),
    renewalEveryDays: getRenewalEveryDays(record.renewalType),
    renewalMode: "reset",
    renewalImageQuota: serialized.imageLimit,
    renewalVideoQuota: serialized.videoLimit,
    status:
      serialized.statusKey === "expired" || !record.isActive ? "expired" : "active",
  };

  if (record.subscriptionId) {
    const existing = await withDbRetry(() =>
      prisma.subscription.findUnique({ where: { id: record.subscriptionId } })
    );

    if (existing) {
      return withDbRetry(() =>
        prisma.subscription.update({
          where: { id: record.subscriptionId },
          data: subscriptionData,
        })
      );
    }
  }

  const subscription = await withDbRetry(() =>
    prisma.subscription.create({
      data: subscriptionData,
    })
  );

  await withDbRetry(() =>
    prisma.activationCode.update({
      where: { id: record.id },
      data: { subscriptionId: subscription.id },
    })
  );

  return subscription;
}

async function maybeRenewActivationCode(record) {
  if (
    !record ||
    !record.isRenewable ||
    !RENEWAL_TYPES.has(String(record.renewalType || "")) ||
    !record.activatedByUserId &&
    !record.activatedAt
  ) {
    return record;
  }

  const now = new Date();
  if (record.expiresAt && new Date(record.expiresAt).getTime() < now.getTime()) {
    return record;
  }

  const anchor = record.lastRenewedAt || record.activatedAt || record.createdAt;
  if (!anchor) {
    return record;
  }

  let renewalCursor = new Date(anchor);
  let nextRenewal = addRenewalPeriod(renewalCursor, record.renewalType);
  let didRenew = false;

  while (nextRenewal && nextRenewal.getTime() <= now.getTime()) {
    renewalCursor = nextRenewal;
    nextRenewal = addRenewalPeriod(renewalCursor, record.renewalType);
    didRenew = true;
  }

  if (!didRenew) {
    return record;
  }

  const updated = await withDbRetry(() =>
    prisma.activationCode.update({
      where: { id: record.id },
      data: {
        imageUsed: 0,
        videoUsed: 0,
        lastRenewedAt: renewalCursor,
        isUsed: true,
        balance: calculateDefaultKeyCredits({
          imageLimit: Number(record.imageLimit || 0) || Number(record.balance || 0),
          videoLimit: Number(record.videoLimit || 0) || Number(record.balance || 0),
        }),
      },
    })
  );

  await syncSubscriptionForCode(updated);
  return updated;
}

export async function getActivationCodeById(id) {
  await ensureActivationCodesTable();
  const record = await withDbRetry(() =>
    prisma.activationCode.findUnique({ where: { id } })
  );

  if (!record) {
    return null;
  }

  const renewed = await maybeRenewActivationCode(record);
  return serializeActivationCode(renewed);
}

function buildCreateOrUpdatePayload(input, { existing = null } = {}) {
  const code = String(input.code || existing?.code || "").trim();
  if (!code) {
    httpError("الرجاء إدخال الكود.");
  }

  const accessType = String(input.accessType || "").trim().toLowerCase();
  const isPublic =
    accessType === "public"
      ? true
      : accessType === "private"
        ? false
        : !String(input.email || existing?.email || "").trim();

  const email = isPublic ? null : normalizeEmail(input.email ?? existing?.email);
  if (!isPublic && !email) {
    httpError("أدخل البريد الإلكتروني المرتبط بهذا الكود.");
  }

  const imageLimit = normalizeInteger(
    input.imageLimit ?? existing?.imageLimit ?? existing?.balance,
    "عدد الصور"
  );
  const videoLimit = normalizeInteger(
    input.videoLimit ?? existing?.videoLimit ?? existing?.balance,
    "عدد الفيديوهات"
  );
  const isRenewable = normalizeBoolean(
    input.isRenewable ?? existing?.isRenewable,
    false
  );
  const rawRenewalType = String(
    input.renewalType ?? existing?.renewalType ?? ""
  ).trim().toLowerCase();
  const renewalType = isRenewable ? rawRenewalType : null;

  if (isRenewable && !RENEWAL_TYPES.has(renewalType)) {
    httpError("اختر نوع تجديد صالح: يومي أو أسبوعي أو شهري.");
  }

  const expiresAt = normalizeDate(input.expiresAt ?? existing?.expiresAt ?? null);
  const ownerName = String(input.ownerName || existing?.ownerName || "").trim() || null;
  const notes = String(input.notes || existing?.notes || "").trim() || "";
  const isActive = normalizeBoolean(input.isActive ?? existing?.isActive, true);
  const balance = normalizeInteger(
    input.balance ??
      input.xpBalance ??
      existing?.balance ??
      calculateDefaultKeyCredits({ imageLimit, videoLimit }),
    "ط§ظ„ط±طµظٹط¯"
  );

  return {
    code,
    email,
    ownerName,
    imageLimit,
    videoLimit,
    balance,
    isActive,
    isRenewable,
    renewalType,
    expiresAt,
    notes,
  };
}

export async function ensureActivationCodesTable() {
  const statements = [
    `
      CREATE TABLE IF NOT EXISTS activation_codes (
        id SERIAL PRIMARY KEY,
        code VARCHAR(255) NOT NULL UNIQUE,
        balance INTEGER NOT NULL DEFAULT 0,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        is_used BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `,
    `ALTER TABLE activation_codes ADD COLUMN IF NOT EXISTS email VARCHAR(255)`,
    `ALTER TABLE activation_codes ADD COLUMN IF NOT EXISTS owner_name VARCHAR(255)`,
    `ALTER TABLE activation_codes ADD COLUMN IF NOT EXISTS image_limit INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE activation_codes ADD COLUMN IF NOT EXISTS video_limit INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE activation_codes ADD COLUMN IF NOT EXISTS image_used INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE activation_codes ADD COLUMN IF NOT EXISTS video_used INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE activation_codes ADD COLUMN IF NOT EXISTS is_renewable BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE activation_codes ADD COLUMN IF NOT EXISTS renewal_type VARCHAR(32)`,
    `ALTER TABLE activation_codes ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP(3)`,
    `ALTER TABLE activation_codes ADD COLUMN IF NOT EXISTS notes TEXT`,
    `ALTER TABLE activation_codes ADD COLUMN IF NOT EXISTS activated_by_user_id INTEGER`,
    `ALTER TABLE activation_codes ADD COLUMN IF NOT EXISTS activated_at TIMESTAMP(3)`,
    `ALTER TABLE activation_codes ADD COLUMN IF NOT EXISTS starts_at TIMESTAMP(3)`,
    `ALTER TABLE activation_codes ADD COLUMN IF NOT EXISTS last_renewed_at TIMESTAMP(3)`,
    `ALTER TABLE activation_codes ADD COLUMN IF NOT EXISTS subscription_id INTEGER`,
    `ALTER TABLE activation_codes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`,
  ];

  for (const statement of statements) {
    await withDbRetry(() => prisma.$executeRawUnsafe(statement));
  }
}

export async function createActivationCode(input) {
  await ensureActivationCodesTable();

  const payload = buildCreateOrUpdatePayload(input);
  const existing = await withDbRetry(() =>
    prisma.activationCode.findUnique({ where: { code: payload.code } })
  );

  if (existing) {
    httpError("هذا الكود موجود مسبقًا", 409);
  }

  const created = await withDbRetry(() =>
    prisma.activationCode.create({
      data: {
        code: payload.code,
        email: payload.email,
        ownerName: payload.ownerName,
        imageLimit: payload.imageLimit,
        videoLimit: payload.videoLimit,
        imageUsed: 0,
        videoUsed: 0,
        balance: payload.balance,
        isActive: payload.isActive,
        isUsed: false,
        isRenewable: payload.isRenewable,
        renewalType: payload.renewalType,
        expiresAt: payload.expiresAt,
        notes: payload.notes,
      },
    })
  );

  return serializeActivationCode(created);
}

export async function updateActivationCode(id, input) {
  await ensureActivationCodesTable();

  const existing = await withDbRetry(() =>
    prisma.activationCode.findUnique({ where: { id } })
  );

  if (!existing) {
    httpError("لم يتم العثور على الكود المطلوب.", 404);
  }

  const payload = buildCreateOrUpdatePayload(input, { existing });

  if (payload.code !== existing.code) {
    const duplicate = await withDbRetry(() =>
      prisma.activationCode.findUnique({ where: { code: payload.code } })
    );
    if (duplicate && duplicate.id !== id) {
      httpError("هذا الكود موجود مسبقًا", 409);
    }
  }

  const updated = await withDbRetry(() =>
    prisma.activationCode.update({
      where: { id },
      data: {
        code: payload.code,
        email: payload.email,
        ownerName: payload.ownerName,
        imageLimit: payload.imageLimit,
        videoLimit: payload.videoLimit,
        balance: payload.balance,
        isActive: payload.isActive,
        isRenewable: payload.isRenewable,
        renewalType: payload.renewalType,
        expiresAt: payload.expiresAt,
        notes: payload.notes,
      },
    })
  );

  await syncSubscriptionForCode(updated);
  return serializeActivationCode(updated);
}

export async function deleteActivationCode(id) {
  await ensureActivationCodesTable();

  const existing = await withDbRetry(() =>
    prisma.activationCode.findUnique({ where: { id } })
  );

  if (!existing) {
    httpError("لم يتم العثور على الكود المطلوب.", 404);
  }

  if (existing.subscriptionId) {
    await withDbRetry(() =>
      prisma.subscription.updateMany({
        where: { id: existing.subscriptionId },
        data: { status: "expired", imageBalance: 0, videoBalance: 0 },
      })
    );
  }

  await withDbRetry(() =>
    prisma.activationCode.delete({
      where: { id },
    })
  );
}

export async function listActivationCodes({ search = "" } = {}) {
  await ensureActivationCodesTable();
  const normalizedSearch = String(search || "").trim();
  const where = normalizedSearch
    ? {
        OR: [
          { code: { contains: normalizedSearch, mode: "insensitive" } },
          { email: { contains: normalizedSearch, mode: "insensitive" } },
          { ownerName: { contains: normalizedSearch, mode: "insensitive" } },
          { notes: { contains: normalizedSearch, mode: "insensitive" } },
        ],
      }
    : {};

  const records = await withDbRetry(() =>
    prisma.activationCode.findMany({
      where,
      orderBy: { createdAt: "desc" },
    })
  );

  const refreshed = [];
  for (const record of records) {
    refreshed.push(serializeActivationCode(await maybeRenewActivationCode(record)));
  }

  return refreshed;
}

export async function getUserActivationCode(userId) {
  await ensureActivationCodesTable();
  const record = await withDbRetry(() =>
    prisma.activationCode.findFirst({
      where: { activatedByUserId: userId },
      orderBy: { activatedAt: "desc" },
    })
  );

  if (!record) {
    return null;
  }

  const renewed = await maybeRenewActivationCode(record);
  await syncSubscriptionForCode(renewed);
  return serializeActivationCode(renewed);
}

export async function activateAdminCodeAsKeySession({ codeValue }) {
  await ensureActivationCodesTable();
  const normalizedCode = String(codeValue || "").trim();

  if (!normalizedCode) {
    httpError("أدخل المفتاح أولًا.");
  }

  const record = await withDbRetry(() =>
    prisma.activationCode.findUnique({ where: { code: normalizedCode } })
  );

  if (!record) {
    httpError("المفتاح غير صحيح", 404);
  }

  if (!record.isActive) {
    httpError("هذا المفتاح غير متاح", 403);
  }

  let current = await maybeRenewActivationCode(record);
  const serializedBefore = serializeActivationCode(current);

  if (serializedBefore.statusKey === "expired") {
    httpError("انتهت صلاحية المفتاح", 410);
  }

  if (!current.activatedAt) {
    current = await withDbRetry(() =>
      prisma.activationCode.update({
        where: { id: current.id },
        data: {
          activatedAt: new Date(),
          lastRenewedAt: current.isRenewable ? new Date() : null,
          isUsed: true,
        },
      })
    );
  } else {
    current = await withDbRetry(() =>
      prisma.activationCode.update({
        where: { id: current.id },
        data: { isUsed: true },
      })
    );
  }

  return serializeActivationCode(current);
}

export function buildActivationSuccessMessage(serializedCode) {
  const expiryText = serializedCode?.expiresAt
    ? new Date(serializedCode.expiresAt).toISOString().slice(0, 10)
    : "غير محدد";

  return `تم التحقق من الكود بنجاح
رصيدك: ${serializedCode?.imageAvailable ?? 0} صورة / ${serializedCode?.videoAvailable ?? 0} فيديو
الكود صالح حتى: ${expiryText}
الشات متاح الآن`;
}

export async function activateAdminCodeForUser({ userId, email, codeValue }) {
  await ensureActivationCodesTable();
  const normalizedCode = String(codeValue || "").trim();

  if (!normalizedCode) {
    httpError("أدخل كود التفعيل أولًا.");
  }

  const record = await withDbRetry(() =>
    prisma.activationCode.findUnique({ where: { code: normalizedCode } })
  );

  if (!record || !record.isActive) {
    httpError("الكود الخاص بك غير صحيح أو غير فعال");
  }

  let current = await maybeRenewActivationCode(record);
  const serializedBefore = serializeActivationCode(current);

  if (serializedBefore.statusKey === "expired") {
    httpError("انتهت صلاحية هذا الكود.");
  }

  if (current.email && current.email !== String(email || "").trim().toLowerCase()) {
    httpError("هذا الكود غير مخصص لهذا الحساب");
  }

  if (current.activatedByUserId && current.activatedByUserId !== userId) {
    httpError("الكود الخاص بك غير صحيح أو غير فعال");
  }

  if (!current.activatedByUserId) {
    current = await withDbRetry(() =>
      prisma.activationCode.update({
        where: { id: current.id },
        data: {
          activatedByUserId: userId,
          activatedAt: new Date(),
          lastRenewedAt: current.isRenewable ? new Date() : null,
          isUsed: true,
        },
      })
    );
  } else {
    current = await withDbRetry(() =>
      prisma.activationCode.update({
        where: { id: current.id },
        data: {
          isUsed: true,
        },
      })
    );
  }

  await syncSubscriptionForCode(current);
  return serializeActivationCode(current);
}

export async function consumeActivationCodeUsage({
  userId,
  type,
  promptText = null,
  outputUrl = null,
}) {
  const current = await getUserActivationCode(userId);
  if (!current) {
    return null;
  }

  const field = type === "video" ? "videoUsed" : "imageUsed";
  const remainingField = type === "video" ? "videoAvailable" : "imageAvailable";

  if (current.statusKey === "expired" || !current.isActive) {
    httpError("الكود الخاص بك غير صحيح أو غير فعال");
  }

  if (current[remainingField] < 1) {
    httpError(
      type === "video"
        ? "لقد وصلت إلى الحد المسموح للفيديوهات في هذا الكود"
        : "لقد وصلت إلى الحد المسموح للصور في هذا الكود"
    );
  }

  const updated = await withDbRetry(() =>
    prisma.activationCode.update({
      where: { id: current.id },
      data: {
        [field]: { increment: 1 },
        isUsed: true,
      },
    })
  );

  const subscription = await syncSubscriptionForCode(updated);

  if (subscription) {
    await withDbRetry(() =>
      prisma.usageLog.create({
        data: {
          userId,
          subscriptionId: subscription.id,
          type,
          amountUsed: 1,
          promptText,
          outputUrl,
        },
      })
    );
  }

  return serializeActivationCode(updated);
}

export async function consumeActivationCodeUsageByKey({
  keyId,
  type,
  promptText = null,
  outputUrl = null,
  duration = null,
  quality = null,
  style = null,
}) {
  await ensureActivationCodesTable();
  const id = Number(keyId);
  if (!Number.isFinite(id)) {
    httpError("جلسة المفتاح غير صالحة.", 401);
  }

  const current = await getActivationCodeById(id);
  if (!current) {
    httpError("جلسة المفتاح غير صالحة.", 401);
  }

  if (current.statusKey === "expired" || !current.isActive) {
    httpError("هذا المفتاح غير متاح");
  }

  const field = type === "video" ? "videoUsed" : "imageUsed";
  const remaining = type === "video" ? current.videoAvailable : current.imageAvailable;
  if (remaining < 1) {
    httpError(type === "video" ? "لا يوجد رصيد فيديو كافٍ" : "لا يوجد رصيد صور كافٍ");
  }

  const updated = await withDbRetry(() =>
    prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
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
      `;

      const next = await tx.activationCode.update({
        where: { id },
        data: {
          [field]: { increment: 1 },
          isUsed: true,
        },
      });

      await tx.$executeRaw`
        INSERT INTO projects (key_id, type, prompt, duration, quality, style, result_url, status)
        VALUES (${id}, ${type}, ${promptText || ""}, ${duration}, ${quality}, ${style}, ${outputUrl}, 'completed')
      `;

      return next;
    })
  );

  return serializeActivationCode(updated);
}
