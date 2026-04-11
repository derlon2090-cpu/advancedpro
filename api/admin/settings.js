const { requireAdmin } = require("../_lib/auth");
const { methodNotAllowed, readJsonBody, sendJson } = require("../_lib/http");
const { getSettingsMap, upsertSettings } = require("../_lib/settings");
const { cleanText } = require("../_lib/validation");

module.exports = async function handler(req, res) {
  const admin = await requireAdmin(req, res);

  if (!admin) {
    return;
  }

  if (req.method === "GET") {
    try {
      const settings = await getSettingsMap();

      return sendJson(res, 200, {
        success: true,
        settings,
      });
    } catch (error) {
      return sendJson(res, 500, {
        success: false,
        message: "تعذر تحميل الإعدادات.",
      });
    }
  }

  if (req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      const payload = {
        store_url: cleanText(body.storeUrl, 255),
        support_whatsapp: cleanText(body.supportWhatsapp, 40),
        support_whatsapp_message: cleanText(body.supportWhatsappMessage, 255),
      };

      await upsertSettings(payload);

      return sendJson(res, 200, {
        success: true,
        message: "تم حفظ الإعدادات.",
      });
    } catch (error) {
      return sendJson(res, 500, {
        success: false,
        message: "تعذر حفظ الإعدادات.",
      });
    }
  }

  return methodNotAllowed(res, ["GET", "POST"]);
};
