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
import { buildSamlAuthorizationUrl } from "@/lib/auth/saml";
import { prisma } from "@/lib/db";
import { resolvePublicOrigin } from "@/lib/public-origin";

export const dynamic = "force-dynamic";

function safeReturnTo(value: string | null) {
  // Keep generic `/` when missing so ACS/OIDC callback can apply role home.
  return value == null || value === "" ? "/" : value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

function authErrorRedirect(request: NextRequest, origin: string, code: LoginFlashCode) {
  const url = new URL("/auth/login", origin);
  url.searchParams.set("returnTo", safeReturnTo(request.nextUrl.searchParams.get("returnTo")));
  const response = NextResponse.redirect(url);
  response.cookies.set(loginFlashCookieName, code, loginFlashCookieOptions());

  return response;
}

export async function GET(request: NextRequest) {
  let origin: string;

  try {
    origin = resolvePublicOrigin({ headers: request.headers, requestUrl: request.url });
  } catch {
    return new NextResponse("Public origin is not configured.", { status: 500 });
  }

  const providerSlug = request.nextUrl.searchParams.get("provider") || "microsoft-entra-id";
  const workspaceId = request.nextUrl.searchParams.get("workspaceId") || undefined;
  const returnTo = safeReturnTo(request.nextUrl.searchParams.get("returnTo"));
  const provider = await prisma.identityProvider.findFirst({
    where: {
      slug: providerSlug,
      ...(workspaceId ? { workspaceId } : {}),
      status: "active",
      type: {
        in: ["MICROSOFT_ENTRA_ID", "OIDC", "SAML"]
      }
    },
    orderBy: { createdAt: "asc" }
  });

  if (!provider) {
    return authErrorRedirect(request, origin, "sso_unavailable");
  }

  try {
    if (provider.type === "SAML") {
      return NextResponse.redirect(
        await buildSamlAuthorizationUrl({
          provider,
          origin,
          relayState: returnTo
        })
      );
    }

    const state = createOidcState();
    const nonce = createOidcNonce();
    const codeVerifier = createPkceVerifier();
    const redirectUri = new URL("/auth/callback", origin).toString();
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
    return authErrorRedirect(request, origin, "sso_start_failed");
  }
}
