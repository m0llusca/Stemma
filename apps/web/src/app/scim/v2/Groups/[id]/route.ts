import {
  authenticateScimRequest,
  deleteScimGroup,
  getScimGroup,
  handleScimError,
  patchScimGroup,
  replaceScimGroup,
  scimJson
} from "@/lib/auth/scim";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const auth = await authenticateScimRequest(request);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await context.params;
    return scimJson(await getScimGroup(auth.context, id));
  } catch (error) {
    return handleScimError(error);
  }
}

export async function PUT(request: Request, context: RouteContext) {
  const auth = await authenticateScimRequest(request);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await context.params;
    const body = await request.json().catch(() => null);
    const result = await replaceScimGroup(auth.context, id, body ?? {});
    return scimJson(result.resource, result.status);
  } catch (error) {
    return handleScimError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await authenticateScimRequest(request);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await context.params;
    const body = await request.json().catch(() => null);
    const result = await patchScimGroup(auth.context, id, body ?? {});
    return scimJson(result.resource, result.status);
  } catch (error) {
    return handleScimError(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const auth = await authenticateScimRequest(request);
  if (!auth.ok) return auth.response;

  try {
    const { id } = await context.params;
    const result = await deleteScimGroup(auth.context, id);
    return result.status === 204 ? new Response(null, { status: 204 }) : scimJson(result.resource, result.status);
  } catch (error) {
    return handleScimError(error);
  }
}
