import { NextResponse } from "next/server";
import { buildOpenApiDocument } from "@/lib/api/openapi";
import { apiJson, requestIdFromHeaders } from "@/lib/api/response";
import { requireSessionApi } from "@/lib/api/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    const requestId = requestIdFromHeaders(request.headers);
    const session = await requireSessionApi(request, "backend_jobs:manage", { requestId });

    if (!session.ok) {
      // Fail-closed: do not advertise the OpenAPI surface to unauthenticated callers.
      return new NextResponse(null, { status: 404 });
    }
  }

  return apiJson(buildOpenApiDocument());
}
