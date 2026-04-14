import { prisma } from "../lib/prisma.js";

function httpError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  throw error;
}

async function ensureActivationCodesTable() {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS activation_codes (
      id SERIAL PRIMARY KEY,
      code VARCHAR(255) NOT NULL UNIQUE,
      balance INTEGER NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      is_used BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function createSubscriptionFromLegacyCode({ userId, code }) {
  const startAt = new Date();
  const endAt = new Date(startAt);
  endAt.setDate(endAt.getDate() + (code.validityDays || 30));

  const subscription = await prisma.subscription.create({
    data: {
      userId,
      codeId: code.id,
      packageName: code.planName,
      imageBalance: code.imageQuota,
      videoBalance: code.videoQuota,
      videoMaxDurationSeconds: code.videoMaxDurationSeconds,
      startAt,
      endAt,
      renewalEnabled: code.renewalEnabled,
      renewalEveryDays: code.renewalEveryDays,
      renewalMode: code.renewalMode,
      renewalImageQuota: code.renewalImageQuota,
      renewalVideoQuota: code.renewalVideoQuota,
    },
  });

  await prisma.code.update({
    where: { id: code.id },
    data: { redeemedCount: { increment: 1 } },
  });

  await prisma.codeRedemption.create({
    data: {
      userId,
      codeId: code.id,
    },
  });

  return subscription;
}

async function createSubscriptionFromActivationCode({ userId, activationCode }) {
  const startAt = new Date();
  const endAt = new Date(startAt);
  endAt.setDate(endAt.getDate() + 30);

  const balance = Number(activationCode.balance || 0);
  if (balance < 1) {
    httpError("رصيد هذا الكود غير كاف للتفعيل.");
  }

  const subscription = await prisma.subscription.create({
    data: {
      userId,
      packageName: `كود ${activationCode.code}`,
      imageBalance: balance,
      videoBalance: balance,
      videoMaxDurationSeconds: 60,
      startAt,
      endAt,
      status: "active",
    },
  });

  await prisma.activationCode.update({
    where: { id: activationCode.id },
    data: { isUsed: true },
  });

  return subscription;
}

async function resolveLegacyCode({ email, codeValue, silent }) {
  if (codeValue) {
    const code = await prisma.code.findUnique({ where: { code: codeValue } });
    if (!code) {
      return null;
    }

    if (!code.isActive) {
      if (silent) {
        return null;
      }
      httpError("الكود غير صالح أو غير نشط.");
    }

    if (code.assignedEmail && code.assignedEmail !== email) {
      if (silent) {
        return null;
      }
      httpError("هذا الكود مخصص لحساب آخر، يرجى التواصل مع الدعم.");
    }

    return code;
  }

  const code = await prisma.code.findFirst({
    where: {
      assignedEmail: email,
      isActive: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return code || null;
}

async function resolveActivationCode({ codeValue, silent }) {
  if (!codeValue) {
    return null;
  }

  await ensureActivationCodesTable();
  const activationCode = await prisma.activationCode.findUnique({
    where: { code: codeValue },
  });

  if (!activationCode) {
    if (silent) {
      return null;
    }
    httpError("الكود غير صالح أو غير نشط.");
  }

  if (!activationCode.isActive) {
    if (silent) {
      return null;
    }
    httpError("الكود غير صالح أو غير نشط.");
  }

  if (activationCode.isUsed) {
    if (silent) {
      return null;
    }
    httpError("تم استخدام هذا الكود مسبقًا.");
  }

  return activationCode;
}

export async function activateCodeForUser({ userId, email, codeValue, silent = false }) {
  const legacyCode = await resolveLegacyCode({ email, codeValue, silent });

  if (legacyCode) {
    if (legacyCode.redeemedCount >= legacyCode.maxRedemptions) {
      if (silent) {
        return null;
      }
      httpError("تم استخدام هذا الكود من قبل.");
    }

    const alreadyRedeemed = await prisma.codeRedemption.findFirst({
      where: { userId, codeId: legacyCode.id },
    });

    if (alreadyRedeemed) {
      if (silent) {
        return null;
      }
      httpError("تم استخدام هذا الكود من قبل.");
    }

    return createSubscriptionFromLegacyCode({ userId, code: legacyCode });
  }

  const activationCode = await resolveActivationCode({ codeValue, silent });
  if (!activationCode) {
    return null;
  }

  return createSubscriptionFromActivationCode({ userId, activationCode });
}
