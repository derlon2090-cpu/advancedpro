function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createTimeoutError(timeoutMs) {
  const error = new Error(`Database operation timed out after ${timeoutMs}ms`);
  error.code = "P1001";
  return error;
}

async function withTimeout(task, timeoutMs) {
  if (!timeoutMs || timeoutMs <= 0) {
    return task();
  }

  let timeoutId;
  try {
    return await Promise.race([
      task(),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(createTimeoutError(timeoutMs)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

export function isTransientDatabaseError(error) {
  const message = String(error?.message || "");
  const code = String(error?.code || "");

  return (
    code === "P1000" ||
    code === "P1001" ||
    code === "P1017" ||
    message.includes("Can't reach database server") ||
    message.includes("terminating connection due to administrator command") ||
    message.includes("Server has closed the connection") ||
    message.includes("Connection terminated unexpectedly") ||
    message.includes("ECONNRESET")
  );
}

export async function withDbRetry(task, options = {}) {
  const attempts = Number(options.attempts || 3);
  const delayMs = Number(options.delayMs || 700);
  const timeoutMs = Number(options.timeoutMs || 10000);
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await withTimeout(() => task(attempt), timeoutMs);
    } catch (error) {
      lastError = error;
      if (!isTransientDatabaseError(error) || attempt === attempts) {
        throw error;
      }

      await wait(delayMs * attempt);
    }
  }

  throw lastError;
}
