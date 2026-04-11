const { methodNotAllowed, readJsonBody, sendJson } = require("../_lib/http");
const { isValidEmail, normalizeEmail } = require("../_lib/validation");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return methodNotAllowed(res, ["POST"]);
  }

  try {
    const body = await readJsonBody(req);
    const email = normalizeEmail(body.email);

    if (!isValidEmail(email)) {
      return sendJson(res, 422, {
        success: false,
        message: "يرجى إدخال بريد إلكتروني صحيح.",
      });
    }

    return sendJson(res, 200, {
      success: true,
      message:
        "تم استلام الطلب. إذا كان البريد مسجلًا فستتم متابعة الاستعادة من خلال الدعم أو لوحة الإدارة.",
    });
  } catch (error) {
    return sendJson(res, 500, {
      success: false,
      message: "تعذر معالجة الطلب حاليًا.",
    });
  }
};
