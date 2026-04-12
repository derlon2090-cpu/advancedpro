import app from "./app.js";
import { prisma } from "./lib/prisma.js";
import { logError, logInfo } from "./utils/logger.js";

const PORT = process.env.PORT || 3000;

async function start() {
  await prisma.$connect();
  app.listen(PORT, () => {
    logInfo(`Backend running on ${PORT}`);
  });
}

start().catch((error) => {
  logError("Failed to start server", { error: error?.message });
  process.exit(1);
});
