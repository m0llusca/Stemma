import {
  authenticateScimRequest,
  deactivateScimUser,
  getScimUser,
  handleScimError,
  patchScimUser,
  replaceScimUser,
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
    return scimJson(await getScimUser(auth.context, id));
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
    const result = await replaceScimUser(auth.context, id, body ?? {});
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
    const result = await patchScimUser(auth.context, id, body ?? {});
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
    const result = await deactivateScimUser(auth.context, id);
    return scimJson(result.resource, result.status);
  } catch (error) {
    return handleScimError(error);
  }
}
