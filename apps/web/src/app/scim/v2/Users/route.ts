import { authenticateScimRequest, createScimUser, handleScimError, listScimUsers, scimJson } from "@/lib/auth/scim";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await authenticateScimRequest(request);
  if (!auth.ok) return auth.response;

  try {
    return scimJson(await listScimUsers(auth.context, new URL(request.url)));
  } catch (error) {
    return handleScimError(error);
  }
}

export async function POST(request: Request) {
  const auth = await authenticateScimRequest(request);
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json().catch(() => null);
    const result = await createScimUser(auth.context, body ?? {});
    return scimJson(result.resource, result.status, { Location: result.resource.meta.location });
  } catch (error) {
    return handleScimError(error);
  }
}
