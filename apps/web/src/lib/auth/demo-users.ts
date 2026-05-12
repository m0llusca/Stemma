import type { Prisma } from "@prisma/client";

export const demoLoginUserWhere = {
  role: {
    not: "VIEWER"
  },
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

export function demoUserByIdWhere(userId: string) {
  return {
    id: userId,
    ...demoLoginUserWhere
  } satisfies Prisma.UserWhereInput;
}
