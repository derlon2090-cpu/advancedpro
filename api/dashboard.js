const { requireAuth } = require("./_lib/auth");
const { getPrimarySubscription, getUsageLogs, getUsageTotals } = require("./_lib/data");
const { methodNotAllowed, sendJson } = require("./_lib/http");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return methodNotAllowed(res, ["GET"]);
  }

  try {
    const user = await requireAuth(req, res);

    if (!user) {
      return;
    }

    const [subscription, usageTotals, recentUsage] = await Promise.all([
      getPrimarySubscription(user.id),
      getUsageTotals(user.id),
      getUsageLogs(user.id, 8),
    ]);

    return sendJson(res, 200, {
      success: true,
      dashboard: {
        user,
        subscription,
        usageTotals,
        recentUsage,
      },
    });
  } catch (error) {
    return sendJson(res, 500, {
      success: false,
      message: "تعذر تحميل لوحة التحكم.",
    });
  }
};
