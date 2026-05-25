import { NextRequest, NextResponse } from "next/server";
import { generateSamlMetadata } from "@/lib/auth/saml";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const providerId = request.nextUrl.searchParams.get("providerId") || undefined;
  const providerSlug = request.nextUrl.searchParams.get("provider") || "saml";
  const workspaceId = request.nextUrl.searchParams.get("workspaceId") || undefined;
  const provider = await prisma.identityProvider.findFirst({
    where: {
      ...(providerId ? { id: providerId } : { slug: providerSlug }),
      ...(workspaceId ? { workspaceId } : {}),
      type: "SAML",
      status: {
        not: "disabled"
      }
    },
    orderBy: { createdAt: "asc" }
  });

  if (!provider) {
    return new NextResponse("SAML provider is not configured.", { status: 404 });
  }

  try {
    return new NextResponse(generateSamlMetadata(provider, request.nextUrl.origin), {
      headers: {
        "content-type": "application/samlmetadata+xml; charset=utf-8",
        "cache-control": "no-store"
      }
    });
  } catch {
    return new NextResponse("SAML metadata is not available for this provider.", { status: 400 });
  }
}
