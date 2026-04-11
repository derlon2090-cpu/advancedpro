const { getPool } = require("../_lib/db");
const { requireAdmin } = require("../_lib/auth");
const { methodNotAllowed, sendJson } = require("../_lib/http");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return methodNotAllowed(res, ["GET"]);
  }

  try {
    const admin = await requireAdmin(req, res);

    if (!admin) {
      return;
    }

    const pool = getPool();
    const [[usersRow], [subscriptionsRow], [codesRow], [usageRow]] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) AS total_users,
                SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) AS total_admins
         FROM users`
      ),
      pool.query(
        `SELECT COUNT(*) AS active_subscriptions
         FROM user_subscriptions
         WHERE status = 'active'
           AND end_at >= NOW()`
      ),
      pool.query(
        `SELECT COUNT(*) AS active_codes
         FROM codes
         WHERE is_active = 1`
      ),
      pool.query(
        `SELECT COUNT(*) AS requests_last_7_days
         FROM usage_logs
         WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)`
      ),
    ]);

    return sendJson(res, 200, {
      success: true,
      summary: {
        totalUsers: usersRow.total_users || 0,
        totalAdmins: usersRow.total_admins || 0,
        activeSubscriptions: subscriptionsRow.active_subscriptions || 0,
        activeCodes: codesRow.active_codes || 0,
        requestsLast7Days: usageRow.requests_last_7_days || 0,
      },
      admin,
    });
  } catch (error) {
    return sendJson(res, 500, {
      success: false,
      message: "تعذر تحميل ملخص الإدارة.",
    });
  }
};
