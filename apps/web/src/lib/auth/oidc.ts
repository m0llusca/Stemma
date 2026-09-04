import { createHash, createPublicKey, createVerify, randomBytes, timingSafeEqual } from "node:crypto";
import type { IdentityProvider, RoleName } from "@prisma/client";
import { buildEntraAuthorizationMetadata, resolveIdentityPolicyFromExternalClaims } from "@/lib/auth/providers";
import { assertProductionSecretReference, resolveSecretReference } from "@/lib/auth/secret-refs";
import { prisma } from "@/lib/db";

export { assertProductionSecretReference, isManagedSecretReference } from "@/lib/auth/secret-refs";

export const oidcStateCookieName = "qc_oidc_state";
export const oidcVerifierCookieName = "qc_oidc_verifier";
export const oidcNonceCookieName = "qc_oidc_nonce";
export const oidcProviderCookieName = "qc_oidc_provider";
export const oidcReturnToCookieName = "qc_oidc_return_to";

export type OidcClaims = {
  iss?: string;
  sub?: string;
  aud?: string | string[];
  azp?: string;
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
  hasgroups?: boolean | string;
  _claim_names?: {
    groups?: string;
  };
  _claim_sources?: Record<string, { endpoint?: string }>;
  supportLine?: string;
  teamName?: string;
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

type OidcProviderConfig = {
  graphGroupFallback?: {
    enabled?: boolean;
    endpoint?: string;
    securityEnabledOnly?: boolean;
    userIdClaim?: "oid" | "sub" | "upn" | "email";
  };
};

const jwksCacheTtlMs = 10 * 60 * 1000;
const jwksStaleTtlMs = 60 * 60 * 1000;
const jwksCacheMaxUrls = 16;
const jwksCacheMaxKeysPerUrl = 8;
const jwksCache = new Map<string, { keys: JwksKey[]; expiresAt: number; staleUntil: number }>();

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

  return resolveSecretReference(secretRef, "Секрет клиента");
}

function normalizeIssuerTemplate(value: string, tenantId: string | null | undefined) {
  return value.replace("{tenantId}", tenantId ?? "").replace("{tenantid}", tenantId ?? "");
}

function resolveExpectedIssuer(provider: Pick<IdentityProvider, "type" | "issuer" | "tenantId">, claims: OidcClaims) {
  const issuer = provider.issuer?.trim();
  const tenantId = provider.tenantId?.trim();

  if (issuer) {
    return normalizeIssuerTemplate(issuer, tenantId || claims.tid);
  }

  if (provider.type === "MICROSOFT_ENTRA_ID") {
    if (!tenantId) {
      throw new Error("Для проверки issuer Entra ID нужен tenantId или явный issuer.");
    }

    return `https://login.microsoftonline.com/${tenantId}/v2.0`;
  }

  throw new Error("Для OIDC провайдера должен быть настроен issuer.");
}

