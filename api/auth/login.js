const { getPool } = require("../_lib/db");
const { normalizeUser, setSessionCookie, verifyPassword } = require("../_lib/auth");
const { getIpAddress, methodNotAllowed, readJsonBody, sendJson } = require("../_lib/http");
const { isValidEmail, normalizeEmail } = require("../_lib/validation");

async function recordFailedAttempt(pool, email, ipAddress) {
  await pool.query(
    `INSERT INTO login_attempts (email, ip_address, failed_attempts, locked_until, last_attempt_at)
     VALUES (
       ?,
       ?,
       1,
       NULL,
       NOW()
     )
     ON DUPLICATE KEY UPDATE
       failed_attempts = failed_attempts + 1,
       last_attempt_at = NOW(),
       locked_until = CASE
         WHEN failed_attempts + 1 >= 5 THEN DATE_ADD(NOW(), INTERVAL 15 MINUTE)
         ELSE locked_until
       END`,
    [email, ipAddress]
  );
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return methodNotAllowed(res, ["POST"]);
  }

  try {
    const body = await readJsonBody(req);
    const email = normalizeEmail(body.email);
    const password = String(body.password || "");
    const ipAddress = getIpAddress(req);

    if (!isValidEmail(email) || !password) {
      return sendJson(res, 422, {
        success: false,
        message: "يرجى إدخال البريد الإلكتروني وكلمة المرور بشكل صحيح.",
      });
    }

    const pool = getPool();
    const [attemptRows] = await pool.query(
      `SELECT failed_attempts, locked_until
       FROM login_attempts
       WHERE email = ?
         AND ip_address = ?
       LIMIT 1`,
      [email, ipAddress]
    );

    const lockedUntil = attemptRows[0]?.locked_until ? new Date(attemptRows[0].locked_until) : null;

    if (lockedUntil && lockedUntil > new Date()) {
      return sendJson(res, 429, {
        success: false,
        message: "تم إيقاف المحاولات مؤقتًا. حاول مرة أخرى بعد 15 دقيقة.",
      });
    }

    const [rows] = await pool.query(
      `SELECT id, full_name, email, password_hash, role, status, created_at, updated_at, last_login_at
       FROM users
       WHERE email = ?
       LIMIT 1`,
      [email]
    );

    if (!rows.length) {
      await recordFailedAttempt(pool, email, ipAddress);
      return sendJson(res, 401, {
        success: false,
        message: "بيانات الدخول غير صحيحة.",
      });
    }

    const userRow = rows[0];
    const passwordMatches = await verifyPassword(password, userRow.password_hash);

    if (!passwordMatches) {
      await recordFailedAttempt(pool, email, ipAddress);
      return sendJson(res, 401, {
        success: false,
        message: "بيانات الدخول غير صحيحة.",
      });
    }

    if (userRow.status !== "active") {
      return sendJson(res, 403, {
        success: false,
        message: "الحساب موقوف حاليًا. يرجى التواصل مع الإدارة.",
      });
    }

    await pool.query(
      `UPDATE users
       SET last_login_at = NOW()
       WHERE id = ?`,
      [userRow.id]
    );
    await pool.query(
      `DELETE FROM login_attempts
       WHERE email = ?
         AND ip_address = ?`,
      [email, ipAddress]
    );

    const user = normalizeUser({
      ...userRow,
      last_login_at: new Date(),
    });
    setSessionCookie(res, user);

    return sendJson(res, 200, {
      success: true,
      message: "تم تسجيل الدخول بنجاح.",
      redirectTo: user.role === "admin" ? "/admin" : "/dashboard",
      user,
    });
  } catch (error) {
    return sendJson(res, 500, {
      success: false,
      message: "تعذر تسجيل الدخول حاليًا.",
    });
  }
};
