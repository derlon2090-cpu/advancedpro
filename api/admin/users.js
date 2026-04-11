const { getPool } = require("../_lib/db");
const { requireAdmin } = require("../_lib/auth");
const { methodNotAllowed, readJsonBody, sendJson } = require("../_lib/http");
const { cleanText, toEnum } = require("../_lib/validation");

module.exports = async function handler(req, res) {
  const admin = await requireAdmin(req, res);

  if (!admin) {
    return;
  }

  const pool = getPool();

  if (req.method === "GET") {
    try {
      const url = new URL(req.url, "http://localhost");
      const search = cleanText(url.searchParams.get("search"), 120);
      const keyword = `%${search}%`;
      const [rows] = await pool.query(
        `SELECT
            u.id,
            u.full_name,
            u.email,
            u.role,
            u.status,
            u.created_at,
            u.last_login_at,
            (
              SELECT package_name
              FROM user_subscriptions us
              WHERE us.user_id = u.id
              ORDER BY (us.status = 'active') DESC, us.end_at DESC, us.created_at DESC
              LIMIT 1
            ) AS current_package,
            (
              SELECT end_at
              FROM user_subscriptions us
              WHERE us.user_id = u.id
              ORDER BY (us.status = 'active') DESC, us.end_at DESC, us.created_at DESC
              LIMIT 1
            ) AS subscription_end_at
         FROM users u
         WHERE (? = '' OR u.full_name LIKE ? OR u.email LIKE ?)
         ORDER BY u.created_at DESC
         LIMIT 100`,
        [search, keyword, keyword]
      );

      return sendJson(res, 200, {
        success: true,
        users: rows.map((row) => ({
          id: row.id,
          fullName: row.full_name,
          email: row.email,
          role: row.role,
          status: row.status,
          createdAt: row.created_at,
          lastLoginAt: row.last_login_at,
          currentPackage: row.current_package,
          subscriptionEndAt: row.subscription_end_at,
        })),
      });
    } catch (error) {
      return sendJson(res, 500, {
        success: false,
        message: "تعذر تحميل المستخدمين.",
      });
    }
  }

  if (req.method === "PATCH") {
    try {
      const body = await readJsonBody(req);
      const id = Number(body.id);
      const status = toEnum(body.status, ["active", "suspended"], "active");
      const role = toEnum(body.role, ["user", "admin"], "user");

      if (!id) {
        return sendJson(res, 422, {
          success: false,
          message: "معرف المستخدم غير صالح.",
        });
      }

      await pool.query(
        `UPDATE users
         SET status = ?, role = ?
         WHERE id = ?`,
        [status, role, id]
      );

      return sendJson(res, 200, {
        success: true,
        message: "تم تحديث المستخدم بنجاح.",
      });
    } catch (error) {
      return sendJson(res, 500, {
        success: false,
        message: "تعذر تحديث المستخدم.",
      });
    }
  }

  return methodNotAllowed(res, ["GET", "PATCH"]);
};
