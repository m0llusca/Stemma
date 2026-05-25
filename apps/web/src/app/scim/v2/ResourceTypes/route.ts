import { authenticateScimRequest, handleScimError, resourceTypesResponse, scimJson } from "@/lib/auth/scim";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await authenticateScimRequest(request);
  if (!auth.ok) return auth.response;

  try {
    return scimJson(resourceTypesResponse());
  } catch (error) {
    return handleScimError(error);
  }
}
