import { createHash, createPublicKey, createVerify, randomBytes, timingSafeEqual } from "node:crypto";
import type { IdentityProvider, RoleName } from "@prisma/client";
import { buildEntraAuthorizationMetadata, resolveRoleFromExternalClaims } from "@/lib/auth/providers";
import { createAuthSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

export const oidcStateCookieName = "qc_oidc_state";
export const oidcVerifierCookieName = "qc_oidc_verifier";
export const oidcNonceCookieName = "qc_oidc_nonce";
export const oidcProviderCookieName = "qc_oidc_provider";
export const oidcReturnToCookieName = "qc_oidc_return_to";

type OidcClaims = {
  iss?: string;
  sub?: string;
  aud?: string | string[];
  exp?: number;
  nbf?: number;
  iat?: number;
  nonce?: string;
  tid?: string;
  oid?: string;
  email?: string;
  preferred_username?: string;
  upn?: string;
  name?: string;
  roles?: string[];
  groups?: string[];
};

type JwksKey = {
  kid?: string;
  kty?: string;
  alg?: string;
  use?: string;
  n?: string;
  e?: string;
};

type TokenResponse = {
  id_token?: string;
  access_token?: string;
  refresh_token?: string;
  error?: string;
  error_description?: string;
};

function base64UrlJson<T>(value: string): T {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T;
}

function constantTimeEqualString(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function createPkceVerifier() {
  return randomBytes(48).toString("base64url");
}

export function createOidcState() {
  return randomBytes(32).toString("base64url");
}

export function createOidcNonce() {
  return randomBytes(32).toString("base64url");
}

export function createPkceChallenge(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function resolveProviderClientSecret(provider: Pick<IdentityProvider, "clientSecretRef">) {
  const secretRef = provider.clientSecretRef?.trim();

  if (!secretRef) {
    return process.env.QC_ENTRA_CLIENT_SECRET || process.env.QC_OIDC_CLIENT_SECRET;
  }

  if (secretRef.startsWith("env:")) {
    return process.env[secretRef.slice("env:".length)];
  }

  return secretRef;
}

function normalizeIssuer(provider: Pick<IdentityProvider, "issuer" | "tenantId">, claims: OidcClaims) {
  const issuer = provider.issuer?.trim();
  const tenantId = provider.tenantId?.trim() || claims.tid;

  return issuer?.replace("{tenantId}", tenantId ?? "");
}

function validateClaims(input: {
  claims: OidcClaims;
  provider: Pick<IdentityProvider, "clientId" | "issuer" | "tenantId">;
  nonce: string;
}) {
  const now = Math.floor(Date.now() / 1000);
  const expectedIssuer = normalizeIssuer(input.provider, input.claims);
  const audience = Array.isArray(input.claims.aud) ? input.claims.aud : [input.claims.aud].filter(Boolean);

  if (!input.claims.sub) {
    throw new Error("ID token не содержит subject.");
  }

  if (!input.claims.exp || input.claims.exp <= now) {
    throw new Error("ID token истек.");
  }

  if (input.claims.nbf && input.claims.nbf > now + 60) {
    throw new Error("ID token еще не активен.");
  }

  if (input.provider.clientId && !audience.includes(input.provider.clientId)) {
    throw new Error("ID token выпущен для другого приложения.");
  }

  if (expectedIssuer && input.claims.iss !== expectedIssuer) {
    throw new Error("ID token выпущен неизвестным issuer.");
  }

  if (!input.claims.nonce || !constantTimeEqualString(input.claims.nonce, input.nonce)) {
    throw new Error("OIDC nonce не совпадает.");
  }
}

async function fetchJwks(jwksUrl: string): Promise<JwksKey[]> {
  const response = await fetch(jwksUrl, { cache: "no-store" });

  if (!response.ok) {
    throw new Error("Не удалось получить JWKS провайдера.");
  }

  const body = (await response.json()) as { keys?: JwksKey[] };
  return body.keys ?? [];
}

export async function validateIdToken(input: {
  idToken: string;
  provider: Pick<IdentityProvider, "clientId" | "issuer" | "tenantId" | "jwksUrl" | "authorizationUrl" | "tokenUrl" | "scopes">;
  nonce: string;
}) {
  const [rawHeader, rawPayload, rawSignature] = input.idToken.split(".");

  if (!rawHeader || !rawPayload || !rawSignature) {
    throw new Error("Некорректный формат ID token.");
  }

  const header = base64UrlJson<{ alg?: string; kid?: string }>(rawHeader);
  const claims = base64UrlJson<OidcClaims>(rawPayload);

  if (header.alg !== "RS256" || !header.kid) {
    throw new Error("Поддерживаются только ID tokens с RS256 и kid.");
  }

  const jwksUrl = input.provider.jwksUrl || buildEntraAuthorizationMetadata(input.provider).jwksUrl;
  const jwk = (await fetchJwks(jwksUrl)).find((key) => key.kid === header.kid);

  if (!jwk) {
    throw new Error("Не найден ключ подписи ID token.");
  }

  const publicKey = createPublicKeyFromJwk(jwk);
  const verifier = createVerify("RSA-SHA256");
  verifier.update(`${rawHeader}.${rawPayload}`);
  verifier.end();

  if (!verifier.verify(publicKey, rawSignature, "base64url")) {
    throw new Error("Подпись ID token не прошла проверку.");
  }

  validateClaims({
    claims,
    provider: input.provider,
    nonce: input.nonce
  });

  return claims;
}

function createPublicKeyFromJwk(jwk: JwksKey) {
  return createPublicKey({
    key: {
      kty: jwk.kty,
      n: jwk.n,
      e: jwk.e
    },
    format: "jwk"
  });
}

export function buildAuthorizationUrl(input: {
  provider: Pick<IdentityProvider, "clientId" | "authorizationUrl" | "tenantId" | "tokenUrl" | "jwksUrl" | "scopes">;
  redirectUri: string;
  state: string;
  nonce: string;
  codeChallenge: string;
}) {
  const metadata = buildEntraAuthorizationMetadata(input.provider);

  if (!metadata.clientId) {
    throw new Error("У провайдера не заполнен clientId.");
  }

  const url = new URL(metadata.authorizationUrl);
  url.searchParams.set("client_id", metadata.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("scope", metadata.scopes);
  url.searchParams.set("state", input.state);
  url.searchParams.set("nonce", input.nonce);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");

  return url;
}

export async function exchangeAuthorizationCode(input: {
  provider: Pick<IdentityProvider, "clientId" | "clientSecretRef" | "authorizationUrl" | "tokenUrl" | "jwksUrl" | "tenantId" | "scopes">;
  code: string;
  redirectUri: string;
  codeVerifier: string;
}) {
  const metadata = buildEntraAuthorizationMetadata(input.provider);
  const clientSecret = resolveProviderClientSecret(input.provider);

  if (!metadata.clientId) {
    throw new Error("У провайдера не заполнен clientId.");
  }

  const body = new URLSearchParams({
    client_id: metadata.clientId,
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: input.redirectUri,
    code_verifier: input.codeVerifier,
    scope: metadata.scopes
  });

  if (clientSecret) {
    body.set("client_secret", clientSecret);
  }

  const response = await fetch(metadata.tokenUrl, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body
  });
  const payload = (await response.json()) as TokenResponse;

  if (!response.ok || payload.error || !payload.id_token) {
    throw new Error(payload.error_description || payload.error || "Не удалось обменять authorization code.");
  }

  return payload;
}

function claimString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function upsertUserFromOidcClaims(input: {
  workspaceId: string;
  providerId: string;
  claims: OidcClaims;
  userAgent?: string | null;
}) {
  const email =
    claimString(input.claims.email) ||
    claimString(input.claims.preferred_username) ||
    claimString(input.claims.upn);

  if (!email) {
    throw new Error("В ID token нет email/preferred_username/upn.");
  }

  const providerSubject = input.claims.tid && input.claims.oid ? `${input.claims.tid}:${input.claims.oid}` : input.claims.sub;

  if (!providerSubject) {
    throw new Error("В ID token нет стабильного идентификатора пользователя.");
  }

  const role = await resolveRoleFromExternalClaims(input.workspaceId, input.providerId, {
    appRoles: input.claims.roles,
    groups: input.claims.groups
  });
  const displayName = claimString(input.claims.name) || email;

  const user = await prisma.$transaction(async (tx) => {
    const existingIdentity = await tx.externalIdentity.findUnique({
      where: {
        providerId_providerSubject: {
          providerId: input.providerId,
          providerSubject
        }
      },
      include: {
        user: true
      }
    });

    if (existingIdentity) {
      await tx.externalIdentity.update({
        where: { id: existingIdentity.id },
        data: {
          email,
          displayName,
          rawClaimsJson: JSON.stringify(input.claims),
          lastLoginAt: new Date()
        }
      });

      return tx.user.update({
        where: { id: existingIdentity.userId },
        data: {
          email,
          name: displayName,
          role
        }
      });
    }

    const userByEmail = await tx.user.findUnique({
      where: {
        workspaceId_email: {
          workspaceId: input.workspaceId,
          email
        }
      }
    });
    const linkedUser =
      userByEmail ??
      (await tx.user.create({
        data: {
          workspaceId: input.workspaceId,
          email,
          name: displayName,
          role
        }
      }));

    const normalizedUser =
      linkedUser.role === role && linkedUser.name === displayName
        ? linkedUser
        : await tx.user.update({
            where: { id: linkedUser.id },
            data: { name: displayName, role }
          });

    await tx.externalIdentity.create({
      data: {
        userId: normalizedUser.id,
        providerId: input.providerId,
        providerSubject,
        email,
        displayName,
        rawClaimsJson: JSON.stringify(input.claims),
        lastLoginAt: new Date()
      }
    });

    return normalizedUser;
  });

  const session = await createAuthSession({
    userId: user.id,
    providerId: input.providerId,
    userAgent: input.userAgent
  });

  return {
    user,
    session,
    role: role as RoleName
  };
}
