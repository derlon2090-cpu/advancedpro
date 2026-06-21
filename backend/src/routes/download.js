import { Router } from "express";
import { Readable } from "node:stream";
import { asyncHandler } from "../utils/asyncHandler.js";
import { prisma } from "../lib/prisma.js";
import { getAuthWorkspace } from "../middleware/auth.js";
import { withDbRetry } from "../utils/dbRetry.js";

const router = Router();

function sanitizeFilename(name) {
  return String(name || "download")
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 120);
}

router.get(
  "/v2/:id",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const auth = await getAuthWorkspace(req);
    const keyId = auth.activationKeyId;
    const workspaceId = auth.workspaceId;

    if (!Number.isFinite(id) || !Number.isFinite(keyId) || !Number.isFinite(workspaceId)) {
      return res.status(401).json({ message: "جلسة المفتاح غير صالحة للتحميل." });
    }

    const rows = await withDbRetry(() =>
      prisma.$queryRaw`
        SELECT id, result_url, storage_url, mime_type
        FROM generations
        WHERE id = ${id}
          AND (workspace_id = ${workspaceId} OR (workspace_id IS NULL AND key_id = ${keyId}))
          AND deleted_at IS NULL
        LIMIT 1
      `
    );

    const generation = rows[0] || null;
    const url = generation?.storage_url || generation?.result_url || null;
    if (!generation || !url) {
      return res.status(404).json({ message: "الملف غير متوفر للتحميل." });
    }

    let parsed;
    try {
      parsed = new URL(url);
    } catch (_error) {
      return res.status(400).json({ message: "رابط غير صالح للتحميل." });
    }

    if (!["http:", "https:"].includes(parsed.protocol)) {
      return res.status(400).json({ message: "رابط غير صالح للتحميل." });
    }

    const response = await fetch(url, {
      headers: req.headers.range ? { Range: req.headers.range } : undefined,
    });

    if (!response.ok || !response.body) {
      return res.status(502).json({ message: "تعذر تنزيل الملف حاليًا." });
    }

    const contentType =
      response.headers.get("content-type") ||
      generation.mime_type ||
      "application/octet-stream";
    const length = response.headers.get("content-length");
    const contentRange = response.headers.get("content-range");
    const acceptRanges = response.headers.get("accept-ranges");
    const fallbackName = sanitizeFilename(parsed.pathname.split("/").pop());
    const filename = fallbackName || `advancedpro-${id}`;
    const disposition = req.query.inline === "1" ? "inline" : "attachment";

    res.status(response.status === 206 ? 206 : 200);
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `${disposition}; filename="${filename}"`);
    if (length) {
      res.setHeader("Content-Length", length);
    }
    if (contentRange) {
      res.setHeader("Content-Range", contentRange);
    }
    if (acceptRanges) {
      res.setHeader("Accept-Ranges", acceptRanges);
    }

    Readable.fromWeb(response.body).pipe(res);
  })
);

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const authWorkspace = await getAuthWorkspace(req).catch(() => null);
    const activationKeyId = Number(authWorkspace?.activationKeyId);
    const workspaceId = Number(authWorkspace?.workspaceId);

    if (Number.isFinite(id) && Number.isFinite(activationKeyId) && Number.isFinite(workspaceId)) {
      const rows = await withDbRetry(() =>
        prisma.$queryRaw`
          SELECT id, result_url, storage_url, mime_type
          FROM generations
          WHERE id = ${id}
            AND (workspace_id = ${workspaceId} OR (workspace_id IS NULL AND key_id = ${activationKeyId}))
            AND deleted_at IS NULL
          LIMIT 1
        `
      );

      const generation = rows[0] || null;
      const downloadUrl = generation?.storage_url || generation?.result_url || null;
      if (generation && downloadUrl) {
        let parsedStorageUrl;
        try {
          parsedStorageUrl = new URL(downloadUrl);
        } catch (_error) {
          return res.status(400).json({ message: "رابط غير صالح للتحميل." });
        }

        if (!["http:", "https:"].includes(parsedStorageUrl.protocol)) {
          return res.status(400).json({ message: "رابط غير صالح للتحميل." });
        }

        const response = await fetch(downloadUrl, {
          headers: req.headers.range ? { Range: req.headers.range } : undefined,
        });

        if (!response.ok || !response.body) {
          return res.status(502).json({ message: "تعذر تنزيل الملف حاليًا." });
        }

        const contentType =
          response.headers.get("content-type") ||
          generation.mime_type ||
          "application/octet-stream";
        const length = response.headers.get("content-length");
        const contentRange = response.headers.get("content-range");
        const acceptRanges = response.headers.get("accept-ranges");
        const fallbackName = sanitizeFilename(parsedStorageUrl.pathname.split("/").pop());
        const filename = fallbackName || `advancedpro-${id}`;
        const disposition = req.query.inline === "1" ? "inline" : "attachment";

        res.status(response.status === 206 ? 206 : 200);
        res.setHeader("Content-Type", contentType);
        res.setHeader("Content-Disposition", `${disposition}; filename="${filename}"`);
        if (length) {
          res.setHeader("Content-Length", length);
        }
        if (contentRange) {
          res.setHeader("Content-Range", contentRange);
        }
        if (acceptRanges) {
          res.setHeader("Accept-Ranges", acceptRanges);
        }

        Readable.fromWeb(response.body).pipe(res);
        return;
      }
    }

    const keyId = Number(req.cookies?.key_session);

    if (!Number.isFinite(id) || !Number.isFinite(keyId)) {
      return res.status(401).json({ message: "جلسة المفتاح غير صالحة للتحميل." });
    }

    const generation = await prisma.generationJob.findFirst({
      where: { id, keyId },
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

    const response = await fetch(url, {
      headers: req.headers.range ? { Range: req.headers.range } : undefined,
    });

    if (!response.ok || !response.body) {
      return res.status(502).json({ message: "تعذر تنزيل الملف حاليًا." });
    }

    const contentType = response.headers.get("content-type") || "application/octet-stream";
    const length = response.headers.get("content-length");
    const contentRange = response.headers.get("content-range");
    const acceptRanges = response.headers.get("accept-ranges");
    const fallbackName = sanitizeFilename(parsed.pathname.split("/").pop());
    const filename = fallbackName || `advancedpro-${id}`;
    const disposition = req.query.inline === "1" ? "inline" : "attachment";

    res.status(response.status === 206 ? 206 : 200);
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `${disposition}; filename="${filename}"`);
    if (length) {
      res.setHeader("Content-Length", length);
    }
    if (contentRange) {
      res.setHeader("Content-Range", contentRange);
    }
    if (acceptRanges) {
      res.setHeader("Accept-Ranges", acceptRanges);
    }

    Readable.fromWeb(response.body).pipe(res);
  })
);

export default router;
