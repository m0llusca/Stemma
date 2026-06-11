import { getPermissions } from "@/lib/auth/permissions";
import { apiError, apiJson, requestIdFromHeaders } from "@/lib/api/response";
import { AuthRequiredError, getCurrentUser } from "@/lib/current-user";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = requestIdFromHeaders(request.headers);

  let user: Awaited<ReturnType<typeof getCurrentUser>>;

  try {
    user = await getCurrentUser();
  } catch (error) {
    if (error instanceof AuthRequiredError || (error instanceof Error && error.name === "AuthRequiredError")) {
      return apiError("unauthorized", error.message, 401, requestId);
    }

    throw error;
  }

  return apiJson(
    {
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
    },
    200,
    requestId
  );
}
