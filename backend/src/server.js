import app from "./app.js";
import { prisma } from "./lib/prisma.js";
import { getAiKeyStatus } from "./services/aiProvider.js";
import { upsertOwnerFromEnv } from "./services/ownerBootstrap.js";
import { logError, logInfo } from "./utils/logger.js";

const PORT = process.env.PORT || 3000;

process.on("unhandledRejection", (reason) => {
  logError(reason, { scope: "unhandledRejection" });
});

process.on("uncaughtException", (error) => {
  logError(error, { scope: "uncaughtException" });
});

async function connectWithRetry(maxAttempts = 6, baseDelay = 1500) {
  let attempt = 0;
  let delay = baseDelay;

  while (attempt < maxAttempts) {
    attempt += 1;
    try {
      await prisma.$connect();
      logInfo("Database connected");
      await upsertOwnerFromEnv(prisma, {
        info: (message, meta) => logInfo(message, meta),
      });
      return;
    } catch (error) {
      logError("Database connection failed", {
        attempt,
        error: error?.message,
      });

      if (attempt >= maxAttempts) {
        logError("Database connection retries exhausted", {
          attempts: attempt,
        });
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, delay));
      delay = Math.min(delay * 2, 12000);
    }
  }
}

app.listen(PORT, () => {
  logInfo(`Backend running on ${PORT}`);
  logInfo("AI key status", getAiKeyStatus());
});

void connectWithRetry();
