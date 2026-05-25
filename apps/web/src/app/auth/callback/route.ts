import { NextRequest, NextResponse } from "next/server";
import { authCookieOptions, expiredCookieOptions } from "@/lib/auth/cookies";
import { loginFlashCookieName, loginFlashCookieOptions, type LoginFlashCode } from "@/lib/auth/login-flash";
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
import { logBackendEvent, requestIdFromHeaders } from "@/lib/observability";

export const dynamic = "force-dynamic";

function clearOidcCookies(response: NextResponse) {
  for (const name of [oidcStateCookieName, oidcVerifierCookieName, oidcNonceCookieName, oidcProviderCookieName, oidcReturnToCookieName]) {
    response.cookies.set(name, "", expiredCookieOptions());
  }
}

function safeReturnTo(value: string | undefined) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/reviews";
}

function errorRedirect(request: NextRequest, code: LoginFlashCode) {
  const url = new URL("/auth/login", request.nextUrl.origin);
  url.searchParams.set("returnTo", safeReturnTo(request.cookies.get(oidcReturnToCookieName)?.value));
  const response = NextResponse.redirect(url);
  response.cookies.set(loginFlashCookieName, code, loginFlashCookieOptions());
  clearOidcCookies(response);
  return response;
}

export async function GET(request: NextRequest) {
  const requestId = requestIdFromHeaders(request.headers);
  const error = request.nextUrl.searchParams.get("error");

  if (error) {
    logBackendEvent({
      level: "warn",
      requestId,
      event: "auth.oidc.login_failed",
      metadata: { reason: "provider_error" }
    });
    return errorRedirect(request, "sso_callback_failed");
  }

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const expectedState = request.cookies.get(oidcStateCookieName)?.value;
  const codeVerifier = request.cookies.get(oidcVerifierCookieName)?.value;
  const nonce = request.cookies.get(oidcNonceCookieName)?.value;
  const providerId = request.cookies.get(oidcProviderCookieName)?.value;
  const returnTo = safeReturnTo(request.cookies.get(oidcReturnToCookieName)?.value);

  if (!code || !state || !expectedState || state !== expectedState || !codeVerifier || !nonce || !providerId) {
    logBackendEvent({
      level: "warn",
      requestId,
      event: "auth.oidc.login_failed",
      targetType: "identity_provider",
      targetId: providerId,
      metadata: { reason: "invalid_state_or_missing_cookie" }
    });
    return errorRedirect(request, "sso_callback_failed");
  }

  const provider = await prisma.identityProvider.findUnique({
    where: { id: providerId }
  });

  if (!provider || provider.status !== "active") {
    logBackendEvent({
      level: "warn",
      requestId,
      event: "auth.oidc.login_failed",
      targetType: "identity_provider",
      targetId: providerId,
      metadata: { reason: "provider_unavailable" }
    });
    return errorRedirect(request, "sso_callback_failed");
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
      accessToken: tokenResponse.access_token,
      userAgent: request.headers.get("user-agent")
    });
    const response = NextResponse.redirect(new URL(returnTo, request.nextUrl.origin));

    response.cookies.set(sessionCookieName, authSession.token, authCookieOptions(60 * 60 * 12));
    response.cookies.set(loginFlashCookieName, "", expiredCookieOptions());
    clearOidcCookies(response);
    logBackendEvent({
      requestId,
      event: "auth.oidc.login_succeeded",
      workspaceId: provider.workspaceId,
      actorId: authSession.session.userId,
      targetType: "identity_provider",
      targetId: provider.id,
      metadata: { sessionId: authSession.session.id }
    });

    return response;
  } catch {
    logBackendEvent({
      level: "warn",
      requestId,
      event: "auth.oidc.login_failed",
      workspaceId: provider.workspaceId,
      targetType: "identity_provider",
      targetId: provider.id,
      metadata: { reason: "callback_validation_failed" }
    });
    return errorRedirect(request, "sso_callback_failed");
  }
}
