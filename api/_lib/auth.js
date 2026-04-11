const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const { getPool } = require("./db");
const { clearCookie, parseCookies, sendJson, setCookie } = require("./http");

const SESSION_COOKIE_NAME = "ap_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 14;

function getSessionSecret() {
  const secret = process.env.APP_SESSION_SECRET;

  if (!secret) {
    throw new Error("Missing APP_SESSION_SECRET");
  }

  return secret;
}

function isSecureCookie() {
  return process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);
}

function normalizeUser(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastLoginAt: row.last_login_at,
  };
}

function createSessionToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
    },
    getSessionSecret(),
    {
      expiresIn: SESSION_MAX_AGE,
    }
  );
}

function setSessionCookie(res, user) {
  setCookie(res, SESSION_COOKIE_NAME, createSessionToken(user), {
    httpOnly: true,
    secure: isSecureCookie(),
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

function clearSessionCookie(res) {
  clearCookie(res, SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: isSecureCookie(),
    sameSite: "Lax",
    path: "/",
  });
}

async function getAuthenticatedUser(req) {
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE_NAME];

  if (!token) {
    return null;
  }

  try {
    const payload = jwt.verify(token, getSessionSecret());
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT id, full_name, email, role, status, created_at, updated_at, last_login_at
       FROM users
       WHERE id = ?
       LIMIT 1`,
      [payload.id]
    );

    if (!rows.length || rows[0].status !== "active") {
      return null;
    }

    return normalizeUser(rows[0]);
  } catch (error) {
    return null;
  }
}

async function requireAuth(req, res) {
  const user = await getAuthenticatedUser(req);

  if (!user) {
    sendJson(res, 401, {
      success: false,
      message: "يرجى تسجيل الدخول أولاً.",
    });
    return null;
  }

  return user;
}

async function requireAdmin(req, res) {
  const user = await requireAuth(req, res);

  if (!user) {
    return null;
  }

  if (user.role !== "admin") {
    sendJson(res, 403, {
      success: false,
      message: "هذه الصفحة مخصصة للإدارة فقط.",
    });
    return null;
  }

  return user;
}

async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

module.exports = {
  clearSessionCookie,
  getAuthenticatedUser,
  hashPassword,
  normalizeUser,
  requireAdmin,
  requireAuth,
  setSessionCookie,
  verifyPassword,
};
