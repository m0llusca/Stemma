import { buildOpenApiDocument } from "@/lib/api/openapi";
import { apiJson } from "@/lib/api/response";

export const dynamic = "force-dynamic";

export async function GET() {
  return apiJson(buildOpenApiDocument());
}
