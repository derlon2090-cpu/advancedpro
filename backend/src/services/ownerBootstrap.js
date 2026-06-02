import bcrypt from "bcryptjs";

export async function upsertOwnerFromEnv(prisma, logger = console) {
  const ownerEmail = (process.env.OWNER_EMAIL || process.env.ADMIN_EMAIL || "")
    .trim()
    .toLowerCase();
  const ownerPassword = process.env.OWNER_PASSWORD || process.env.ADMIN_PASSWORD || "";
  const ownerName = (process.env.OWNER_NAME || "Owner").trim() || "Owner";

  if (!ownerEmail || !ownerPassword) {
    return { skipped: true, reason: "OWNER_EMAIL or OWNER_PASSWORD is missing" };
  }

  if (ownerPassword.length < 8) {
    throw new Error("OWNER_PASSWORD must be at least 8 characters");
  }

  const passwordHash = await bcrypt.hash(ownerPassword, 10);
  const existing = await prisma.user.findUnique({
    where: { email: ownerEmail },
  });

  if (existing) {
    const owner = await prisma.user.update({
      where: { email: ownerEmail },
      data: {
        fullName: ownerName,
        passwordHash,
        role: "owner",
        status: "active",
      },
      select: { id: true, email: true, role: true },
    });

    logger.info?.("Owner admin updated from environment", {
      email: owner.email,
      role: owner.role,
    });

    return { skipped: false, action: "updated", owner };
  }

  const owner = await prisma.user.create({
    data: {
      fullName: ownerName,
      email: ownerEmail,
      passwordHash,
      role: "owner",
      status: "active",
    },
    select: { id: true, email: true, role: true },
  });

  logger.info?.("Owner admin created from environment", {
    email: owner.email,
    role: owner.role,
  });

  return { skipped: false, action: "created", owner };
}
