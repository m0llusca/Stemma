import { getPermissions } from "@/lib/auth/permissions";
import { apiJson } from "@/lib/api/response";
import { getCurrentUser } from "@/lib/current-user";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();

  return apiJson({
    user: {
      id: user.id,
      workspaceId: user.workspaceId,
      workspaceName: user.workspace.name,
      email: user.email,
      name: user.name,
      role: user.role,
      supportLine: user.supportLine,
      teamName: user.teamName
    },
    permissions: getPermissions(user.role)
  });
}

