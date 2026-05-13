import { apiJson, requestIdFromHeaders } from "@/lib/api/response";
import { requireSessionApi } from "@/lib/api/session";
import { listIntegrationCapabilities } from "@/lib/integrations/capabilities";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = requestIdFromHeaders(request.headers);
  const session = await requireSessionApi(request, "integrations:manage", { requestId });

  if (!session.ok) {
    return session.response;
  }

  return apiJson(
    {
      catalog: listIntegrationCapabilities(),
      requestId
    },
    200,
    requestId
  );
}
