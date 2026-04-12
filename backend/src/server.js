import app from "./app.js";
import { prisma } from "./lib/prisma.js";

const PORT = process.env.PORT || 3000;

async function start() {
  await prisma.$connect();
  app.listen(PORT, () => {
    console.log(`Backend running on ${PORT}`);
  });
}

start().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
