import crypto from "node:crypto";

function missingEnv(name) {
  const error = new Error(`Missing required storage configuration: ${name}`);
  error.statusCode = 500;
  throw error;
}

function getConfig() {
  const accessKeyId = String(process.env.B2_ACCESS_KEY_ID || "").trim();
  const secretAccessKey = String(process.env.B2_SECRET_ACCESS_KEY || "").trim();
  const bucketName = String(process.env.B2_BUCKET_NAME || "").trim();
  const endpoint = String(process.env.B2_ENDPOINT || "").trim();
  const region = String(process.env.B2_REGION || "us-east-005").trim();
  const publicBaseUrl = String(process.env.B2_PUBLIC_BASE_URL || "").trim().replace(/\/$/, "");

  if (!accessKeyId) missingEnv("B2_ACCESS_KEY_ID");
  if (!secretAccessKey) missingEnv("B2_SECRET_ACCESS_KEY");
  if (!bucketName) missingEnv("B2_BUCKET_NAME");
  if (!endpoint) missingEnv("B2_ENDPOINT");

  return {
    accessKeyId,
    secretAccessKey,
    bucketName,
    endpoint: endpoint.replace(/\/$/, ""),
    region,
    publicBaseUrl,
  };
}

function hmac(key, value, encoding) {
  return crypto.createHmac("sha256", key).update(value, "utf8").digest(encoding);
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function isoDate(now) {
  return now.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function shortDate(amzDate) {
  return amzDate.slice(0, 8);
}

function signKey(secretAccessKey, dateStamp, region, service = "s3") {
  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, "aws4_request");
}

function canonicalHeaders(host, payloadHash, amzDate) {
  return [
    `host:${host}`,
    `x-amz-content-sha256:${payloadHash}`,
    `x-amz-date:${amzDate}`,
    "",
  ].join("\n");
}

function authorizationHeader({ accessKeyId, secretAccessKey, region, host, method, pathname, payloadHash, amzDate }) {
  const dateStamp = shortDate(amzDate);
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = [
    method,
    pathname,
    "",
    canonicalHeaders(host, payloadHash, amzDate),
    signedHeaders,
    payloadHash,
  ].join("\n");

  const scope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const signature = hmac(signKey(secretAccessKey, dateStamp, region), stringToSign, "hex");
  return `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

function emptyPayloadHash() {
  return sha256Hex("");
}

function extensionFromMimeType(mimeType = "") {
  const normalized = String(mimeType || "").toLowerCase();
  if (normalized.includes("image/png")) return "png";
  if (normalized.includes("image/webp")) return "webp";
  if (normalized.includes("image/jpeg") || normalized.includes("image/jpg")) return "jpg";
  if (normalized.includes("video/mp4")) return "mp4";
  if (normalized.includes("video/webm")) return "webm";
  return "bin";
}

export function buildGenerationStorageKey({ workspaceId, generationId, mimeType }) {
  const extension = extensionFromMimeType(mimeType);
  return `workspaces/${workspaceId}/generations/${generationId}/original.${extension}`;
}

export async function downloadRemoteAsset(sourceUrl) {
  const response = await fetch(sourceUrl, {
    cache: "no-store",
    headers: {
      Accept: "*/*",
      "Cache-Control": "no-store",
    },
  });

  if (!response.ok) {
    const error = new Error(`Failed to download generated asset. HTTP ${response.status}`);
    error.statusCode = 502;
    throw error;
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  const mimeType = String(response.headers.get("content-type") || "application/octet-stream")
    .split(";")[0]
    .trim();

  return {
    bytes,
    mimeType,
    fileSize: bytes.length,
  };
}

export async function uploadBufferToB2({ key, bytes, mimeType }) {
  const config = getConfig();
  const endpoint = new URL(config.endpoint);
  const host = endpoint.host;
  const pathname = `/${config.bucketName}/${String(key || "").replace(/^\/+/, "")}`;
  const url = `${config.endpoint}${pathname}`;
  const amzDate = isoDate(new Date());
  const payloadHash = sha256Hex(bytes);
  const authorization = authorizationHeader({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    region: config.region,
    host,
    method: "PUT",
    pathname,
    payloadHash,
    amzDate,
  });

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": mimeType || "application/octet-stream",
      "Content-Length": String(bytes.length),
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
      Authorization: authorization,
    },
    body: bytes,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    const error = new Error(`Failed to upload generated asset to storage. HTTP ${response.status}${text ? `: ${text}` : ""}`);
    error.statusCode = 502;
    throw error;
  }

  const storageUrl = config.publicBaseUrl
    ? `${config.publicBaseUrl}/${config.bucketName}/${String(key).replace(/^\/+/, "")}`
    : url;

  return {
    storageKey: key,
    storageUrl,
  };
}

export async function fetchObjectFromB2({ key, range } = {}) {
  const config = getConfig();
  const endpoint = new URL(config.endpoint);
  const host = endpoint.host;
  const pathname = `/${config.bucketName}/${String(key || "").replace(/^\/+/, "")}`;
  const url = `${config.endpoint}${pathname}`;
  const amzDate = isoDate(new Date());
  const payloadHash = emptyPayloadHash();
  const authorization = authorizationHeader({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    region: config.region,
    host,
    method: "GET",
    pathname,
    payloadHash,
    amzDate,
  });

  const headers = {
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    Authorization: authorization,
  };

  if (range) {
    headers.Range = range;
  }

  return fetch(url, {
    method: "GET",
    headers,
  });
}
