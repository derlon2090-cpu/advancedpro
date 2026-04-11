const { requireAuth } = require("./_lib/auth");
const { methodNotAllowed, sendJson } = require("./_lib/http");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return methodNotAllowed(res, ["GET"]);
  }

  const user = await requireAuth(req, res);

  if (!user) {
    return;
  }

  return sendJson(res, 200, {
    success: true,
    user,
  });
};
