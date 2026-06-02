import { PrismaClient } from "@prisma/client";
import { upsertOwnerFromEnv } from "../src/services/ownerBootstrap.js";

const prisma = new PrismaClient();

async function main() {
  const ownerEmail = process.env.OWNER_EMAIL || process.env.ADMIN_EMAIL || "";
  const ownerPassword = process.env.OWNER_PASSWORD || process.env.ADMIN_PASSWORD || "";
  let adminEmail = ownerEmail || "not-created";

  if (ownerEmail && ownerPassword) {
    await upsertOwnerFromEnv(prisma);
    adminEmail = ownerEmail;
  }

  await prisma.siteSetting.upsert({
    where: { key: "store_url" },
    update: { value: process.env.STORE_URL || "https://advproai.com" },
    create: { key: "store_url", value: process.env.STORE_URL || "https://advproai.com" },
  });

  await prisma.siteSetting.upsert({
    where: { key: "support_whatsapp" },
    update: { value: process.env.SUPPORT_WHATSAPP || "966556915980" },
    create: {
      key: "support_whatsapp",
      value: process.env.SUPPORT_WHATSAPP || "966556915980",
    },
  });

  await prisma.siteSetting.upsert({
    where: { key: "support_whatsapp_message" },
    update: {
      value:
        process.env.SUPPORT_WHATSAPP_MESSAGE ||
        "السلام عليكم أبغى الاشتراك في Advanced Pro",
    },
    create: {
      key: "support_whatsapp_message",
      value:
        process.env.SUPPORT_WHATSAPP_MESSAGE ||
        "السلام عليكم أبغى الاشتراك في Advanced Pro",
    },
  });

  const starterCode = await prisma.code.upsert({
    where: { code: "ADV-STARTER-15" },
    update: {},
    create: {
      code: "ADV-STARTER-15",
      planName: "Starter 15",
      imageQuota: 50,
      videoQuota: 10,
      videoMaxDurationSeconds: 60,
      validityDays: 15,
      renewalEnabled: false,
      maxRedemptions: 1,
    },
  });

  console.log("Seed completed:", {
    adminEmail,
    starterCode: starterCode.code,
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
