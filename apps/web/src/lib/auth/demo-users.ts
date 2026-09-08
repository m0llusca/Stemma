import type { Prisma, RoleName } from "@prisma/client";
import { roleLabels } from "@/lib/labels";

/** Demo-linked identities, including VIEWER for pending-access QA. */
export const demoLoginUserWhere = {
  externalIdentities: {
    some: {
      provider: {
        type: "DEMO",
        status: "active"
      }
    }
  }
} satisfies Prisma.UserWhereInput;

export const demoLoginUserOrderBy = [
  { workspaceId: "asc" },
  { role: "asc" },
  { name: "asc" }
] satisfies Prisma.UserOrderByWithRelationInput[];

export const demoLoginUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  workspace: {
    select: {
      name: true
    }
  }
} satisfies Prisma.UserSelect;

export function demoLoginUsersFindManyArgs() {
  return {
    where: demoLoginUserWhere,
    orderBy: demoLoginUserOrderBy,
    select: demoLoginUserSelect
  } as const;
}

export function demoUserByIdWhere(userId: string) {
  return {
    id: userId,
    ...demoLoginUserWhere
  } satisfies Prisma.UserWhereInput;
}

export function demoUserOptionLabel(user: {
  name: string;
  role: RoleName;
  workspace: { name: string };
}) {
  const roleLabel = roleLabels[user.role];
  const identity = user.name === roleLabel ? roleLabel : `${user.name} · ${roleLabel}`;

  return `${identity} · ${user.workspace.name}`;
}

export function demoRoleSwitchFormData(userId: string) {
  const formData = new FormData();
  formData.set("userId", userId);
  return formData;
}

export type DemoRoleSwitcherUser = {
  id: string;
  name: string;
  roleLabel: string;
  optionLabel: string;
};

export type DemoRoleSwitcher = {
  currentUserId: string;
  roleLabel: string;
  users: DemoRoleSwitcherUser[];
};
