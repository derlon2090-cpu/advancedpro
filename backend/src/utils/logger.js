import fs from "fs";
import path from "path";

const logFile = process.env.LOG_FILE;

function writeToFile(entry) {
  if (!logFile) {
    return;
  }

  try {
    const dir = path.dirname(logFile);
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(logFile, entry + "\n", "utf8");
  } catch (error) {
    console.error("Failed to write log file:", error);
  }
}

export function logInfo(message, meta = {}) {
  const entry = `[${new Date().toISOString()}] INFO ${message} ${JSON.stringify(meta)}`;
  console.log(entry);
  writeToFile(entry);
}

export function logError(error, meta = {}) {
  const details = error?.stack || error?.message || String(error);
  const entry = `[${new Date().toISOString()}] ERROR ${details} ${JSON.stringify(meta)}`;
  console.error(entry);
  writeToFile(entry);
}