function validateClaims(input: {
  claims: OidcClaims;
  provider: Pick<IdentityProvider, "type" | "clientId" | "issuer" | "tenantId">;
  nonce: string;
}) {
  const now = Math.floor(Date.now() / 1000);
  const expectedIssuer = resolveExpectedIssuer(input.provider, input.claims);
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

  if (input.provider.clientId && audience.length > 1 && input.claims.azp !== input.provider.clientId) {
    throw new Error("ID token azp не совпадает с приложением.");
  }

  if (!input.claims.iss || input.claims.iss !== expectedIssuer) {
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
  return (body.keys ?? [])
    .filter((key) => key.kty === "RSA" && Boolean(key.kid) && Boolean(key.n) && Boolean(key.e))
    .slice(0, jwksCacheMaxKeysPerUrl);
}

function setCachedJwks(jwksUrl: string, keys: JwksKey[]) {
  if (!jwksCache.has(jwksUrl) && jwksCache.size >= jwksCacheMaxUrls) {
    const oldestUrl = jwksCache.keys().next().value as string | undefined;

    if (oldestUrl) {
      jwksCache.delete(oldestUrl);
    }
  }

  const now = Date.now();
  jwksCache.set(jwksUrl, {
    keys,
    expiresAt: now + jwksCacheTtlMs,
    staleUntil: now + jwksStaleTtlMs
  });
}

async function getCachedJwks(jwksUrl: string, kid: string): Promise<JwksKey[]> {
  const now = Date.now();
  const cached = jwksCache.get(jwksUrl);

  if (cached && cached.expiresAt > now && cached.keys.some((key) => key.kid === kid)) {
    return cached.keys;
  }

  try {
    const keys = await fetchJwks(jwksUrl);
    setCachedJwks(jwksUrl, keys);

    return keys;
  } catch (error) {
    if (cached && cached.staleUntil > now && cached.keys.some((key) => key.kid === kid)) {
      return cached.keys;
    }

    throw error;
  }
}

export function clearOidcJwksCacheForTests() {
  jwksCache.clear();
}

export async function validateIdToken(input: {
  idToken: string;
  provider: Pick<IdentityProvider, "type" | "clientId" | "issuer" | "tenantId" | "jwksUrl" | "authorizationUrl" | "tokenUrl" | "scopes">;
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
  const jwk = (await getCachedJwks(jwksUrl, header.kid)).find((key) => key.kid === header.kid);

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

export function validateOidcProviderConfigForSave(input: {
  type: IdentityProvider["type"];
  status?: string | null;
  issuer?: string | null;
  tenantId?: string | null;
}) {
  if (input.status !== "active") {
    return;
  }

  if (input.type === "MICROSOFT_ENTRA_ID" && !input.tenantId?.trim()) {
    throw new Error("Активный Microsoft Entra ID провайдер должен содержать tenantId для проверки issuer.");
  }

  if (input.type === "OIDC" && !input.issuer?.trim()) {
    throw new Error("Активный OIDC провайдер должен содержать issuer для проверки ID token.");
  }
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

function parseProviderConfig(configJson: string | null | undefined): OidcProviderConfig {
  if (!configJson) {
    return {};
  }

  try {
    const parsed = JSON.parse(configJson) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as OidcProviderConfig) : {};
  } catch {
    return {};
  }
}

function hasGroupOverageClaims(claims: OidcClaims) {
  return claims.hasgroups === true || claims.hasgroups === "true" || Boolean(claims._claim_names?.groups);
}

function userIdForGraph(claims: OidcClaims, claim: NonNullable<OidcProviderConfig["graphGroupFallback"]>["userIdClaim"]) {
  if (claim === "sub") return claimString(claims.sub);
  if (claim === "upn") return claimString(claims.upn) || claimString(claims.preferred_username);
  if (claim === "email") return claimString(claims.email);
  return claimString(claims.oid);
}

async function fetchGraphMemberGroups(input: {
  provider: Pick<IdentityProvider, "configJson">;
  claims: OidcClaims;
  accessToken?: string;
}) {
  const config = parseProviderConfig(input.provider.configJson).graphGroupFallback;

  if (!config?.enabled) {
    throw new Error("OIDC token содержит overage groups; настройте Microsoft Graph fallback или используйте app roles.");
  }

  if (!input.accessToken) {
    throw new Error("OIDC token содержит overage groups; для Graph fallback нужен access token.");
  }

  const endpoint = resolveMicrosoftGraphEndpoint(config.endpoint);
  const userId = userIdForGraph(input.claims, config.userIdClaim ?? "oid");
  const path = userId ? `/users/${encodeURIComponent(userId)}/getMemberGroups` : "/me/getMemberGroups";
  const response = await fetch(`${endpoint}${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${input.accessToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      securityEnabledOnly: config.securityEnabledOnly ?? true
    })
  });

  if (!response.ok) {
    throw new Error("Не удалось получить группы пользователя через Microsoft Graph.");
  }

  const body = (await response.json()) as { value?: unknown };
  const groups = Array.isArray(body.value) ? body.value.filter((value): value is string => typeof value === "string" && value.length > 0) : [];

  if (!groups.length) {
    throw new Error("Microsoft Graph не вернул группы пользователя.");
  }

  return groups;
}

function resolveMicrosoftGraphEndpoint(value: string | undefined) {
  const rawEndpoint = (value || "https://graph.microsoft.com/v1.0").trim();
  let url: URL;

  try {
    url = new URL(rawEndpoint);
  } catch {
    throw new Error("Некорректный Microsoft Graph endpoint.");
  }

  const allowedHosts = new Set([
    "graph.microsoft.com",
    "graph.microsoft.us",
    "dod-graph.microsoft.us",
    "graph.microsoft.de",
    "microsoftgraph.chinacloudapi.cn"
  ]);

  if (url.protocol !== "https:" || !allowedHosts.has(url.hostname.toLowerCase())) {
    throw new Error("Graph fallback должен использовать официальный Microsoft Graph endpoint.");
  }

  return url.toString().replace(/\/+$/, "");
}

export async function resolveOidcRoleClaims(input: {
  provider: Pick<IdentityProvider, "configJson">;
  claims: OidcClaims;
  accessToken?: string;
}) {
  if (!hasGroupOverageClaims(input.claims)) {
    return {
      appRoles: input.claims.roles,
      groups: input.claims.groups,
      supportLine: input.claims.supportLine,
      teamName: input.claims.teamName,
      attributes: input.claims as Record<string, unknown>
    };
  }

  if (input.claims.roles?.length) {
    return {
      appRoles: input.claims.roles,
      groups: [],
      supportLine: input.claims.supportLine,
      teamName: input.claims.teamName,
      attributes: input.claims as Record<string, unknown>
    };
  }

  return {
    appRoles: input.claims.roles,
    groups: await fetchGraphMemberGroups(input),
    supportLine: input.claims.supportLine,
    teamName: input.claims.teamName,
    attributes: input.claims as Record<string, unknown>
  };
}

function claimString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function upsertUserFromOidcClaims(input: {
  workspaceId: string;
  providerId: string;
  accessToken?: string;
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

  const provider = await prisma.identityProvider.findUnique({
    where: { id: input.providerId },
    select: { configJson: true }
  });
  const roleClaims = await resolveOidcRoleClaims({
    provider: provider ?? { configJson: "{}" },
    claims: input.claims,
    accessToken: input.accessToken
  });
  const policy = await resolveIdentityPolicyFromExternalClaims(input.workspaceId, input.providerId, roleClaims);
  const displayName = claimString(input.claims.name) || email;
  const directoryAttributes = {
    ...(policy.supportLine !== undefined ? { supportLine: policy.supportLine } : {}),
    ...(policy.teamName !== undefined ? { teamName: policy.teamName } : {})
  };

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
      if (existingIdentity.user.lifecycleStatus !== "ACTIVE") {
        throw new Error("Пользователь приостановлен или деактивирован.");
      }

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
          role: policy.role,
          sourceOfTruthProviderId: input.providerId,
          lastDirectorySyncAt: new Date(),
          ...directoryAttributes
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

    if (userByEmail && userByEmail.lifecycleStatus !== "ACTIVE") {
      throw new Error("Пользователь приостановлен или деактивирован.");
    }

    const linkedUser =
      userByEmail ??
      (await tx.user.create({
        data: {
          workspaceId: input.workspaceId,
          email,
          name: displayName,
          role: policy.role,
          lifecycleStatus: "ACTIVE",
          sourceOfTruthProviderId: input.providerId,
          lastDirectorySyncAt: new Date(),
          ...directoryAttributes
        }
      }));

    const needsUserUpdate =
      linkedUser.role !== policy.role ||
      linkedUser.name !== displayName ||
      linkedUser.sourceOfTruthProviderId !== input.providerId ||
      (policy.supportLine !== undefined && linkedUser.supportLine !== policy.supportLine) ||
      (policy.teamName !== undefined && linkedUser.teamName !== policy.teamName);

    const normalizedUser = needsUserUpdate
      ? await tx.user.update({
            where: { id: linkedUser.id },
            data: {
              name: displayName,
              role: policy.role,
              sourceOfTruthProviderId: input.providerId,
              lastDirectorySyncAt: new Date(),
              ...directoryAttributes
            }
          })
      : linkedUser;

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

  return {
    user,
    role: policy.role as RoleName
  };
}
