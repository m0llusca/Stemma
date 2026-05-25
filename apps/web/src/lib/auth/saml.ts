import { SAML, ValidateInResponseTo, generateServiceProviderMetadata, type CacheProvider, type Profile } from "@node-saml/node-saml";
import type { IdentityProvider, RoleName } from "@prisma/client";
import { isManagedSecretReference } from "@/lib/auth/oidc";
import { resolveIdentityPolicyFromExternalClaims } from "@/lib/auth/providers";
import { createAuthSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

type SamlProvider = Pick<
  IdentityProvider,
  | "id"
  | "workspaceId"
  | "slug"
  | "issuer"
  | "authorizationUrl"
  | "samlEntityId"
  | "samlCertificateRef"
  | "configJson"
>;

type SamlProviderConfig = {
  idpCerts?: unknown;
  idpCertRefs?: unknown;
  idpSsoUrl?: unknown;
  idpIssuer?: unknown;
  acceptedClockSkewMs?: unknown;
  requestIdExpirationMs?: unknown;
  maxAssertionAgeMs?: unknown;
  wantAssertionsSigned?: unknown;
  wantAuthnResponseSigned?: unknown;
  attributeMappings?: {
    email?: unknown;
    displayName?: unknown;
    groups?: unknown;
    roles?: unknown;
    supportLine?: unknown;
    teamName?: unknown;
  };
};

const defaultRequestIdExpirationMs = 10 * 60 * 1000;
const defaultClockSkewMs = 2 * 60 * 1000;

function isProductionRuntime() {
  return process.env.NODE_ENV === "production";
}

function parseConfig(configJson: string | null | undefined): SamlProviderConfig {
  if (!configJson) {
    return {};
  }

  try {
    const parsed = JSON.parse(configJson) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as SamlProviderConfig) : {};
  } catch {
    return {};
  }
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function stringList(value: unknown) {
  if (Array.isArray(value)) {
    return value.map(stringValue).filter(Boolean);
  }

  const single = stringValue(value);
  return single ? [single] : [];
}

function splitRefList(value: string | null | undefined) {
  return (value ?? "")
    .split(/[\n,;]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function envSecret(ref: string) {
  if (!ref.startsWith("env:")) {
    if (isManagedSecretReference(ref)) {
      throw new Error("SAML сертификат использует vault:/secret:-ссылку, но в текущем runtime исполняются только env:-ссылки.");
    }

    return null;
  }

  return process.env[ref.slice("env:".length)]?.trim() || "";
}

function assertDevInlineCertificateAllowed(value: string) {
  if (isProductionRuntime() && !isManagedSecretReference(value)) {
    throw new Error("SAML сертификаты IdP в production должны храниться как env:/vault:-ссылки, а не inline-значения.");
  }
}

function resolveSamlSignaturePolicy(config: SamlProviderConfig) {
  const wantAssertionsSigned = typeof config.wantAssertionsSigned === "boolean" ? config.wantAssertionsSigned : true;
  const wantAuthnResponseSigned = typeof config.wantAuthnResponseSigned === "boolean" ? config.wantAuthnResponseSigned : true;

  if (!wantAssertionsSigned && !wantAuthnResponseSigned) {
    throw new Error("SAML провайдер должен требовать подпись assertion или response.");
  }

  return {
    wantAssertionsSigned,
    wantAuthnResponseSigned
  };
}

export function validateSamlProviderConfigForSave(input: { type: IdentityProvider["type"]; samlCertificateRef?: string | null; config: Record<string, unknown> }) {
  if (input.type !== "SAML") {
    return;
  }

  resolveSamlSignaturePolicy(input.config as SamlProviderConfig);

  for (const ref of splitRefList(input.samlCertificateRef)) {
    assertDevInlineCertificateAllowed(ref);
  }

  for (const cert of stringList((input.config as SamlProviderConfig).idpCerts)) {
    assertDevInlineCertificateAllowed(cert);
  }

  for (const ref of stringList((input.config as SamlProviderConfig).idpCertRefs)) {
    assertDevInlineCertificateAllowed(ref);
  }
}

function resolveIdpCertificates(provider: SamlProvider) {
  const config = parseConfig(provider.configJson);
  const refs = [...splitRefList(provider.samlCertificateRef), ...stringList(config.idpCertRefs)];
  const inlineCerts = stringList(config.idpCerts);
  const certs: string[] = [];

  for (const ref of refs) {
    const resolved = envSecret(ref);

    if (resolved) {
      certs.push(resolved);
      continue;
    }

    if (resolved === "") {
      throw new Error("SAML сертификат IdP не найден в окружении.");
    }

    assertDevInlineCertificateAllowed(ref);
    certs.push(ref);
  }

  for (const cert of inlineCerts) {
    assertDevInlineCertificateAllowed(cert);
    certs.push(cert);
  }

  if (!certs.length) {
    throw new Error("Для SAML провайдера не настроены сертификаты IdP.");
  }

  return certs;
}

function numberValue(value: unknown, fallback: number, min: number, max: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

export function samlServiceProviderMetadataPath(provider: Pick<IdentityProvider, "id" | "workspaceId">) {
  const params = new URLSearchParams({
    providerId: provider.id,
    workspaceId: provider.workspaceId
  });

  return `/auth/saml/metadata?${params.toString()}`;
}

export function samlAssertionConsumerServicePath(provider: Pick<IdentityProvider, "id" | "workspaceId">) {
  const params = new URLSearchParams({
    providerId: provider.id,
    workspaceId: provider.workspaceId
  });

  return `/auth/saml/acs?${params.toString()}`;
}

export function buildSamlServiceProviderUrls(provider: Pick<IdentityProvider, "id" | "workspaceId" | "samlEntityId">, origin: string) {
  const metadataUrl = new URL(samlServiceProviderMetadataPath(provider), origin).toString();
  const acsUrl = new URL(samlAssertionConsumerServicePath(provider), origin).toString();

  return {
    entityId: provider.samlEntityId?.trim() || metadataUrl,
    metadataUrl,
    acsUrl
  };
}

export class PrismaSamlCacheProvider implements CacheProvider {
  constructor(
    private readonly provider: Pick<IdentityProvider, "id" | "workspaceId">,
    private readonly requestIdExpirationMs: number
  ) {}

  private cacheKey(key: string) {
    return `${this.provider.id}:${key}`;
  }

  async saveAsync(key: string, value: string) {
    const now = Date.now();
    await prisma.ssoRequestState.deleteMany({
      where: {
        providerId: this.provider.id,
        expiresAt: { lte: new Date(now) }
      }
    });
    await prisma.ssoRequestState.upsert({
      where: { key: this.cacheKey(key) },
      create: {
        key: this.cacheKey(key),
        workspaceId: this.provider.workspaceId,
        providerId: this.provider.id,
        value,
        expiresAt: new Date(now + this.requestIdExpirationMs),
        consumedAt: null
      },
      update: {
        value,
        expiresAt: new Date(now + this.requestIdExpirationMs),
        consumedAt: null
      }
    });

    return { value, createdAt: now };
  }

  async getAsync(key: string) {
    const cacheKey = this.cacheKey(key);
    const now = new Date();
    const row = await prisma.$transaction(async (tx) => {
      const candidate = await tx.ssoRequestState.findUnique({
        where: { key: cacheKey }
      });

      if (!candidate || candidate.expiresAt <= now || candidate.consumedAt) {
        return null;
      }

      const consumed = await tx.ssoRequestState.updateMany({
        where: {
          key: cacheKey,
          consumedAt: null,
          expiresAt: { gt: now }
        },
        data: {
          consumedAt: now
        }
      });

      return consumed.count === 1 ? candidate : null;
    });

    return row?.value ?? null;
  }

  async removeAsync(key: string | null) {
    if (!key) {
      return null;
    }

    await prisma.ssoRequestState.updateMany({
      where: {
        key: this.cacheKey(key),
        consumedAt: null
      },
      data: {
        consumedAt: new Date()
      }
    });

    return key;
  }
}

function buildSaml(provider: SamlProvider, origin: string) {
  const config = parseConfig(provider.configJson);
  const urls = buildSamlServiceProviderUrls(provider, origin);
  const requestIdExpirationMs = numberValue(config.requestIdExpirationMs, defaultRequestIdExpirationMs, 60_000, 60 * 60 * 1000);
  const signaturePolicy = resolveSamlSignaturePolicy(config);

  return new SAML({
    issuer: urls.entityId,
    callbackUrl: urls.acsUrl,
    entryPoint: stringValue(config.idpSsoUrl) || provider.authorizationUrl || undefined,
    idpIssuer: stringValue(config.idpIssuer) || provider.issuer || undefined,
    idpCert: resolveIdpCertificates(provider),
    audience: urls.entityId,
    acceptedClockSkewMs: numberValue(config.acceptedClockSkewMs, defaultClockSkewMs, 0, 10 * 60 * 1000),
    maxAssertionAgeMs: numberValue(config.maxAssertionAgeMs, 5 * 60 * 1000, 60_000, 60 * 60 * 1000),
    validateInResponseTo: ValidateInResponseTo.always,
    requestIdExpirationPeriodMs: requestIdExpirationMs,
    cacheProvider: new PrismaSamlCacheProvider(provider, requestIdExpirationMs),
    wantAssertionsSigned: signaturePolicy.wantAssertionsSigned,
    wantAuthnResponseSigned: signaturePolicy.wantAuthnResponseSigned,
    signatureAlgorithm: "sha256"
  });
}

export function generateSamlMetadata(provider: SamlProvider, origin: string) {
  const urls = buildSamlServiceProviderUrls(provider, origin);

  return generateServiceProviderMetadata({
    issuer: urls.entityId,
    callbackUrl: urls.acsUrl,
    wantAssertionsSigned: true
  });
}

export async function buildSamlAuthorizationUrl(input: { provider: SamlProvider; origin: string; relayState: string }) {
  const config = parseConfig(input.provider.configJson);
  const entryPoint = stringValue(config.idpSsoUrl) || input.provider.authorizationUrl;

  if (!entryPoint) {
    throw new Error("Для SAML провайдера не настроен IdP SSO URL.");
  }

  return buildSaml(input.provider, input.origin).getAuthorizeUrlAsync(input.relayState, undefined, {});
}

export async function validateSamlPostResponse(input: { provider: SamlProvider; origin: string; samlResponse: string }) {
  const result = await buildSaml(input.provider, input.origin).validatePostResponseAsync({
    SAMLResponse: input.samlResponse
  });

  if (!result.profile || result.loggedOut) {
    throw new Error("SAML Response не содержит профиля пользователя.");
  }

  return result.profile;
}

function profileValues(profile: Profile, keys: string[]) {
  for (const key of keys) {
    const value = profile[key];
    const values = Array.isArray(value) ? value.map(stringValue).filter(Boolean) : [stringValue(value)].filter(Boolean);

    if (values.length) {
      return values;
    }
  }

  return [];
}

function firstProfileValue(profile: Profile, keys: string[]) {
  return profileValues(profile, keys)[0] ?? "";
}

function profileMappingKeys(provider: SamlProvider, name: keyof NonNullable<SamlProviderConfig["attributeMappings"]>, fallback: string[]) {
  const mapped = stringList(parseConfig(provider.configJson).attributeMappings?.[name]);
  return mapped.length ? mapped : fallback;
}

function serializableProfile(profile: Profile) {
  return Object.fromEntries(Object.entries(profile).filter(([, value]) => typeof value !== "function"));
}

export async function upsertUserFromSamlProfile(input: {
  workspaceId: string;
  providerId: string;
  profile: Profile;
  userAgent?: string | null;
}) {
  const provider = await prisma.identityProvider.findUnique({
    where: { id: input.providerId },
    select: {
      id: true,
      workspaceId: true,
      slug: true,
      issuer: true,
      authorizationUrl: true,
      samlEntityId: true,
      samlCertificateRef: true,
      configJson: true
    }
  });

  if (!provider) {
    throw new Error("SAML провайдер не найден.");
  }

  const email = firstProfileValue(
    input.profile,
    profileMappingKeys(provider, "email", [
      "email",
      "mail",
      "urn:oid:0.9.2342.19200300.100.1.3",
      "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress"
    ])
  );
  const nameId = stringValue(input.profile.nameID);
  const providerSubject = nameId ? `${stringValue(input.profile.issuer) || provider.id}:${nameId}` : "";

  if (!email) {
    throw new Error("SAML Assertion не содержит email.");
  }

  if (!providerSubject) {
    throw new Error("SAML Assertion не содержит NameID.");
  }

  const displayName =
    firstProfileValue(
      input.profile,
      profileMappingKeys(provider, "displayName", [
        "displayName",
        "name",
        "http://schemas.microsoft.com/identity/claims/displayname",
        "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name"
      ])
    ) || email;
  const roleClaims = {
    appRoles: profileValues(input.profile, profileMappingKeys(provider, "roles", ["roles", "role", "appRole"])),
    groups: profileValues(input.profile, profileMappingKeys(provider, "groups", ["groups", "group", "memberOf"])),
    supportLine: firstProfileValue(input.profile, profileMappingKeys(provider, "supportLine", ["supportLine", "department"])),
    teamName: firstProfileValue(input.profile, profileMappingKeys(provider, "teamName", ["teamName", "division"])),
    attributes: serializableProfile(input.profile)
  };
  const policy = await resolveIdentityPolicyFromExternalClaims(input.workspaceId, input.providerId, roleClaims);
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
      include: { user: true }
    });

    if (existingIdentity) {
      await tx.externalIdentity.update({
        where: { id: existingIdentity.id },
        data: {
          email,
          displayName,
          rawClaimsJson: JSON.stringify(roleClaims.attributes),
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
        rawClaimsJson: JSON.stringify(roleClaims.attributes),
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
    role: policy.role as RoleName
  };
}
