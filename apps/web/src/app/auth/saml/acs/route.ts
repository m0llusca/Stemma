import { NextRequest, NextResponse } from "next/server";
import { createEnterpriseAssertion, issueSessionFromEnterpriseAssertion } from "@/auth/providers/assertion";
import { expiredCookieOptions } from "@/lib/auth/cookies";
import { loginFlashCookieName, loginFlashCookieOptions } from "@/lib/auth/login-flash";
import { resolvePostLoginPath, sanitizeReturnTo } from "@/lib/auth/role-home";
import { validateSamlPostResponse, upsertUserFromSamlProfile } from "@/lib/auth/saml";
import { setAuthSessionCookies } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { logBackendEvent, requestIdFromHeaders } from "@/lib/observability";
import { resolvePublicOrigin } from "@/lib/public-origin";

export const dynamic = "force-dynamic";

function errorRedirect(request: NextRequest, origin: string, providerId: string | undefined, reason: string) {
  const url = new URL("/auth/login", origin);
  url.searchParams.set("returnTo", "/");
  const response = NextResponse.redirect(url);
  response.cookies.set(loginFlashCookieName, "sso_callback_failed", loginFlashCookieOptions());
  logBackendEvent({
    level: "warn",
    requestId: requestIdFromHeaders(request.headers),
    event: "auth.saml.login_failed",
    targetType: "identity_provider",
    targetId: providerId,
    metadata: { reason }
  });

  return response;
}

export async function POST(request: NextRequest) {
  let origin: string;

  try {
    origin = resolvePublicOrigin({ headers: request.headers, requestUrl: request.url });
  } catch {
    return new NextResponse("Public origin is not configured.", { status: 500 });
  }

  const providerId = request.nextUrl.searchParams.get("providerId") || undefined;
  const providerSlug = request.nextUrl.searchParams.get("provider") || "saml";
  const workspaceId = request.nextUrl.searchParams.get("workspaceId") || undefined;
  const provider = await prisma.identityProvider.findFirst({
    where: {
      ...(providerId ? { id: providerId } : { slug: providerSlug }),
      ...(workspaceId ? { workspaceId } : {}),
      type: "SAML",
      status: "active"
    },
    orderBy: { createdAt: "asc" }
  });

  if (!provider) {
    return errorRedirect(request, origin, undefined, "provider_unavailable");
  }

  const formData = await request.formData().catch(() => null);
  const samlResponse = formData?.get("SAMLResponse");

  if (typeof samlResponse !== "string" || !samlResponse) {
    return errorRedirect(request, origin, provider.id, "missing_saml_response");
  }

  try {
    const profile = await validateSamlPostResponse({
      provider,
      origin,
      samlResponse
    });
    const { user } = await upsertUserFromSamlProfile({
      workspaceId: provider.workspaceId,
      providerId: provider.id,
      profile,
      userAgent: request.headers.get("user-agent")
    });
    const assertion = await createEnterpriseAssertion({
      workspaceId: provider.workspaceId,
      providerId: provider.id,
      userId: user.id
    });
    const authSession = await issueSessionFromEnterpriseAssertion({
      token: assertion.token,
      providerId: provider.id,
      userAgent: request.headers.get("user-agent")
    });

    if (!authSession) {
      throw new Error("Enterprise assertion session was not issued.");
    }

    const destination = resolvePostLoginPath(sanitizeReturnTo(String(formData?.get("RelayState") ?? "")), user);
    const response = NextResponse.redirect(new URL(destination, origin));

    setAuthSessionCookies(response.cookies, authSession.token);
    response.cookies.set(loginFlashCookieName, "", expiredCookieOptions());
    logBackendEvent({
      requestId: requestIdFromHeaders(request.headers),
      event: "auth.saml.login_succeeded",
      workspaceId: provider.workspaceId,
      actorId: user.id,
      targetType: "identity_provider",
      targetId: provider.id,
      metadata: { sessionId: authSession.session.id }
    });

    return response;
  } catch {
    return errorRedirect(request, origin, provider.id, "acs_validation_failed");
  }
}
