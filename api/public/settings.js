const { getSettingsMap } = require("../_lib/settings");
const { methodNotAllowed, sendJson } = require("../_lib/http");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return methodNotAllowed(res, ["GET"]);
  }

  try {
    const settings = await getSettingsMap();

    return sendJson(res, 200, {
      success: true,
      settings: {
        storeUrl: settings.store_url || "https://advproai.com",
        supportWhatsapp: settings.support_whatsapp || "966556915980",
        supportWhatsappMessage:
          settings.support_whatsapp_message ||
          "السلام عليكم أبغى الاشتراك في Advanced Pro",
      },
    });
  } catch (error) {
    return sendJson(res, 200, {
      success: true,
      settings: {
        storeUrl: "https://advproai.com",
        supportWhatsapp: "966556915980",
        supportWhatsappMessage: "السلام عليكم أبغى الاشتراك في Advanced Pro",
      },
    });
  }
};
