export const LOGOUT_LOGIN_PATH = "/auth/login?loggedOut=1";

const BIND_ONLY_HOSTNAMES = new Set(["0.0.0.0", "::", "[::]"]);

function firstHeaderValue(value: string | null | undefined) {
  return value?.split(",")[0]?.trim() || undefined;
}

function hostnameFromHostHeader(host: string) {
  if (host.startsWith("[")) {
    const end = host.indexOf("]");
    return end === -1 ? host : host.slice(0, end + 1);
  }

  return host.split(":")[0] ?? host;
}

export function isBindOnlyHostname(hostname: string) {
  return BIND_ONLY_HOSTNAMES.has(hostname.trim().toLowerCase());
}

function originFromHost(host: string, protoHint?: string) {
  const hostname = hostnameFromHostHeader(host);
  if (isBindOnlyHostname(hostname)) {
    return null;
  }

  const proto =
    protoHint === "https" || protoHint === "http"
      ? protoHint
      : hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]"
        ? "http"
        : "https";

  return `${proto}://${host}`;
}

function configuredPublicOrigin() {
  for (const raw of [process.env.AUTH_URL, process.env.NEXTAUTH_URL, process.env.QC_PUBLIC_ORIGIN]) {
    const value = raw?.trim();
    if (!value) {
      continue;
    }

    try {
      const parsed = new URL(value);
      if (isBindOnlyHostname(parsed.hostname)) {
        continue;
      }
      return parsed.origin;
    } catch {
      continue;
    }
  }

  return null;
}

/**
 * Logout Location must never be the Next bind host (`0.0.0.0` / `::`).
 *
 * Next's route adapter rewrites a relative Location against the request URL.
 * When `next dev --hostname 0.0.0.0` meets `x-forwarded-proto: https`, that
 * rewrite becomes `https://0.0.0.0:3000/auth/login?loggedOut=1` — Chrome then
 * hits ERR_SSL_PROTOCOL_ERROR / chrome-error://.
 *
 * Prefer the public request host, then AUTH_URL / NEXTAUTH_URL / QC_PUBLIC_ORIGIN.
 * Fall back to a relative path only when no public host exists.
 */
export function resolveLogoutLocation(headers: Headers, requestUrl?: string | URL) {
  const forwardedProto = firstHeaderValue(headers.get("x-forwarded-proto"));
  const forwardedHost = firstHeaderValue(headers.get("x-forwarded-host"));
  const host = firstHeaderValue(headers.get("host"));
  const requestHost = (() => {
    if (!requestUrl) {
      return undefined;
    }

    try {
      return (requestUrl instanceof URL ? requestUrl : new URL(requestUrl)).host;
    } catch {
      return undefined;
    }
  })();

  for (const candidate of [forwardedHost, host, requestHost]) {
    if (!candidate) {
      continue;
    }

    const origin = originFromHost(candidate, forwardedProto);
    if (origin) {
      return new URL(LOGOUT_LOGIN_PATH, `${origin}/`).toString();
    }
  }

  const configured = configuredPublicOrigin();
  if (configured) {
    return new URL(LOGOUT_LOGIN_PATH, `${configured}/`).toString();
  }

  return LOGOUT_LOGIN_PATH;
}
