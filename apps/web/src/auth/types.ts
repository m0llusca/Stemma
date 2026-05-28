import type { RoleName } from "@prisma/client";

export type AppAuthUser = {
  id: string;
  workspaceId: string;
  email: string;
  name: string;
  role: RoleName;
};

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      workspaceId: string;
      email: string;
      emailVerified: Date | null;
      name: string;
      role: RoleName;
    };
  }

  interface User extends AppAuthUser {}
}
