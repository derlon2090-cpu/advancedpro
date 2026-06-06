import { fileURLToPath } from "url";
import { prisma } from "../lib/prisma.js";
import { runModelMonitor } from "../services/modelMonitor.js";

async function main() {
  const report = await runModelMonitor(prisma);
  const disabled = (report.monitored || []).filter((item) => item.disabled);

  console.log("MODEL_MONITOR_COMPLETE");
  console.log(`Checked at: ${report.checkedAt}`);
  console.log(`Release status: ${report.status}`);
  console.log(`Disabled from auto routing: ${disabled.length}`);

  for (const item of disabled) {
    console.log(
      JSON.stringify(
        {
          type: item.type,
          model: item.model,
          label: item.label,
          passed: item.passed,
          total: item.total,
          reason: item.reason,
        },
        null,
        2
      )
    );
  }
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectRun) {
  main()
    .catch((error) => {
      console.error("MODEL_MONITOR_ERROR");
      console.error(error?.stack || error?.message || error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect().catch(() => {});
    });
}

