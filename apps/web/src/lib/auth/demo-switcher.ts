import type { RoleName } from "@prisma/client";
import { isDemoAuthEnabled } from "@/lib/auth/demo";
import {
  demoLoginUsersFindManyArgs,
  demoUserOptionLabel,
  type DemoRoleSwitcher
} from "@/lib/auth/demo-users";
import { prisma } from "@/lib/db";
import { roleLabels } from "@/lib/labels";

export type { DemoRoleSwitcher, DemoRoleSwitcherUser } from "@/lib/auth/demo-users";
export { demoRoleSwitchFormData } from "@/lib/auth/demo-users";

/**
 * Demo / QA only. Returns the same seeded identities as `/auth/login`.
 * Null when `QC_DEMO_AUTH` is not exactly `enabled` (prod fail-closed).
 */
export async function getDemoRoleSwitcher(user: {
  id: string;
  role: RoleName;
}): Promise<DemoRoleSwitcher | null> {
  if (!isDemoAuthEnabled()) {
    return null;
  }

  const users = await prisma.user.findMany(demoLoginUsersFindManyArgs());

  if (users.length === 0) {
    return null;
  }

  return {
    currentUserId: user.id,
    roleLabel: roleLabels[user.role],
    users: users.map((demoUser) => ({
      id: demoUser.id,
      name: demoUser.name,
      roleLabel: roleLabels[demoUser.role],
      optionLabel: demoUserOptionLabel(demoUser)
    }))
  };
}
