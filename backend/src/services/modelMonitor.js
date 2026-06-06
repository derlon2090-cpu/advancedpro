import { prisma } from "../lib/prisma.js";
import { getSetting, setSetting } from "./settings.js";
import { getReleaseSmokeReport } from "./modelQualityPolicy.js";

export function modelMonitorSettingKey(type, model) {
  return `model_monitor:disabled:${type}:${model}`;
}

export async function getModelMonitorDecision(type, model) {
  if (!type || !model) {
    return { disabled: false, reason: "missing_model" };
  }

  const raw = await getSetting(modelMonitorSettingKey(type, model), null).catch(() => null);
  if (!raw) {
    return { disabled: false, reason: "not_monitored_yet" };
  }

  try {
    const parsed = JSON.parse(raw);
    return {
      disabled: Boolean(parsed.disabled),
      reason: parsed.reason || "monitor_setting",
      checkedAt: parsed.checkedAt || null,
      passed: Number(parsed.passed || 0),
      total: Number(parsed.total || 0),
      label: parsed.label || model,
    };
  } catch (_error) {
    return { disabled: false, reason: "invalid_monitor_setting" };
  }
}

export async function runModelMonitor(db = prisma) {
  const report = await getReleaseSmokeReport(db);
  const monitored = [];

  for (const item of report.registry || []) {
    const shouldDisable = item.type === "image" && (item.total < 5 || item.passed < 4);
    const reason = item.total < 5 ? "missing_smoke_tests" : item.passed < 4 ? "low_smoke_score" : "healthy";
    const payload = {
      disabled: shouldDisable,
      reason,
      type: item.type,
      model: item.model,
      label: item.label,
      passed: item.passed,
      total: item.total,
      releaseReady: Boolean(item.releaseReady),
      checkedAt: report.checkedAt,
    };

    await setSetting(modelMonitorSettingKey(item.type, item.model), JSON.stringify(payload));
    monitored.push(payload);
  }

  await setSetting(
    "model_monitor:last_report",
    JSON.stringify({
      checkedAt: report.checkedAt,
      passed: report.passed,
      status: report.status,
      monitored,
      modelFailures: report.modelFailures || [],
      promptFailures: report.promptFailures || [],
    })
  );

  return {
    ...report,
    monitored,
  };
}

