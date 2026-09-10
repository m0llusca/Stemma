import type { RoleName } from "@prisma/client";

export const LAST_ADMIN_DEMOTION_ERROR =
  "Нельзя снять роль администратора с последней учетной записи администратора.";

export type LastAdminCountClient = {
  user: {
    count: (args: {
      where: {
        workspaceId: string;
        role: "ADMIN";
      };
    }) => Promise<number>;
  };
};

/**
 * True when the workspace has at most one ADMIN (including zero — fail-closed).
 */
export async function isLastWorkspaceAdmin(client: LastAdminCountClient, workspaceId: string) {
  const adminCount = await client.user.count({
    where: {
      workspaceId,
      role: "ADMIN"
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
