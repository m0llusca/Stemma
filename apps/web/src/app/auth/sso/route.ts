import { NextRequest, NextResponse } from "next/server";
import { oidcFlowCookieOptions } from "@/lib/auth/cookies";
import { loginFlashCookieName, loginFlashCookieOptions, type LoginFlashCode } from "@/lib/auth/login-flash";
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

function authErrorRedirect(request: NextRequest, code: LoginFlashCode) {
  const url = new URL("/auth/login", request.nextUrl.origin);
  url.searchParams.set("returnTo", safeReturnTo(request.nextUrl.searchParams.get("returnTo")));
  const response = NextResponse.redirect(url);
  response.cookies.set(loginFlashCookieName, code, loginFlashCookieOptions());

  return response;
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
    return authErrorRedirect(request, "sso_unavailable");
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
    const cookieOptions = oidcFlowCookieOptions();

    response.cookies.set(oidcStateCookieName, state, cookieOptions);
    response.cookies.set(oidcVerifierCookieName, codeVerifier, cookieOptions);
    response.cookies.set(oidcNonceCookieName, nonce, cookieOptions);
    response.cookies.set(oidcProviderCookieName, provider.id, cookieOptions);
    response.cookies.set(oidcReturnToCookieName, returnTo, cookieOptions);

    return response;
  } catch {
    return authErrorRedirect(request, "sso_start_failed");
  }
}
