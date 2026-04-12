import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";
import { aiLimiter } from "../middleware/rateLimit.js";
import { upload, maxUploadMb } from "../middleware/upload.js";
import { prisma } from "../lib/prisma.js";
import { handleImageRequest, handleTextRequest, handleVideoRequest } from "../services/aiWorkflow.js";

const router = Router();

router.use(requireAuth, aiLimiter);

router.post(
  "/text",
  asyncHandler(async (req, res) => {
    const prompt = String(req.body.prompt || "").trim();
    const result = await handleTextRequest({ userId: req.user.id, prompt });
    res.json({ message: "تم توليد الرد.", ...result });
  })
);

router.post(
  "/image",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (req.file && !req.file.buffer) {
      return res
        .status(400)
        .json({ message: `حجم الملف كبير. الحد الأقصى ${maxUploadMb}MB.` });
    }

    const prompt = String(req.body.prompt || "").trim();
    const result = await handleImageRequest({ userId: req.user.id, prompt });

    res.json({ message: "تم قبول طلب الصورة.", ...result });
  })
);

router.post(
  "/video",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (req.file && !req.file.buffer) {
      return res
        .status(400)
        .json({ message: `حجم الملف كبير. الحد الأقصى ${maxUploadMb}MB.` });
    }

    const prompt = String(req.body.prompt || "").trim();
    const durationSeconds = req.body.durationSeconds;
    const result = await handleVideoRequest({
      userId: req.user.id,
      prompt,
      durationSeconds,
    });

    res.json({ message: "طلب الفيديو قيد المعالجة.", ...result });
  })
);

router.get(
  "/video/:id",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const generation = await prisma.generation.findFirst({
      where: { id, userId: req.user.id, type: "video" },
    });

    if (!generation) {
      return res.status(404).json({ message: "لم يتم العثور على الطلب." });
    }

    return res.json({
      generationId: generation.id,
      status: generation.status,
      resultUrl: generation.resultUrl,
    });
  })
);

export default router;
