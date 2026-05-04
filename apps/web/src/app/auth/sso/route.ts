import { NextRequest, NextResponse } from "next/server";
import {
  buildAuthorizationUrl,
  createOidcNonce,
  createOidcState,
  createPkceChallenge,
  createPkceVerifier,
  oidcNonceCookieName,
  oidcProviderCookieName,
  oidcReturnToCookieName,
  oidcStateCookieName,
  oidcVerifierCookieName
} from "@/lib/auth/oidc";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function safeReturnTo(value: string | null) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/reviews";
}

function authErrorRedirect(request: NextRequest, message: string) {
  const url = new URL("/auth/login", request.nextUrl.origin);
  url.searchParams.set("authError", message);
  url.searchParams.set("returnTo", safeReturnTo(request.nextUrl.searchParams.get("returnTo")));
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const providerSlug = request.nextUrl.searchParams.get("provider") || "microsoft-entra-id";
  const workspaceId = request.nextUrl.searchParams.get("workspaceId") || undefined;
  const returnTo = safeReturnTo(request.nextUrl.searchParams.get("returnTo"));
  const provider = await prisma.identityProvider.findFirst({
    where: {
      slug: providerSlug,
      ...(workspaceId ? { workspaceId } : {}),
      status: "active",
      type: {
        in: ["MICROSOFT_ENTRA_ID", "OIDC"]
      }
    },
    orderBy: { createdAt: "asc" }
  });

  if (!provider) {
    return authErrorRedirect(request, "SSO-провайдер не настроен или отключен.");
  }

  try {
    const state = createOidcState();
    const nonce = createOidcNonce();
    const codeVerifier = createPkceVerifier();
    const redirectUri = new URL("/auth/callback", request.nextUrl.origin).toString();
    const authorizationUrl = buildAuthorizationUrl({
      provider,
      redirectUri,
      state,
      nonce,
      codeChallenge: createPkceChallenge(codeVerifier)
    });
    const response = NextResponse.redirect(authorizationUrl);
    const cookieOptions = {
      httpOnly: true,
      sameSite: "lax" as const,
      path: "/",
      maxAge: 60 * 10
    };

    response.cookies.set(oidcStateCookieName, state, cookieOptions);
    response.cookies.set(oidcVerifierCookieName, codeVerifier, cookieOptions);
    response.cookies.set(oidcNonceCookieName, nonce, cookieOptions);
    response.cookies.set(oidcProviderCookieName, provider.id, cookieOptions);
    response.cookies.set(oidcReturnToCookieName, returnTo, cookieOptions);

    return response;
  } catch (error) {
    return authErrorRedirect(request, error instanceof Error ? error.message : "Не удалось начать SSO-вход.");
  }
}
