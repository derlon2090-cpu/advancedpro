import { prisma } from "../lib/prisma.js";
import { withDbRetry } from "../utils/dbRetry.js";

function workspaceDisplayName(row) {
  const ownerName = String(row?.owner_name || row?.ownerName || "").trim();
  if (ownerName) return ownerName;
  const code = String(row?.code || "").trim();
  if (!code) return "مساحة العمل";
  return `مساحة ${code.slice(-6)}`;
}

function normalizeWorkspaceRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    activationKeyId: Number(row.activation_key_id || row.key_id || row.activationKeyId),
    displayName: String(row.display_name || row.displayName || "مساحة العمل"),
    createdAt: row.created_at || row.createdAt || null,
    updatedAt: row.updated_at || row.updatedAt || null,
  };
}

export async function ensureWorkspacesTable() {
  const statements = [
    `
      CREATE TABLE IF NOT EXISTS workspaces (
        id SERIAL PRIMARY KEY,
        activation_key_id INTEGER NOT NULL UNIQUE,
        display_name VARCHAR(255) NOT NULL DEFAULT 'مساحة العمل',
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `,
    `ALTER TABLE activation_codes ADD COLUMN IF NOT EXISTS workspace_id INTEGER`,
    `CREATE UNIQUE INDEX IF NOT EXISTS workspaces_activation_key_id_unique ON workspaces (activation_key_id)`,
    `CREATE INDEX IF NOT EXISTS activation_codes_workspace_id_idx ON activation_codes (workspace_id)`,
  ];

  for (const statement of statements) {
    await withDbRetry(() => prisma.$executeRawUnsafe(statement));
  }
}

export async function getWorkspaceById(workspaceId) {
  await ensureWorkspacesTable();
  const rows = await withDbRetry(() =>
    prisma.$queryRaw`
      SELECT id, activation_key_id, display_name, created_at, updated_at
      FROM workspaces
      WHERE id = ${Number(workspaceId)}
      LIMIT 1
    `
  );

  return normalizeWorkspaceRow(rows[0] || null);
}

export async function getWorkspaceByActivationKeyId(activationKeyId) {
  await ensureWorkspacesTable();
  const rows = await withDbRetry(() =>
    prisma.$queryRaw`
      SELECT id, activation_key_id, display_name, created_at, updated_at
      FROM workspaces
      WHERE activation_key_id = ${Number(activationKeyId)}
      LIMIT 1
    `
  );

  return normalizeWorkspaceRow(rows[0] || null);
}

export async function ensureWorkspaceForActivationKey({ activationKeyId, preferredName = "" }) {
  await ensureWorkspacesTable();

  const keyRows = await withDbRetry(() =>
    prisma.$queryRaw`
      SELECT id, code, owner_name, workspace_id
      FROM activation_codes
      WHERE id = ${Number(activationKeyId)}
      LIMIT 1
    `
  );

  const keyRow = keyRows[0];
  if (!keyRow) {
    const error = new Error("جلسة المفتاح غير صالحة.");
    error.statusCode = 401;
    throw error;
  }

  const existingWorkspace =
    (Number.isFinite(Number(keyRow.workspace_id)) && (await getWorkspaceById(Number(keyRow.workspace_id)))) ||
    (await getWorkspaceByActivationKeyId(Number(activationKeyId)));

  if (existingWorkspace) {
    if (!Number.isFinite(Number(keyRow.workspace_id)) || Number(keyRow.workspace_id) !== existingWorkspace.id) {
      await withDbRetry(() =>
        prisma.$executeRaw`
          UPDATE activation_codes
          SET workspace_id = ${existingWorkspace.id}
          WHERE id = ${Number(activationKeyId)}
        `
      );
    }
    return existingWorkspace;
  }

  const displayName = String(preferredName || "").trim() || workspaceDisplayName(keyRow);
  const rows = await withDbRetry(() =>
    prisma.$queryRaw`
      INSERT INTO workspaces (activation_key_id, display_name)
      VALUES (${Number(activationKeyId)}, ${displayName})
      ON CONFLICT (activation_key_id)
      DO UPDATE SET
        display_name = COALESCE(NULLIF(EXCLUDED.display_name, ''), workspaces.display_name),
        updated_at = CURRENT_TIMESTAMP
      RETURNING id, activation_key_id, display_name, created_at, updated_at
    `
  );

  const workspace = normalizeWorkspaceRow(rows[0] || null);
  if (!workspace) {
    throw new Error("تعذر إنشاء مساحة العمل.");
  }

  await withDbRetry(() =>
    prisma.$executeRaw`
      UPDATE activation_codes
      SET workspace_id = ${workspace.id}
      WHERE id = ${Number(activationKeyId)}
    `
  );

  return workspace;
}
