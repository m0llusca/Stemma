import type { RoleName } from "@prisma/client";
import { getCurrentUser } from "@/lib/current-user";
import { buildShellNavigation, type ShellNavigation } from "@/lib/shell/navigation";
import { resolveWorkspaceBranding, type WorkspaceBranding } from "@/lib/ui-theme";

export type ShellSnapshot = {
  user: {
    id: string;
    workspaceId: string;
    name: string;
    email: string;
    role: RoleName;
  };
  branding: WorkspaceBranding;
  navigation: ShellNavigation;
};

export async function getShellSnapshot(): Promise<ShellSnapshot> {
  const user = await getCurrentUser();

  return {
    user: {
      id: user.id,
      workspaceId: user.workspaceId,
      name: user.name,
      email: user.email,
      role: user.role
    },
    branding: resolveWorkspaceBranding(user.workspace),
    navigation: buildShellNavigation({ role: user.role })
  };
}
