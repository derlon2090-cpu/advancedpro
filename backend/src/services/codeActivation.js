import { prisma } from "../lib/prisma.js";

function httpError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  throw error;
}

async function createSubscriptionFromCode({ userId, code }) {
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

export async function activateCodeForUser({ userId, email, codeValue, silent = false }) {
  let code;

  if (codeValue) {
    code = await prisma.code.findUnique({ where: { code: codeValue } });

    if (!code || !code.isActive) {
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
  } else {
    code = await prisma.code.findFirst({
      where: {
        assignedEmail: email,
        isActive: true,
      },
      orderBy: { createdAt: "desc" },
    });

    if (!code) {
      return null;
    }
  }

  if (code.redeemedCount >= code.maxRedemptions) {
    if (silent) {
      return null;
    }
    httpError("تم استخدام الكود من قبل.");
  }

  const alreadyRedeemed = await prisma.codeRedemption.findFirst({
    where: { userId, codeId: code.id },
  });

  if (alreadyRedeemed) {
    if (silent) {
      return null;
    }
    httpError("تم استخدام الكود من قبل.");
  }

  return createSubscriptionFromCode({ userId, code });
}
