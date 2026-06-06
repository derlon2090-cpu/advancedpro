import { prisma } from "../lib/prisma.js";
import { getReleaseSmokeReport } from "../services/modelQualityPolicy.js";
import { fileURLToPath } from "url";

function printFailure(title, items) {
  if (!items?.length) return;
  console.error(`\n${title}`);
  for (const item of items) {
    console.error(JSON.stringify(item, null, 2));
  }
}

async function main() {
  const report = await getReleaseSmokeReport(prisma);

  if (report.passed) {
    console.log("MODEL_SMOKE_TEST_PASSED");
    console.log(`Checked at: ${report.checkedAt}`);
    console.log(`Models checked: ${report.registry.length}`);
    return;
  }

  console.error("MODEL_SMOKE_TEST_FAILED: deployment blocked.");
  console.error(`Checked at: ${report.checkedAt}`);
  printFailure("Model failures:", report.modelFailures);
  printFailure("Prompt failures:", report.promptFailures);
  process.exitCode = 1;
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectRun) {
  main()
    .catch((error) => {
      console.error("MODEL_SMOKE_TEST_ERROR");
      console.error(error?.stack || error?.message || error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect().catch(() => {});
    });
}
