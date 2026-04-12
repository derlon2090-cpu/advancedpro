import { prisma } from "../lib/prisma.js";

export async function getSetting(key, fallback = null) {
  const record = await prisma.siteSetting.findUnique({ where: { key } });
  return record?.value ?? fallback;
}

export async function setSetting(key, value) {
  return prisma.siteSetting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

export async function getPublicSettings() {
  const storeUrl = await getSetting("store_url", process.env.STORE_URL || "https://advproai.com");
  const supportWhatsapp = await getSetting(
    "support_whatsapp",
    process.env.SUPPORT_WHATSAPP || "966556915980"
  );
  const supportWhatsappMessage = await getSetting(
    "support_whatsapp_message",
    process.env.SUPPORT_WHATSAPP_MESSAGE || "السلام عليكم أبغى الاشتراك في Advanced Pro"
  );

  return {
    storeUrl,
    supportWhatsapp,
    supportWhatsappMessage,
  };
}
