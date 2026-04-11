const { getPool } = require("../_lib/db");
const { requireAuth } = require("../_lib/auth");
const { getPrimarySubscription, getUsageLogs, getUsageTotals } = require("../_lib/data");
const { methodNotAllowed, readJsonBody, sendJson } = require("../_lib/http");
const { cleanText } = require("../_lib/validation");

module.exports = async function handler(req, res) {
  if (req.method === "GET") {
    try {
      const user = await requireAuth(req, res);

      if (!user) {
        return;
      }

      const [subscription, usageTotals, recentUsage] = await Promise.all([
        getPrimarySubscription(user.id),
        getUsageTotals(user.id),
        getUsageLogs(user.id, 10),
      ]);

      return sendJson(res, 200, {
        success: true,
        profile: {
          user,
          subscription,
          usageTotals,
          recentUsage,
        },
      });
    } catch (error) {
      return sendJson(res, 500, {
        success: false,
        message: "تعذر تحميل الملف الشخصي.",
      });
    }
  }

  if (req.method === "PATCH") {
    try {
      const user = await requireAuth(req, res);

      if (!user) {
        return;
      }

      const body = await readJsonBody(req);
      const fullName = cleanText(body.fullName, 150);

      if (!fullName) {
        return sendJson(res, 422, {
          success: false,
          message: "يرجى إدخال الاسم الكامل.",
        });
      }

      const pool = getPool();
      await pool.query(
        `UPDATE users
         SET full_name = ?
         WHERE id = ?`,
        [fullName, user.id]
      );
      const [rows] = await pool.query(
        `SELECT id, full_name, email, role, status, created_at, updated_at, last_login_at
         FROM users
         WHERE id = ?
         LIMIT 1`,
        [user.id]
      );

      return sendJson(res, 200, {
        success: true,
        message: "تم تحديث الاسم بنجاح.",
        user: {
          id: rows[0].id,
          fullName: rows[0].full_name,
          email: rows[0].email,
          role: rows[0].role,
          status: rows[0].status,
          createdAt: rows[0].created_at,
          updatedAt: rows[0].updated_at,
          lastLoginAt: rows[0].last_login_at,
        },
      });
    } catch (error) {
      return sendJson(res, 500, {
        success: false,
        message: "تعذر تحديث الملف الشخصي.",
      });
    }
  }

  return methodNotAllowed(res, ["GET", "PATCH"]);
};
