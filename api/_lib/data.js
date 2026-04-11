const { getPool } = require("./db");
const { clamp } = require("./validation");

function normalizeSubscription(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    packageName: row.package_name,
    code: row.code || null,
    imageBalance: row.image_balance,
    videoBalance: row.video_balance,
    videoMaxDurationSeconds: row.video_max_duration_seconds,
    startAt: row.start_at,
    endAt: row.end_at,
    renewalEnabled: Boolean(row.renewal_enabled),
    renewalEveryDays: row.renewal_every_days,
    renewalMode: row.renewal_mode,
    renewalImageQuota: row.renewal_image_quota,
    renewalVideoQuota: row.renewal_video_quota,
    nextRenewalAt: row.next_renewal_at,
    status: row.status,
    createdAt: row.created_at,
  };
}

function normalizeUsage(row) {
  return {
    id: row.id,
    type: row.type,
    amountUsed: row.amount_used,
    promptText: row.prompt_text,
    outputUrl: row.output_url,
    createdAt: row.created_at,
    packageName: row.package_name,
  };
}

async function getPrimarySubscription(userId) {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT us.*, c.code
     FROM user_subscriptions us
     LEFT JOIN codes c ON c.id = us.code_id
     WHERE us.user_id = ?
     ORDER BY (us.status = 'active') DESC, us.end_at DESC, us.created_at DESC
     LIMIT 1`,
    [userId]
  );

  return normalizeSubscription(rows[0]);
}

async function getUsageLogs(userId, limit = 8) {
  const pool = getPool();
  const safeLimit = clamp(Number(limit) || 8, 1, 50);
  const [rows] = await pool.query(
    `SELECT ul.id, ul.type, ul.amount_used, ul.prompt_text, ul.output_url, ul.created_at, us.package_name
     FROM usage_logs ul
     INNER JOIN user_subscriptions us ON us.id = ul.subscription_id
     WHERE ul.user_id = ?
     ORDER BY ul.created_at DESC
     LIMIT ${safeLimit}`,
    [userId]
  );

  return rows.map(normalizeUsage);
}

async function getUsageTotals(userId) {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT
        COALESCE(SUM(CASE WHEN type = 'image' THEN amount_used ELSE 0 END), 0) AS images_used,
        COALESCE(SUM(CASE WHEN type = 'video' THEN amount_used ELSE 0 END), 0) AS videos_used
     FROM usage_logs
     WHERE user_id = ?`,
    [userId]
  );

  return {
    imagesUsed: rows[0]?.images_used || 0,
    videosUsed: rows[0]?.videos_used || 0,
  };
}

module.exports = {
  getPrimarySubscription,
  getUsageLogs,
  getUsageTotals,
};
