import { Router } from "express";
import { Readable } from "node:stream";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";
import { prisma } from "../lib/prisma.js";

const router = Router();

function sanitizeFilename(name) {
  return String(name || "download")
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 120);
}

router.get(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const generation = await prisma.generation.findFirst({
      where: { id, userId: req.user.id },
    });

    if (!generation || !generation.resultUrl) {
      return res.status(404).json({ message: "الملف غير متوفر للتحميل." });
    }

    const url = generation.resultUrl;
    let parsed;
    try {
      parsed = new URL(url);
    } catch (error) {
      return res.status(400).json({ message: "رابط غير صالح للتحميل." });
    }

    if (!["http:", "https:"].includes(parsed.protocol)) {
      return res.status(400).json({ message: "رابط غير صالح للتحميل." });
    }

    const response = await fetch(url);

    if (!response.ok || !response.body) {
      return res.status(502).json({ message: "تعذر تنزيل الملف حاليًا." });
    }

    const contentType = response.headers.get("content-type") || "application/octet-stream";
    const length = response.headers.get("content-length");
    const fallbackName = sanitizeFilename(parsed.pathname.split("/").pop());
    const filename = fallbackName || `advancedpro-${id}`;

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    if (length) {
      res.setHeader("Content-Length", length);
    }

    Readable.fromWeb(response.body).pipe(res);
  })
);

export default router;
