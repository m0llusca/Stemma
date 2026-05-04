import { NextRequest, NextResponse } from "next/server";
import {
  exchangeAuthorizationCode,
  oidcNonceCookieName,
  oidcProviderCookieName,
  oidcReturnToCookieName,
  oidcStateCookieName,
  oidcVerifierCookieName,
  upsertUserFromOidcClaims,
  validateIdToken
} from "@/lib/auth/oidc";
import { sessionCookieName } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function clearOidcCookies(response: NextResponse) {
  for (const name of [oidcStateCookieName, oidcVerifierCookieName, oidcNonceCookieName, oidcProviderCookieName, oidcReturnToCookieName]) {
    response.cookies.set(name, "", {
      path: "/",
      maxAge: 0
    });
  }
}

function safeReturnTo(value: string | undefined) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/reviews";
}

function errorRedirect(request: NextRequest, message: string) {
  const url = new URL("/auth/login", request.nextUrl.origin);
  url.searchParams.set("authError", message);
  url.searchParams.set("returnTo", safeReturnTo(request.cookies.get(oidcReturnToCookieName)?.value));
  const response = NextResponse.redirect(url);
  clearOidcCookies(response);
  return response;
}

export async function GET(request: NextRequest) {
  const error = request.nextUrl.searchParams.get("error");

  if (error) {
    return errorRedirect(request, request.nextUrl.searchParams.get("error_description") || error);
  }

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const expectedState = request.cookies.get(oidcStateCookieName)?.value;
  const codeVerifier = request.cookies.get(oidcVerifierCookieName)?.value;
  const nonce = request.cookies.get(oidcNonceCookieName)?.value;
  const providerId = request.cookies.get(oidcProviderCookieName)?.value;
  const returnTo = safeReturnTo(request.cookies.get(oidcReturnToCookieName)?.value);

  if (!code || !state || !expectedState || state !== expectedState || !codeVerifier || !nonce || !providerId) {
    return errorRedirect(request, "OIDC callback не прошел проверку state.");
  }

  const provider = await prisma.identityProvider.findUnique({
    where: { id: providerId }
  });

  if (!provider || provider.status !== "active") {
    return errorRedirect(request, "SSO-провайдер не найден или отключен.");
  }

  try {
    const redirectUri = new URL("/auth/callback", request.nextUrl.origin).toString();
    const tokenResponse = await exchangeAuthorizationCode({
      provider,
      code,
      redirectUri,
      codeVerifier
    });
    const claims = await validateIdToken({
      idToken: tokenResponse.id_token!,
      provider,
      nonce
    });
    const { session: authSession } = await upsertUserFromOidcClaims({
      workspaceId: provider.workspaceId,
      providerId: provider.id,
      claims,
      userAgent: request.headers.get("user-agent")
    });
    const response = NextResponse.redirect(new URL(returnTo, request.nextUrl.origin));

    response.cookies.set(sessionCookieName, authSession.token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 12
    });
    clearOidcCookies(response);

    return response;
  } catch (callbackError) {
    return errorRedirect(request, callbackError instanceof Error ? callbackError.message : "SSO-вход не завершен.");
  }
}
