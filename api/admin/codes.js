const { getPool } = require("../_lib/db");
const { requireAdmin } = require("../_lib/auth");
const { methodNotAllowed, readJsonBody, sendJson } = require("../_lib/http");
const {
  cleanText,
  isValidEmail,
  normalizeEmail,
  toEnum,
  toFlag,
  toInt,
  toNullableInt,
} = require("../_lib/validation");

function buildCodePayload(body) {
  const assignedEmail = cleanText(body.assignedEmail, 191);

  if (assignedEmail && !isValidEmail(assignedEmail)) {
    return {
      error: "البريد المخصص للكود غير صحيح.",
    };
  }

  return {
    code: cleanText(body.code, 100).toUpperCase(),
    planName: cleanText(body.planName, 150),
    imageQuota: toInt(body.imageQuota, 0),
    videoQuota: toInt(body.videoQuota, 0),
    videoMaxDurationSeconds: toInt(body.videoMaxDurationSeconds, 5),
    validityDays: toInt(body.validityDays, 30),
    renewalEnabled: toFlag(body.renewalEnabled),
    renewalEveryDays: toNullableInt(body.renewalEveryDays),
    renewalMode: toEnum(body.renewalMode, ["topup", "reset"], "topup"),
    renewalImageQuota: toInt(body.renewalImageQuota, 0),
    renewalVideoQuota: toInt(body.renewalVideoQuota, 0),
    maxRedemptions: toInt(body.maxRedemptions, 1),
    isActive: toFlag(body.isActive),
    assignedEmail: assignedEmail ? normalizeEmail(assignedEmail) : null,
  };
}

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
        `SELECT *
         FROM codes
         WHERE (? = '' OR code LIKE ? OR plan_name LIKE ? OR COALESCE(assigned_email, '') LIKE ?)
         ORDER BY created_at DESC
         LIMIT 120`,
        [search, keyword, keyword, keyword]
      );

      return sendJson(res, 200, {
        success: true,
        codes: rows.map((row) => ({
          id: row.id,
          code: row.code,
          planName: row.plan_name,
          imageQuota: row.image_quota,
          videoQuota: row.video_quota,
          videoMaxDurationSeconds: row.video_max_duration_seconds,
          validityDays: row.validity_days,
          renewalEnabled: Boolean(row.renewal_enabled),
          renewalEveryDays: row.renewal_every_days,
          renewalMode: row.renewal_mode,
          renewalImageQuota: row.renewal_image_quota,
          renewalVideoQuota: row.renewal_video_quota,
          maxRedemptions: row.max_redemptions,
          redeemedCount: row.redeemed_count,
          isActive: Boolean(row.is_active),
          assignedEmail: row.assigned_email,
          createdAt: row.created_at,
        })),
      });
    } catch (error) {
      return sendJson(res, 500, {
        success: false,
        message: "تعذر تحميل الأكواد.",
      });
    }
  }

  if (req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      const payload = buildCodePayload(body);

      if (payload.error) {
        return sendJson(res, 422, {
          success: false,
          message: payload.error,
        });
      }

      if (!payload.code || !payload.planName) {
        return sendJson(res, 422, {
          success: false,
          message: "الكود واسم الباقة مطلوبان.",
        });
      }

      await pool.query(
        `INSERT INTO codes (
           code,
           plan_name,
           image_quota,
           video_quota,
           video_max_duration_seconds,
           validity_days,
           renewal_enabled,
           renewal_every_days,
           renewal_mode,
           renewal_image_quota,
           renewal_video_quota,
           max_redemptions,
           is_active,
           assigned_email
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          payload.code,
          payload.planName,
          payload.imageQuota,
          payload.videoQuota,
          payload.videoMaxDurationSeconds,
          payload.validityDays,
          payload.renewalEnabled,
          payload.renewalEveryDays,
          payload.renewalMode,
          payload.renewalImageQuota,
          payload.renewalVideoQuota,
          payload.maxRedemptions,
          payload.isActive,
          payload.assignedEmail,
        ]
      );

      return sendJson(res, 201, {
        success: true,
        message: "تم إنشاء الكود بنجاح.",
      });
    } catch (error) {
      return sendJson(res, 500, {
        success: false,
        message: "تعذر إنشاء الكود.",
      });
    }
  }

  if (req.method === "PATCH") {
    try {
      const body = await readJsonBody(req);
      const id = Number(body.id);
      const payload = buildCodePayload(body);

      if (!id) {
        return sendJson(res, 422, {
          success: false,
          message: "معرف الكود غير صالح.",
        });
      }

      if (payload.error) {
        return sendJson(res, 422, {
          success: false,
          message: payload.error,
        });
      }

      await pool.query(
        `UPDATE codes
         SET code = ?,
             plan_name = ?,
             image_quota = ?,
             video_quota = ?,
             video_max_duration_seconds = ?,
             validity_days = ?,
             renewal_enabled = ?,
             renewal_every_days = ?,
             renewal_mode = ?,
             renewal_image_quota = ?,
             renewal_video_quota = ?,
             max_redemptions = ?,
             is_active = ?,
             assigned_email = ?
         WHERE id = ?`,
        [
          payload.code,
          payload.planName,
          payload.imageQuota,
          payload.videoQuota,
          payload.videoMaxDurationSeconds,
          payload.validityDays,
          payload.renewalEnabled,
          payload.renewalEveryDays,
          payload.renewalMode,
          payload.renewalImageQuota,
          payload.renewalVideoQuota,
          payload.maxRedemptions,
          payload.isActive,
          payload.assignedEmail,
          id,
        ]
      );

      return sendJson(res, 200, {
        success: true,
        message: "تم تحديث الكود بنجاح.",
      });
    } catch (error) {
      return sendJson(res, 500, {
        success: false,
        message: "تعذر تحديث الكود.",
      });
    }
  }

  return methodNotAllowed(res, ["GET", "POST", "PATCH"]);
};
