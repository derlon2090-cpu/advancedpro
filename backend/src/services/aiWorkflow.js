import { prisma } from "../lib/prisma.js";
import { generateImage, generateText, generateVideo } from "./aiProvider.js";
import {
  consumeActivationCodeUsage,
  getUserActivationCode,
} from "./activationCodes.js";

const TRIAL_PACKAGE_NAME = "تجربة مجانية";

function httpError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
}

async function getLegacySubscription(userId) {
  const subscription = await prisma.subscription.findFirst({
    where: { userId, status: "active" },
    orderBy: { createdAt: "desc" },
  });

  if (!subscription) {
    return null;
  }

  if (subscription.endAt && new Date(subscription.endAt) < new Date()) {
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: "expired" },
    });
    return null;
  }

  return subscription;
}

async function getTextAccess(userId) {
  const accessCode = await getUserActivationCode(userId);
  if (accessCode && accessCode.isActive && accessCode.statusKey !== "expired") {
    return { mode: "activation", accessCode };
  }

  const subscription = await getLegacySubscription(userId);
  if (subscription) {
    return { mode: "legacy", subscription };
  }

  httpError("لا توجد باقة أو كود مفعل لهذا الحساب.");
}

async function getGenerationAccess(userId, type) {
  const accessCode = await getUserActivationCode(userId);
  if (accessCode) {
    if (!accessCode.isActive || accessCode.statusKey === "expired") {
      httpError("الكود الخاص بك غير صحيح أو غير فعال");
    }

    if (type === "image" && accessCode.imageAvailable < 1) {
      httpError("لقد وصلت إلى الحد المسموح للصور في هذا الكود");
    }

    if (type === "video" && accessCode.videoAvailable < 1) {
      httpError("لقد وصلت إلى الحد المسموح للفيديوهات في هذا الكود");
    }

    return { mode: "activation", accessCode };
  }

  const subscription = await getLegacySubscription(userId);
  if (!subscription) {
    httpError("لا توجد باقة أو كود مفعل لهذا الحساب.");
  }

  const isTrial = subscription.packageName === TRIAL_PACKAGE_NAME;

  if (type === "image" && subscription.imageBalance < 1) {
    httpError(
      isTrial
        ? "انتهت تجربتك المجانية، اشترك للاستمرار"
        : "رصيد الصور غير كاف."
    );
  }

  if (type === "video" && subscription.videoBalance < 1) {
    httpError(
      isTrial
        ? "انتهت تجربتك المجانية، اشترك للاستمرار"
        : "رصيد مشاريع الفيديو غير كاف."
    );
  }

  return { mode: "legacy", subscription, isTrial };
}

export async function handleTextRequest({ userId, prompt }) {
  if (!prompt) {
    httpError("أدخل وصفًا واضحًا قبل الإرسال.");
  }

  await getTextAccess(userId);
  return generateText({ prompt });
}

export async function handleImageRequest({ userId, prompt }) {
  if (!prompt) {
    httpError("أدخل وصفًا واضحًا قبل التوليد.");
  }

  const access = await getGenerationAccess(userId, "image");

  const generation = await prisma.generation.create({
    data: {
      userId,
      type: "image",
      prompt,
      status: "processing",
    },
  });

  let result;

  try {
    result = await generateImage({ prompt });
    await prisma.generation.update({
      where: { id: generation.id },
      data: {
        status: "completed",
        resultUrl: result.resultUrl,
      },
    });
  } catch (error) {
    await prisma.generation.update({
      where: { id: generation.id },
      data: { status: "failed" },
    });
    throw error;
  }

  let accessCode = null;

  if (access.mode === "activation") {
    accessCode = await consumeActivationCodeUsage({
      userId,
      type: "image",
      promptText: prompt,
      outputUrl: result?.resultUrl || null,
    });
  } else {
    await prisma.usageLog.create({
      data: {
        userId,
        subscriptionId: access.subscription.id,
        type: "image",
        amountUsed: 1,
        promptText: prompt,
        outputUrl: result?.resultUrl || null,
      },
    });

    await prisma.subscription.update({
      where: { id: access.subscription.id },
      data: access.isTrial
        ? {
            imageBalance: { decrement: 1 },
            videoBalance: 0,
          }
        : { imageBalance: { decrement: 1 } },
    });
  }

  return {
    generationId: generation.id,
    resultUrl: result?.resultUrl || null,
    accessCode,
  };
}

export async function handleVideoRequest({ userId, prompt, durationSeconds }) {
  if (!prompt) {
    httpError("أدخل وصفًا واضحًا قبل التوليد.");
  }

  const access = await getGenerationAccess(userId, "video");
  const maxDuration =
    access.mode === "activation"
      ? 60
      : Number(access.subscription.videoMaxDurationSeconds || 60);
  const duration = Number(durationSeconds || maxDuration);

  if (duration > maxDuration) {
    httpError("مدة الفيديو المطلوبة أعلى من المسموح في رصيدك الحالي.");
  }

  const generation = await prisma.generation.create({
    data: {
      userId,
      type: "video",
      prompt,
      status: "processing",
    },
  });

  let result = null;

  try {
    result = await generateVideo({ prompt });
    if (result?.resultUrl) {
      await prisma.generation.update({
        where: { id: generation.id },
        data: { status: "completed", resultUrl: result.resultUrl },
      });
    }
  } catch (error) {
    await prisma.generation.update({
      where: { id: generation.id },
      data: { status: "failed" },
    });
    throw error;
  }

  let accessCode = null;

  if (access.mode === "activation") {
    accessCode = await consumeActivationCodeUsage({
      userId,
      type: "video",
      promptText: prompt,
    });
  } else {
    await prisma.usageLog.create({
      data: {
        userId,
        subscriptionId: access.subscription.id,
        type: "video",
        amountUsed: 1,
        promptText: prompt,
      },
    });

    await prisma.subscription.update({
      where: { id: access.subscription.id },
      data: access.isTrial
        ? {
            videoBalance: { decrement: 1 },
            imageBalance: 0,
          }
        : { videoBalance: { decrement: 1 } },
    });
  }

  return {
    generationId: generation.id,
    status: result?.resultUrl ? "completed" : generation.status,
    accessCode,
  };
}
