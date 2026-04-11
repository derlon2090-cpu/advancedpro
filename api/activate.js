const { getPool } = require("./_lib/db");
const { requireAuth } = require("./_lib/auth");
const { methodNotAllowed, readJsonBody, sendJson } = require("./_lib/http");
const { cleanText, normalizeEmail } = require("./_lib/validation");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return methodNotAllowed(res, ["POST"]);
  }

  const user = await requireAuth(req, res);

  if (!user) {
    return;
  }

  let connection;

  try {
    const body = await readJsonBody(req);
    const inputCode = cleanText(body.code, 100).toUpperCase();

    if (!inputCode) {
      return sendJson(res, 422, {
        success: false,
        message: "يرجى إدخال كود التفعيل.",
      });
    }

    connection = await getPool().getConnection();
    await connection.beginTransaction();

    const [codeRows] = await connection.query(
      `SELECT *
       FROM codes
       WHERE code = ?
       LIMIT 1
       FOR UPDATE`,
      [inputCode]
    );

    if (!codeRows.length) {
      await connection.rollback();
      return sendJson(res, 404, {
        success: false,
        message: "الكود غير موجود أو غير صالح.",
      });
    }

    const code = codeRows[0];

    if (!code.is_active) {
      await connection.rollback();
      return sendJson(res, 403, {
        success: false,
        message: "هذا الكود غير فعال حاليًا.",
      });
    }

    if (
      code.assigned_email &&
      normalizeEmail(code.assigned_email) !== normalizeEmail(user.email)
    ) {
      await connection.rollback();
      return sendJson(res, 403, {
        success: false,
        message: "هذا الكود مخصص لحساب آخر، يرجى التواصل مع الدعم.",
      });
    }

    if (Number(code.max_redemptions || 0) > 0 && code.redeemed_count >= code.max_redemptions) {
      await connection.rollback();
      return sendJson(res, 409, {
        success: false,
        message: "تم استهلاك هذا الكود بالكامل.",
      });
    }

    const [existingRedemptionRows] = await connection.query(
      `SELECT id
       FROM code_redemptions
       WHERE user_id = ?
         AND code_id = ?
       LIMIT 1`,
      [user.id, code.id]
    );

    if (existingRedemptionRows.length) {
      await connection.rollback();
      return sendJson(res, 409, {
        success: false,
        message: "تم تفعيل هذا الكود مسبقًا على حسابك.",
      });
    }

    const startAt = new Date();
    const endAt = new Date(startAt);
    endAt.setDate(endAt.getDate() + Number(code.validity_days || 30));

    let nextRenewalAt = null;

    if (code.renewal_enabled && code.renewal_every_days) {
      nextRenewalAt = new Date(startAt);
      nextRenewalAt.setDate(nextRenewalAt.getDate() + Number(code.renewal_every_days));
    }

    const [subscriptionResult] = await connection.query(
      `INSERT INTO user_subscriptions (
         user_id,
         code_id,
         package_name,
         image_balance,
         video_balance,
         video_max_duration_seconds,
         start_at,
         end_at,
         renewal_enabled,
         renewal_every_days,
         renewal_mode,
         renewal_image_quota,
         renewal_video_quota,
         next_renewal_at,
         status
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
      [
        user.id,
        code.id,
        code.plan_name,
        code.image_quota,
        code.video_quota,
        code.video_max_duration_seconds,
        startAt,
        endAt,
        code.renewal_enabled,
        code.renewal_every_days,
        code.renewal_mode,
        code.renewal_image_quota,
        code.renewal_video_quota,
        nextRenewalAt,
      ]
    );

    await connection.query(
      `INSERT INTO code_redemptions (user_id, code_id)
       VALUES (?, ?)`,
      [user.id, code.id]
    );
    await connection.query(
      `UPDATE codes
       SET redeemed_count = redeemed_count + 1
       WHERE id = ?`,
      [code.id]
    );

    await connection.commit();

    return sendJson(res, 200, {
      success: true,
      message: "تم تفعيل الكود وإضافة الاشتراك إلى حسابك.",
      subscriptionId: subscriptionResult.insertId,
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }

    return sendJson(res, 500, {
      success: false,
      message: "تعذر تفعيل الكود حاليًا.",
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
};
