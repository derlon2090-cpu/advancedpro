import { prisma } from "../lib/prisma.js";
import { generateImage, generateText, generateVideo } from "./aiProvider.js";

const TRIAL_PACKAGE_NAME = "تجربة مجانية";

function httpError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  throw error;
}

async function getActiveSubscription(userId) {
  const subscription = await prisma.subscription.findFirst({
    where: { userId, status: "active" },
    orderBy: { createdAt: "desc" },
  });

  if (!subscription) {
    httpError("لا توجد باقة مفعلة.");
  }

  return subscription;
}

export async function handleTextRequest({ userId, prompt }) {
  if (!prompt) {
    httpError("أدخل وصفًا واضحًا قبل الإرسال.");
  }

  await getActiveSubscription(userId);
  const result = await generateText({ prompt });

  return result;
}

export async function handleImageRequest({ userId, prompt }) {
  if (!prompt) {
    httpError("أدخل وصفًا واضحًا قبل التوليد.");
  }

  const subscription = await getActiveSubscription(userId);
  const isTrial = subscription.packageName === TRIAL_PACKAGE_NAME;

  if (subscription.imageBalance < 1) {
    httpError(isTrial ? "انتهت تجربتك المجانية، اشترك للاستمرار" : "رصيد الصور غير كافٍ.");
  }

  const result = await generateImage({ prompt });

  const generation = await prisma.generation.create({
    data: {
      userId,
      type: "image",
      prompt,
      resultUrl: result.resultUrl,
      status: "completed",
    },
  });

  await prisma.usageLog.create({
    data: {
      userId,
      subscriptionId: subscription.id,
      type: "image",
      amountUsed: 1,
      promptText: prompt,
      outputUrl: result.resultUrl,
    },
  });

  await prisma.subscription.update({
    where: { id: subscription.id },
    data: isTrial
      ? {
          imageBalance: { decrement: 1 },
          videoBalance: 0,
        }
      : { imageBalance: { decrement: 1 } },
  });

  return {
    generationId: generation.id,
    resultUrl: result.resultUrl,
  };
}

export async function handleVideoRequest({ userId, prompt, durationSeconds }) {
  if (!prompt) {
    httpError("أدخل وصفًا واضحًا قبل التوليد.");
  }

  const subscription = await getActiveSubscription(userId);
  const isTrial = subscription.packageName === TRIAL_PACKAGE_NAME;

  if (subscription.videoBalance < 1) {
    httpError(isTrial ? "انتهت تجربتك المجانية، اشترك للاستمرار" : "رصيد مشاريع الفيديو غير كافٍ.");
  }

  const duration = Number(durationSeconds || subscription.videoMaxDurationSeconds || 60);

  if (duration > subscription.videoMaxDurationSeconds) {
    httpError("مدة الفيديو المطلوبة أعلى من المسموح في باقتك.");
  }

  await generateVideo({ prompt });

  const generation = await prisma.generation.create({
    data: {
      userId,
      type: "video",
      prompt,
      status: "queued",
    },
  });

  await prisma.usageLog.create({
    data: {
      userId,
      subscriptionId: subscription.id,
      type: "video",
      amountUsed: 1,
      promptText: prompt,
    },
  });

  await prisma.subscription.update({
    where: { id: subscription.id },
    data: isTrial
      ? {
          videoBalance: { decrement: 1 },
          imageBalance: 0,
        }
      : { videoBalance: { decrement: 1 } },
  });

  return {
    generationId: generation.id,
    status: generation.status,
  };
}
