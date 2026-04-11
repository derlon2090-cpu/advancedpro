const { getPool } = require("../_lib/db");
const { hashPassword, requireAuth, verifyPassword } = require("../_lib/auth");
const { methodNotAllowed, readJsonBody, sendJson } = require("../_lib/http");
const { validatePassword } = require("../_lib/validation");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return methodNotAllowed(res, ["POST"]);
  }

  try {
    const user = await requireAuth(req, res);

    if (!user) {
      return;
    }

    const body = await readJsonBody(req);
    const currentPassword = String(body.currentPassword || "");
    const newPassword = String(body.newPassword || "");
    const confirmPassword = String(body.confirmPassword || "");

    if (!currentPassword || !newPassword || !confirmPassword) {
      return sendJson(res, 422, {
        success: false,
        message: "يرجى تعبئة جميع الحقول.",
      });
    }

    const passwordMessage = validatePassword(newPassword);

    if (passwordMessage) {
      return sendJson(res, 422, {
        success: false,
        message: passwordMessage,
      });
    }

    if (newPassword !== confirmPassword) {
      return sendJson(res, 422, {
        success: false,
        message: "تأكيد كلمة المرور غير مطابق.",
      });
    }

    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT password_hash
       FROM users
       WHERE id = ?
       LIMIT 1`,
      [user.id]
    );

    if (!rows.length) {
      return sendJson(res, 404, {
        success: false,
        message: "المستخدم غير موجود.",
      });
    }

    const matches = await verifyPassword(currentPassword, rows[0].password_hash);

    if (!matches) {
      return sendJson(res, 401, {
        success: false,
        message: "كلمة المرور الحالية غير صحيحة.",
      });
    }

    const passwordHash = await hashPassword(newPassword);
    await pool.query(
      `UPDATE users
       SET password_hash = ?
       WHERE id = ?`,
      [passwordHash, user.id]
    );

    return sendJson(res, 200, {
      success: true,
      message: "تم تغيير كلمة المرور بنجاح.",
    });
  } catch (error) {
    return sendJson(res, 500, {
      success: false,
      message: "تعذر تحديث كلمة المرور.",
    });
  }
};
