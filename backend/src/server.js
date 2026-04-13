import app from "./app.js";
import { prisma } from "./lib/prisma.js";
import { logError, logInfo } from "./utils/logger.js";

const PORT = process.env.PORT || 3000;

async function connectWithRetry(maxAttempts = 6, baseDelay = 1500) {
  let attempt = 0;
  let delay = baseDelay;

  while (attempt < maxAttempts) {
    attempt += 1;
    try {
      await prisma.$connect();
      logInfo("Database connected");
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
});

void connectWithRetry();
