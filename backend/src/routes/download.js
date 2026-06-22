import { Router } from "express";
import { Readable } from "node:stream";
import { asyncHandler } from "../utils/asyncHandler.js";
import { prisma } from "../lib/prisma.js";
import { getAuthWorkspace } from "../middleware/auth.js";
import { fetchObjectFromB2 } from "../services/b2Storage.js";
import { withDbRetry } from "../utils/dbRetry.js";

const router = Router();

function sanitizeFilename(name) {
  return String(name || "download")
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 120);
}

function isSupportedRemoteUrl(value) {
  try {
    const parsed = new URL(String(value || ""));
    return ["http:", "https:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}

async function fetchRemoteAsset(url, req) {
  if (!isSupportedRemoteUrl(url)) {
    return null;
  }

  const response = await fetch(url, {
    headers: req.headers.range ? { Range: req.headers.range } : undefined,
  }).catch(() => null);

  if (!response?.ok || !response.body) {
    return null;
  }

  return response;
}

async function fetchStoredGenerationAsset(generation, req) {
  if (generation?.storage_key) {
    const storageResponse = await fetchObjectFromB2({
      key: generation.storage_key,
      range: req.headers.range,
    }).catch(() => null);

    if (storageResponse?.ok && storageResponse.body) {
      return {
        response: storageResponse,
        sourceUrl: generation.storage_url || generation.result_url || "",
      };
    }
  }

  const remoteCandidates = [generation?.storage_url, generation?.result_url].filter(Boolean);
  for (const candidate of remoteCandidates) {
    const response = await fetchRemoteAsset(candidate, req);
    if (response) {
      return {
        response,
        sourceUrl: candidate,
      };
    }
  }

  return null;
}

function applyStreamingHeaders({ res, response, generationId, sourceUrl, mimeType, inline }) {
  let fallbackName = `advancedpro-${generationId}`;

  try {
    fallbackName = sanitizeFilename(new URL(sourceUrl).pathname.split("/").pop()) || fallbackName;
  } catch {
    // Keep fallback name when sourceUrl is not absolute.
  }

  res.status(response.status === 206 ? 206 : 200);
  res.setHeader(
    "Content-Type",
    response.headers.get("content-type") || mimeType || "application/octet-stream"
  );
  res.setHeader(
    "Content-Disposition",
    `${inline ? "inline" : "attachment"}; filename="${fallbackName}"`
  );

  const length = response.headers.get("content-length");
  const contentRange = response.headers.get("content-range");
  const acceptRanges = response.headers.get("accept-ranges");

  if (length) {
    res.setHeader("Content-Length", length);
  }
  if (contentRange) {
    res.setHeader("Content-Range", contentRange);
  }
  if (acceptRanges) {
    res.setHeader("Accept-Ranges", acceptRanges);
  }
}

async function streamWorkspaceGeneration(req, res, { id, keyId, workspaceId }) {
  const rows = await withDbRetry(() =>
    prisma.$queryRaw`
      SELECT id, result_url, storage_url, storage_key, mime_type
      FROM generations
      WHERE id = ${id}
        AND (workspace_id = ${workspaceId} OR (workspace_id IS NULL AND key_id = ${keyId}))
        AND deleted_at IS NULL
      LIMIT 1
    `
  );

  const generation = rows[0] || null;
  const asset = generation ? await fetchStoredGenerationAsset(generation, req) : null;
  if (!generation || !asset) {
    return false;
  }

  applyStreamingHeaders({
    res,
    response: asset.response,
    generationId: id,
    sourceUrl: asset.sourceUrl,
    mimeType: generation.mime_type,
    inline: req.query.inline === "1",
  });
  Readable.fromWeb(asset.response.body).pipe(res);
  return true;
}

router.get(
  "/v2/:id",
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const auth = await getAuthWorkspace(req);
    const keyId = auth.activationKeyId;
    const workspaceId = auth.workspaceId;

    if (!Number.isFinite(id) || !Number.isFinite(keyId) || !Number.isFinite(workspaceId)) {
      return res.status(401).json({ message: "Ã·”… «·„› «Õ €Ì— ’«·Õ… ·· Õ„Ì·." });
    }

    const streamed = await streamWorkspaceGeneration(req, res, { id, keyId, workspaceId });
    if (!streamed) {
      return res.status(404).json({ message: "«·„·› €Ì— „ Ê›— ·· Õ„Ì·." });
    }
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
      const streamed = await streamWorkspaceGeneration(req, res, {
        id,
        keyId: activationKeyId,
        workspaceId,
      });
      if (streamed) {
        return;
      }
    }

    const keyId = Number(req.cookies?.key_session);

    if (!Number.isFinite(id) || !Number.isFinite(keyId)) {
      return res.status(401).json({ message: "Ã·”… «·„› «Õ €Ì— ’«·Õ… ·· Õ„Ì·." });
    }

    const generation = await prisma.generationJob.findFirst({
      where: { id, keyId },
    });

    if (!generation || !generation.resultUrl) {
      return res.status(404).json({ message: "«·„·› €Ì— „ Ê›— ·· Õ„Ì·." });
    }

    const response = await fetchRemoteAsset(generation.resultUrl, req);
    if (!response) {
      return res.status(502).json({ message: " ⁄–—  ‰“Ì· «·„·› Õ«·Ì«." });
    }

    applyStreamingHeaders({
      res,
      response,
      generationId: id,
      sourceUrl: generation.resultUrl,
      mimeType: null,
      inline: req.query.inline === "1",
    });
    Readable.fromWeb(response.body).pipe(res);
  })
);

export default router;
