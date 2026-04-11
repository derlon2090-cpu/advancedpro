const { getPool } = require("../_lib/db");
const { normalizeUser, hashPassword, setSessionCookie } = require("../_lib/auth");
const { methodNotAllowed, readJsonBody, sendJson } = require("../_lib/http");
const { cleanText, isValidEmail, normalizeEmail, validatePassword } = require("../_lib/validation");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return methodNotAllowed(res, ["POST"]);
  }

  try {
    const body = await readJsonBody(req);
    const fullName = cleanText(body.fullName, 150);
    const email = normalizeEmail(body.email);
    const password = String(body.password || "");
    const confirmPassword = String(body.confirmPassword || "");

    if (!fullName) {
      return sendJson(res, 422, {
        success: false,
        message: "يرجى إدخال الاسم الكامل.",
      });
    }

    if (!isValidEmail(email)) {
      return sendJson(res, 422, {
        success: false,
        message: "يرجى إدخال بريد إلكتروني صحيح.",
      });
    }

    const passwordMessage = validatePassword(password);

    if (passwordMessage) {
      return sendJson(res, 422, {
        success: false,
        message: passwordMessage,
      });
    }

    if (password !== confirmPassword) {
      return sendJson(res, 422, {
        success: false,
        message: "تأكيد كلمة المرور غير مطابق.",
      });
    }

    const pool = getPool();
    const [existingUsers] = await pool.query(
      `SELECT id
       FROM users
       WHERE email = ?
       LIMIT 1`,
      [email]
    );

    if (existingUsers.length) {
      return sendJson(res, 409, {
        success: false,
        message: "هذا البريد الإلكتروني مستخدم بالفعل.",
      });
    }

    const passwordHash = await hashPassword(password);
    const [result] = await pool.query(
      `INSERT INTO users (full_name, email, password_hash)
       VALUES (?, ?, ?)`,
      [fullName, email, passwordHash]
    );
    const [rows] = await pool.query(
      `SELECT id, full_name, email, role, status, created_at, updated_at, last_login_at
       FROM users
       WHERE id = ?
       LIMIT 1`,
      [result.insertId]
    );

    const user = normalizeUser(rows[0]);
    setSessionCookie(res, user);

    return sendJson(res, 201, {
      success: true,
      message: "تم إنشاء الحساب بنجاح.",
      redirectTo: "/dashboard",
      user,
    });
  } catch (error) {
    return sendJson(res, 500, {
      success: false,
      message: "تعذر إنشاء الحساب حاليًا.",
    });
  }
};
