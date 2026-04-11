const { getPool } = require("../_lib/db");
const { requireAdmin } = require("../_lib/auth");
const { methodNotAllowed, readJsonBody, sendJson } = require("../_lib/http");
const { cleanText, toEnum, toInt } = require("../_lib/validation");

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
            us.id,
            us.package_name,
            us.image_balance,
            us.video_balance,
            us.video_max_duration_seconds,
            us.start_at,
            us.end_at,
            us.next_renewal_at,
            us.status,
            us.created_at,
            u.full_name,
            u.email,
            c.code
         FROM user_subscriptions us
         INNER JOIN users u ON u.id = us.user_id
         LEFT JOIN codes c ON c.id = us.code_id
         WHERE (? = '' OR u.email LIKE ? OR u.full_name LIKE ? OR us.package_name LIKE ? OR COALESCE(c.code, '') LIKE ?)
         ORDER BY us.created_at DESC
         LIMIT 120`,
        [search, keyword, keyword, keyword, keyword]
      );

      return sendJson(res, 200, {
        success: true,
        subscriptions: rows.map((row) => ({
          id: row.id,
          packageName: row.package_name,
          imageBalance: row.image_balance,
          videoBalance: row.video_balance,
          videoMaxDurationSeconds: row.video_max_duration_seconds,
          startAt: row.start_at,
          endAt: row.end_at,
          nextRenewalAt: row.next_renewal_at,
          status: row.status,
          createdAt: row.created_at,
          fullName: row.full_name,
          email: row.email,
          code: row.code,
        })),
      });
    } catch (error) {
      return sendJson(res, 500, {
        success: false,
        message: "تعذر تحميل الاشتراكات.",
      });
    }
  }

  if (req.method === "PATCH") {
    try {
      const body = await readJsonBody(req);
      const id = Number(body.id);
      const status = toEnum(body.status, ["active", "expired", "cancelled"], "active");
      const imageBalance = toInt(body.imageBalance, 0);
      const videoBalance = toInt(body.videoBalance, 0);
      const endAt = body.endAt ? new Date(body.endAt) : null;

      if (!id || !endAt || Number.isNaN(endAt.getTime())) {
        return sendJson(res, 422, {
          success: false,
          message: "بيانات الاشتراك غير صحيحة.",
        });
      }

      await pool.query(
        `UPDATE user_subscriptions
         SET status = ?,
             image_balance = ?,
             video_balance = ?,
             end_at = ?
         WHERE id = ?`,
        [status, imageBalance, videoBalance, endAt, id]
      );

      return sendJson(res, 200, {
        success: true,
        message: "تم تحديث الاشتراك بنجاح.",
      });
    } catch (error) {
      return sendJson(res, 500, {
        success: false,
        message: "تعذر تحديث الاشتراك.",
      });
    }
  }

  return methodNotAllowed(res, ["GET", "PATCH"]);
};
