type HeaderSource = {
  get(name: string): string | null;
};

type PublicOriginOptions = {
  headers?: HeaderSource;
  requestUrl?: string | URL;
};

export class PublicOriginError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PublicOriginError";
  }
}

function isProduction() {
  return process.env.NODE_ENV === "production";
}

function firstHeaderValue(value: string | null | undefined) {
  return value?.split(",")[0]?.trim() || undefined;
}

function normalizeOrigin(value: string, source: string) {
  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    throw new PublicOriginError(`${source} must be a valid absolute URL.`);
  }

  if (parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new PublicOriginError(`${source} must contain only scheme, host, and optional port.`);
  }

  if (isProduction() && parsed.protocol !== "https:") {
    throw new PublicOriginError(`${source} must be HTTPS in production.`);
  }

  return parsed.origin;
}

function hostFromOrigin(value: string) {
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return value.trim().toLowerCase();
  }
}

function publicOriginAllowlist() {
  return new Set(
    (process.env.QC_PUBLIC_ORIGIN_ALLOWLIST ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .map(hostFromOrigin)
  );
}

function hostFromRequestUrl(requestUrl: string | URL | undefined) {
  if (!requestUrl) {
    return undefined;
  }

  const parsed = requestUrl instanceof URL ? requestUrl : new URL(requestUrl);
  return {
    host: parsed.host.toLowerCase(),
    origin: parsed.origin
  };
}

function originFromTrustedHost(host: string) {
  return `https://${host}`;
}

function localDevelopmentOrigin(options: PublicOriginOptions) {
  const requestOrigin = hostFromRequestUrl(options.requestUrl)?.origin;

  if (requestOrigin) {
    return requestOrigin;
  }

  const host = firstHeaderValue(options.headers?.get("host"))?.toLowerCase();

  if (host) {
    const protocol = host.startsWith("localhost") || host.startsWith("127.0.0.1") || host.startsWith("[::1]") ? "http" : "https";
    return `${protocol}://${host}`;
  }

  return "http://localhost:3000";
}

export function resolvePublicOrigin(options: PublicOriginOptions = {}) {
  const configuredOrigin = process.env.QC_PUBLIC_ORIGIN?.trim();

  if (configuredOrigin) {
    return normalizeOrigin(configuredOrigin, "QC_PUBLIC_ORIGIN");
  }

  const allowlist = publicOriginAllowlist();
  const forwardedHost = firstHeaderValue(options.headers?.get("x-forwarded-host"))?.toLowerCase();
  const hostHeader = firstHeaderValue(options.headers?.get("host"))?.toLowerCase();
  const requestUrlHost = hostFromRequestUrl(options.requestUrl);

  for (const host of [forwardedHost, hostHeader, requestUrlHost?.host]) {
    if (host && allowlist.has(host)) {
      return originFromTrustedHost(host);
    }
  }

  if (!isProduction()) {
    return localDevelopmentOrigin(options);
  }

  throw new PublicOriginError(
    "Configure QC_PUBLIC_ORIGIN with an HTTPS public origin, or add the public request host to QC_PUBLIC_ORIGIN_ALLOWLIST."
  );
}
