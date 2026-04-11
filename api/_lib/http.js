function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function methodNotAllowed(res, methods) {
  res.setHeader("Allow", methods.join(", "));
  return sendJson(res, 405, {
    success: false,
    message: "الطريقة غير مدعومة لهذا الطلب.",
  });
}

function parseCookies(req) {
  const header = req.headers.cookie || "";

  return header.split(";").reduce((cookies, part) => {
    const [rawName, ...rawValue] = part.trim().split("=");

    if (!rawName) {
      return cookies;
    }

    cookies[rawName] = decodeURIComponent(rawValue.join("=") || "");
    return cookies;
  }, {});
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }

  if (typeof req.body === "string") {
    return req.body ? JSON.parse(req.body) : {};
  }

  const chunks = [];

  for await (const chunk of req) {
    chunks.push(chunk);
  }

  if (!chunks.length) {
    return {};
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function appendResponseHeader(res, name, value) {
  const current = res.getHeader(name);

  if (!current) {
    res.setHeader(name, value);
    return;
  }

  if (Array.isArray(current)) {
    res.setHeader(name, [...current, value]);
    return;
  }

  res.setHeader(name, [current, value]);
}

function serializeCookie(name, value, options = {}) {
  const segments = [`${name}=${encodeURIComponent(value)}`];

  if (options.maxAge) {
    segments.push(`Max-Age=${options.maxAge}`);
  }

  if (options.expires) {
    segments.push(`Expires=${options.expires.toUTCString()}`);
  }

  segments.push(`Path=${options.path || "/"}`);

  if (options.httpOnly) {
    segments.push("HttpOnly");
  }

  if (options.secure) {
    segments.push("Secure");
  }

  if (options.sameSite) {
    segments.push(`SameSite=${options.sameSite}`);
  }

  return segments.join("; ");
}

function setCookie(res, name, value, options = {}) {
  appendResponseHeader(res, "Set-Cookie", serializeCookie(name, value, options));
}

function clearCookie(res, name, options = {}) {
  setCookie(res, name, "", {
    ...options,
    expires: new Date(0),
    maxAge: 0,
  });
}

function getIpAddress(req) {
  const forwarded = req.headers["x-forwarded-for"];

  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }

  return req.socket?.remoteAddress || "";
}

module.exports = {
  clearCookie,
  getIpAddress,
  methodNotAllowed,
  parseCookies,
  readJsonBody,
  sendJson,
  setCookie,
};
