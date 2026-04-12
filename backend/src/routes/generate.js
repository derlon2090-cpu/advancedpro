import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.post(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const type = String(req.body.type || "image");
    const prompt = String(req.body.prompt || "").trim();

    if (!prompt) {
      return res.status(400).json({ message: "أدخل وصفًا واضحًا قبل التوليد." });
    }

    const subscription = await prisma.subscription.findFirst({
      where: { userId: req.user.id, status: "active" },
      orderBy: { createdAt: "desc" },
    });

    if (!subscription) {
      return res.status(400).json({ message: "لا توجد باقة مفعلة." });
    }

    const cost = type === "video" ? 5 : 1;

    if (type === "image" && subscription.imageBalance < cost) {
      return res.status(400).json({ message: "رصيد الصور غير كافٍ." });
    }

    if (type === "video" && subscription.videoBalance < 1) {
      return res.status(400).json({ message: "رصيد مشاريع الفيديو غير كافٍ." });
    }

    const resultUrl = "https://example.com/result";

    await prisma.generation.create({
      data: {
        userId: req.user.id,
        type,
        prompt,
        resultUrl,
      },
    });

    await prisma.usageLog.create({
      data: {
        userId: req.user.id,
        subscriptionId: subscription.id,
        type,
        amountUsed: type === "video" ? 1 : cost,
        promptText: prompt,
        outputUrl: resultUrl,
      },
    });

    await prisma.subscription.update({
      where: { id: subscription.id },
      data:
        type === "video"
          ? { videoBalance: { decrement: 1 } }
          : { imageBalance: { decrement: cost } },
    });

    return res.json({
      message: "تم إنشاء الطلب بنجاح.",
      resultUrl,
    });
  })
);

export default router;
