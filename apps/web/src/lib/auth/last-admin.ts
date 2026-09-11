import { Prisma, type RoleName, type UserLifecycleStatus } from "@prisma/client";

export const LAST_ADMIN_DEMOTION_ERROR =
  "Нельзя снять роль администратора с последней учетной записи администратора.";

export const LAST_ADMIN_DEACTIVATION_ERROR =
  "Нельзя деактивировать последнюю учетную запись администратора.";

export type LastAdminLockClient = {
  $queryRaw: <T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: unknown[]) => Promise<T>;
};

export type LastAdminUserRow = {
  role: RoleName;
  lifecycleStatus: UserLifecycleStatus;
};

export type LastAdminCountClient = {
  user: {
    count: (args: {
      where: {
        workspaceId: string;
        role: "ADMIN";
        lifecycleStatus: "ACTIVE";
      };
    }) => Promise<number>;
    findFirst?: (args: {
      where: { id: string; workspaceId: string };
      select: { role: true; lifecycleStatus: true };
    }) => Promise<LastAdminUserRow | null>;
  };
  $queryRaw?: LastAdminLockClient["$queryRaw"];
  $transaction?: <T>(callback: (tx: LastAdminCountClient) => Promise<T>) => Promise<T>;
};

function canLockForUpdate(client: LastAdminCountClient): client is LastAdminCountClient & LastAdminLockClient {
  return typeof client.$queryRaw === "function";
}

function canRunInteractiveTransaction(
  client: LastAdminCountClient
): client is LastAdminCountClient & {
  $transaction: <T>(callback: (tx: LastAdminCountClient) => Promise<T>) => Promise<T>;
} {
  return typeof client.$transaction === "function";
}

/**
 * Lock ACTIVE ADMIN rows in the current transaction (`SELECT … FOR UPDATE`)
 * so concurrent demotions/deactivations cannot both pass a plain count.
 * Call only inside an interactive Prisma transaction (or equivalent).
 */
