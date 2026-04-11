const { clearSessionCookie } = require("../_lib/auth");
const { methodNotAllowed, sendJson } = require("../_lib/http");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return methodNotAllowed(res, ["POST"]);
  }

  clearSessionCookie(res);

  return sendJson(res, 200, {
    success: true,
    message: "تم تسجيل الخروج.",
    redirectTo: "/login",
  });
};
