import { Prisma, type RoleName, type UserLifecycleStatus } from "@prisma/client";

export const LAST_ADMIN_DEMOTION_ERROR =
  "Нельзя снять роль администратора с последней учетной записи администратора.";

export const LAST_ADMIN_DEACTIVATION_ERROR =
  "Нельзя деактивировать последнюю учетную запись администратора.";

export type LastAdminLockClient = {
  $queryRaw: <T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: unknown[]) => Promise<T>;
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
  };
  $queryRaw?: LastAdminLockClient["$queryRaw"];
};

function canLockForUpdate(client: LastAdminCountClient): client is LastAdminCountClient & LastAdminLockClient {
  return typeof client.$queryRaw === "function";
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
 */
export async function roleAfterLastAdminGuard(
  client: LastAdminCountClient,
  workspaceId: string,
  currentRole: RoleName,
  nextRole: RoleName
): Promise<RoleName> {
  if (currentRole !== "ADMIN" || nextRole === "ADMIN") {
    return nextRole;
  }

  if (await isLastWorkspaceAdmin(client, workspaceId)) {
    return "ADMIN";
  }

  return nextRole;
}

/**
 * IdP / SCIM / directory sync: never suspend/deprovision the last ACTIVE ADMIN — keep ACTIVE.
 */
export async function lifecycleStatusAfterLastAdminGuard(
  client: LastAdminCountClient,
  workspaceId: string,
  currentRole: RoleName,
  nextStatus: UserLifecycleStatus
): Promise<UserLifecycleStatus> {
  if (currentRole !== "ADMIN" || nextStatus === "ACTIVE") {
    return nextStatus;
  }

  if (await isLastWorkspaceAdmin(client, workspaceId)) {
    return "ACTIVE";
  }

  return nextStatus;
}