export async function lockActiveAdminsForUpdate(tx: LastAdminLockClient, workspaceId: string): Promise<number> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id
    FROM "User"
    WHERE "workspaceId" = ${workspaceId}
      AND role = 'ADMIN'::"RoleName"
      AND "lifecycleStatus" = 'ACTIVE'::"UserLifecycleStatus"
    ORDER BY id
    FOR UPDATE
  `);

  return rows.length;
}

/**
 * True when the workspace has at most one ACTIVE ADMIN (including zero — fail-closed).
 * Suspended / deprovisioned admins do not count toward the remaining admin pool.
 *
 * When `client` exposes `$queryRaw` (Prisma root or transaction client), rows are locked
 * with FOR UPDATE first. Mutating callers must run inside a transaction so the lock
 * spans the subsequent role/lifecycle update.
 */
export async function isLastWorkspaceAdmin(client: LastAdminCountClient, workspaceId: string) {
  const adminCount = canLockForUpdate(client)
    ? await lockActiveAdminsForUpdate(client, workspaceId)
    : await client.user.count({
        where: {
          workspaceId,
          role: "ADMIN",
          lifecycleStatus: "ACTIVE"
        }
      });

  return adminCount <= 1;
}

/**
 * Lock ACTIVE ADMINs (when possible), then re-read the target user's role/lifecycle.
 * Soft guards must use this — never a caller-supplied pre-txn snapshot.
 *
 * Without `$queryRaw`, reads the user first and only counts ACTIVE ADMINs when the
 * fresh role is ADMIN (so IdP/SCIM mocks without `user.count` still work on no-op paths).
 */
export async function readUserRoleLifecycleForLastAdminGuard(
  client: LastAdminCountClient,
  workspaceId: string,
  userId: string
): Promise<{ row: LastAdminUserRow | null; activeAdminCount: number }> {
  if (canLockForUpdate(client)) {
    const activeAdminCount = await lockActiveAdminsForUpdate(client, workspaceId);
    const rows = await client.$queryRaw<Array<LastAdminUserRow>>(Prisma.sql`
      SELECT role, "lifecycleStatus"
      FROM "User"
      WHERE id = ${userId}
        AND "workspaceId" = ${workspaceId}
      FOR UPDATE
    `);

    return { row: rows[0] ?? null, activeAdminCount };
  }

  const row = client.user.findFirst
    ? await client.user.findFirst({
        where: { id: userId, workspaceId },
        select: { role: true, lifecycleStatus: true }
      })
    : null;

  if (!row || row.role !== "ADMIN") {
    return { row, activeAdminCount: 0 };
  }

  const activeAdminCount = await client.user.count({
    where: {
      workspaceId,
      role: "ADMIN",
      lifecycleStatus: "ACTIVE"
    }
  });

  return { row, activeAdminCount };
}

async function withLastAdminMutationTxn<T>(
  client: LastAdminCountClient,
  run: (tx: LastAdminCountClient) => Promise<T>
): Promise<T> {
  // FOR UPDATE on the Prisma root client does not span later statements.
  // Soft-guard mutate paths open an interactive transaction when available.
  // Transaction clients (no `$transaction`) already hold the outer lock scope.
  if (canRunInteractiveTransaction(client)) {
    return client.$transaction(run);
  }

  return run(client);
}

/**
 * Admin UI and other explicit demotions: throw when removing the last ADMIN.
 */
export async function assertCanDemoteAdminRole(
  client: LastAdminCountClient,
  workspaceId: string,
  currentRole: RoleName,
  nextRole: RoleName
) {
  if (currentRole !== "ADMIN" || nextRole === "ADMIN") {
    return;
  }

  if (await isLastWorkspaceAdmin(client, workspaceId)) {
    throw new Error(LAST_ADMIN_DEMOTION_ERROR);
  }
}

/**
 * Explicit lifecycle deactivation: throw when suspending/deprovisioning the last ACTIVE ADMIN.
 */
export async function assertCanDeactivateLastAdmin(
  client: LastAdminCountClient,
  workspaceId: string,
  currentRole: RoleName,
  nextStatus: UserLifecycleStatus
) {
  if (currentRole !== "ADMIN" || nextStatus === "ACTIVE") {
    return;
  }

  if (await isLastWorkspaceAdmin(client, workspaceId)) {
    throw new Error(LAST_ADMIN_DEACTIVATION_ERROR);
  }
}

/**
 * IdP / SCIM / directory sync: never strip the last ADMIN — keep ADMIN and apply the rest.
 * Always re-reads the target user's role under lock; never trusts a caller snapshot.
 */
export async function roleAfterLastAdminGuard(
  client: LastAdminCountClient,
  workspaceId: string,
  userId: string,
  nextRole: RoleName
): Promise<RoleName> {
  if (nextRole === "ADMIN") {
    return nextRole;
  }

  return withLastAdminMutationTxn(client, async (tx) => {
    const { row, activeAdminCount } = await readUserRoleLifecycleForLastAdminGuard(tx, workspaceId, userId);

    if (!row || row.role !== "ADMIN") {
      return nextRole;
    }

    if (activeAdminCount <= 1) {
      return "ADMIN";
    }

    return nextRole;
  });
}

/**
 * IdP / SCIM / directory sync: never suspend/deprovision the last ACTIVE ADMIN — keep ACTIVE.
 * Always re-reads the target user's role under lock; never trusts a caller snapshot.
 */
export async function lifecycleStatusAfterLastAdminGuard(
  client: LastAdminCountClient,
  workspaceId: string,
  userId: string,
  nextStatus: UserLifecycleStatus
): Promise<UserLifecycleStatus> {
  if (nextStatus === "ACTIVE") {
    return nextStatus;
  }

  return withLastAdminMutationTxn(client, async (tx) => {
    const { row, activeAdminCount } = await readUserRoleLifecycleForLastAdminGuard(tx, workspaceId, userId);

    if (!row || row.role !== "ADMIN") {
      return nextStatus;
    }

    if (activeAdminCount <= 1) {
      return "ACTIVE";
    }

    return nextStatus;
  });
}
