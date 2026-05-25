import type { IdentityProvider } from "@prisma/client";

const sensitiveConfigKeyPattern =
  /(?:^|[_-])(?:authorization|authorizationheader|authheader|password|samlresponse|secret|token|accesstoken|refreshtoken|idtoken|api[_-]?key|client[_-]?secret)(?:$|[_-])/i;
const sensitiveConfigValuePattern = /\b(?:authorization\s*:|bearer\s+[a-z0-9._~+/=-]{12,}|samlresponse\s*=)/i;

type ProviderEndpointInput = Pick<
  IdentityProvider,
  "type" | "authorizationUrl" | "tokenUrl" | "jwksUrl" | "samlMetadataUrl" | "configJson"
>;

function pathLabel(path: string[]) {
  return path.length ? path.join(".") : "config";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function assertSafeProviderConfigValue(value: unknown, path: string[]): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertSafeProviderConfigValue(item, [...path, String(index)]));
    return;
  }

  if (isPlainObject(value)) {
    for (const [key, nestedValue] of Object.entries(value)) {
      if (sensitiveConfigKeyPattern.test(key.replace(/\s+/g, ""))) {
        throw new Error(`JSON-конфигурация провайдера не должна содержать секретные поля (${pathLabel([...path, key])}).`);
      }

      assertSafeProviderConfigValue(nestedValue, [...path, key]);
    }
    return;
  }

  if (typeof value === "string" && sensitiveConfigValuePattern.test(value)) {
    throw new Error(`JSON-конфигурация провайдера не должна содержать секретные значения (${pathLabel(path)}).`);
  }
}

export function assertSafeProviderConfig(config: Record<string, unknown>) {
  assertSafeProviderConfigValue(config, []);
}

function redactSensitiveConfigValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactSensitiveConfigValue);
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        sensitiveConfigKeyPattern.test(key.replace(/\s+/g, "")) ? "[redacted]" : redactSensitiveConfigValue(nestedValue)
      ])
    );
  }

  if (typeof value === "string" && sensitiveConfigValuePattern.test(value)) {
    return "[redacted]";
  }

  return value;
}

export function sanitizeProviderConfigForDisplay(configJson: string | null | undefined) {
  if (!configJson) {
    return "";
  }

  try {
    const parsed = JSON.parse(configJson) as unknown;
    return JSON.stringify(redactSensitiveConfigValue(parsed), null, 2);
  } catch {
    return "";
  }
}

function providerConfig(configJson: string | null | undefined) {
  if (!configJson) {
    return {};
  }

  try {
    const parsed = JSON.parse(configJson) as unknown;
    return isPlainObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function assertHttpsOrLocalUrl(value: string | null | undefined, label: string) {
  const raw = value?.trim();

  if (!raw) {
    return;
  }

  let url: URL;

  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${label} должен быть корректным URL.`);
  }

  const hostname = url.hostname.toLowerCase();
  const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";

  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLocalhost)) {
    throw new Error(`${label} должен использовать HTTPS; HTTP разрешен только для localhost/dev.`);
  }
}

export function assertProviderEndpointUrls(input: ProviderEndpointInput) {
  const config = providerConfig(input.configJson);

  if (input.type === "MICROSOFT_ENTRA_ID" || input.type === "OIDC") {
    assertHttpsOrLocalUrl(input.authorizationUrl, "Адрес авторизации");
    assertHttpsOrLocalUrl(input.tokenUrl, "Адрес токена");
    assertHttpsOrLocalUrl(input.jwksUrl, "Адрес ключей JWKS");
  }

  if (input.type === "SAML") {
    assertHttpsOrLocalUrl(stringValue(config.idpSsoUrl) || input.authorizationUrl, "SAML IdP SSO URL");
    assertHttpsOrLocalUrl(input.samlMetadataUrl, "SAML Metadata URL IdP");
  }
}
