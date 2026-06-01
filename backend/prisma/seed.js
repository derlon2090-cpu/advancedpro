import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const ownerEmail = process.env.OWNER_EMAIL || process.env.ADMIN_EMAIL || "";
  const ownerPassword = process.env.OWNER_PASSWORD || process.env.ADMIN_PASSWORD || "";
  const ownerName = process.env.OWNER_NAME || "Owner";
  let adminEmail = ownerEmail || "not-created";

  const adminCount = await prisma.user.count({
    where: { role: { in: ["owner", "admin"] } },
  });

  if (adminCount === 0 && ownerEmail && ownerPassword) {
    const passwordHash = await bcrypt.hash(ownerPassword, 10);
    await prisma.user.create({
      data: {
        fullName: ownerName,
        email: ownerEmail.toLowerCase(),
        passwordHash,
        role: "owner",
        status: "active",
      },
    });
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
