import dns from "node:dns/promises";

const PRIVATE_BASE_URL_MESSAGE =
  "Base URL указывает на локальный или приватный адрес сети — такие адреса запрещены для защиты от SSRF. " +
  "Для on-prem развёртываний в частной сети установите переменную окружения QC_ALLOW_PRIVATE_BASE_URLS=1.";

const DNS_RESOLUTION_MESSAGE =
  "Не удалось разрешить DNS-имя Base URL — адрес отклонён для защиты от SSRF. " +
  "Для on-prem развёртываний в частной сети установите переменную окружения QC_ALLOW_PRIVATE_BASE_URLS=1.";

export type PublicBaseUrlResolution = {
  url: URL;
  /** Resolved A/AAAA addresses after validation (empty when private URLs are allowed). */
  addresses: string[];
};

function privateBaseUrlsAllowed() {
  return process.env.QC_ALLOW_PRIVATE_BASE_URLS === "1";
}

function parseIpv4(hostname: string): number[] | null {
  const parts = hostname.split(".");

  if (parts.length !== 4) {
    return null;
  }

  const octets: number[] = [];

  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) {
      return null;
    }

    const value = Number(part);

    if (value > 255) {
      return null;
    }

    octets.push(value);
  }

  return octets;
}

function isPrivateIpv4(octets: number[]) {
  const [a, b] = octets;

  return (
    a === 0 || // 0.0.0.0/8 («this network»)
    a === 10 || // 10.0.0.0/8
    a === 127 || // 127.0.0.0/8 (loopback)
    (a === 169 && b === 254) || // 169.254.0.0/16 (link-local, metadata-сервисы облаков)
    (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
    (a === 192 && b === 168) || // 192.168.0.0/16
    (a === 100 && b >= 64 && b <= 127) || // 100.64.0.0/10 (CGNAT)
    (a >= 224 && a <= 239) || // 224.0.0.0/4 (multicast)
    a >= 240 // 240.0.0.0/4 (reserved, включая 255.255.255.255)
  );
}

function parseIpv6(hostname: string): number[] | null {
  const sections = hostname.split("::");

  if (sections.length > 2) {
    return null;
  }

  const splitGroups = (section: string) => (section ? section.split(":") : []);
  const head = splitGroups(sections[0]);
  const tail = sections.length === 2 ? splitGroups(sections[1]) : [];
  const groups = sections.length === 2 ? tail : head;
  const lastGroup = groups[groups.length - 1];

  if (lastGroup && lastGroup.includes(".")) {
    const embedded = parseIpv4(lastGroup);

    if (!embedded) {
      return null;
    }

    groups.splice(
      groups.length - 1,
      1,
      (((embedded[0] << 8) | embedded[1]) >>> 0).toString(16),
      (((embedded[2] << 8) | embedded[3]) >>> 0).toString(16)
    );
  }

  const totalGroups = head.length + tail.length;

  if (sections.length === 2 ? totalGroups > 7 : totalGroups !== 8) {
    return null;
  }

  const words: number[] = [];
  const pushGroup = (group: string) => {
    if (!/^[0-9a-fA-F]{1,4}$/.test(group)) {
      return false;
    }

    words.push(Number.parseInt(group, 16));
    return true;
  };

  for (const group of head) {
    if (!pushGroup(group)) {
      return null;
    }
  }

  if (sections.length === 2) {
    for (let index = totalGroups; index < 8; index += 1) {
      words.push(0);
    }
  }

  for (const group of tail) {
    if (!pushGroup(group)) {
      return null;
    }
  }

  return words.length === 8 ? words : null;
}

function isPrivateIpv6(words: number[]) {
  const leadingZeroWords = words.filter((word, index) => index < 7 && word === 0).length;

  if (leadingZeroWords === 7 && (words[7] === 0 || words[7] === 1)) {
    // :: (unspecified) и ::1 (loopback)
    return true;
  }

  if ((words[0] & 0xfe00) === 0xfc00) {
    // fc00::/7 (unique local)
    return true;
  }

  if ((words[0] & 0xffc0) === 0xfe80) {
    // fe80::/10 (link-local)
    return true;
  }

  if (words[0] === 0 && words[1] === 0 && words[2] === 0 && words[3] === 0 && words[4] === 0 && words[5] === 0xffff) {
    // ::ffff:a.b.c.d (IPv4-mapped) — перепроверяем вложенный IPv4-адрес.
    return isPrivateIpv4([words[6] >> 8, words[6] & 0xff, words[7] >> 8, words[7] & 0xff]);
  }

  return false;
}

function isBlockedIpAddress(address: string): boolean {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, "");
  const octets = parseIpv4(normalized);

  if (octets) {
    return isPrivateIpv4(octets);
  }

  const words = parseIpv6(normalized);

  if (words) {
    return isPrivateIpv6(words);
  }

  // Неразборчивый адрес — fail-closed.
  return true;
}

/**
 * Directory / LDAPS targets may live on RFC1918 and IPv6 ULA hosts (on-prem AD).
 * Still block loopback, link-local/metadata, multicast, and unspecified — those are
 * SSRF / cloud-metadata vectors, not legitimate DCs.
 */
function isDirectoryBlockedIpv4(octets: number[]) {
  const [a, b] = octets;

  return (
    a === 0 || // 0.0.0.0/8 (unspecified / «this network»)
    a === 127 || // 127.0.0.0/8 (loopback)
    (a === 169 && b === 254) || // 169.254.0.0/16 (link-local, metadata)
    (a >= 224 && a <= 239) // 224.0.0.0/4 (multicast)
  );
}

function isDirectoryBlockedIpv6(words: number[]) {
  const leadingZeroWords = words.filter((word, index) => index < 7 && word === 0).length;

  if (leadingZeroWords === 7 && (words[7] === 0 || words[7] === 1)) {
    // :: (unspecified) и ::1 (loopback)
    return true;
  }

  if ((words[0] & 0xffc0) === 0xfe80) {
    // fe80::/10 (link-local)
    return true;
  }

  if ((words[0] & 0xff00) === 0xff00) {
    // ff00::/8 (multicast)
    return true;
  }

  if (words[0] === 0 && words[1] === 0 && words[2] === 0 && words[3] === 0 && words[4] === 0 && words[5] === 0xffff) {
    // ::ffff:a.b.c.d — перепроверяем вложенный IPv4 по directory-правилам.
    return isDirectoryBlockedIpv4([words[6] >> 8, words[6] & 0xff, words[7] >> 8, words[7] & 0xff]);
  }

  return false;
}

function isDirectoryBlockedIpAddress(address: string): boolean {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, "");
  const octets = parseIpv4(normalized);

  if (octets) {
    return isDirectoryBlockedIpv4(octets);
  }

  const words = parseIpv6(normalized);

  if (words) {
    return isDirectoryBlockedIpv6(words);
  }

  // Неразборчивый адрес — fail-closed.
  return true;
}

function isBlockedMetadataHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");

  return (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized === "metadata.google.internal" ||
    normalized.endsWith(".metadata.google.internal") ||
    normalized === "metadata" ||
    normalized === "instance-data" ||
    normalized.endsWith(".instance-data")
  );
}

/**
 * Для непрозрачных схем (grpc:, grpcs:) WHATWG-парсер не канонизирует хост, поэтому
 * сокращённые формы IPv4 (127.1, 0x7f000001, 2130706433) обошли бы проверку диапазонов.
 * Прогон хоста через http-парсер приводит их к каноническому виду a.b.c.d.
 */
function canonicalHostname(rawHostname: string): string {
  const hostname = rawHostname.toLowerCase().replace(/\.$/, "");

  try {
    return new URL(`http://${hostname}/`).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return hostname;
  }
}

function assertHostnameNotPrivate(hostname: string): void {
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new Error(PRIVATE_BASE_URL_MESSAGE);
  }

  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    const words = parseIpv6(hostname.slice(1, -1));

    if (words && isPrivateIpv6(words)) {
      throw new Error(PRIVATE_BASE_URL_MESSAGE);
    }

    return;
  }

  const octets = parseIpv4(hostname);

  if (octets && isPrivateIpv4(octets)) {
    throw new Error(PRIVATE_BASE_URL_MESSAGE);
  }
}

function isIpLiteralHostname(hostname: string): boolean {
  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    return parseIpv6(hostname.slice(1, -1)) !== null;
  }

  return parseIpv4(hostname) !== null;
}

async function resolveHostnameAddresses(hostname: string): Promise<string[]> {
  try {
    const records = await dns.lookup(hostname, { all: true, verbatim: true });
    return records.map((record) => record.address);
  } catch {
    // Fallback: gather A + AAAA independently (some environments restrict lookup({ all })).
    const addresses: string[] = [];
    const [v4, v6] = await Promise.allSettled([dns.resolve4(hostname), dns.resolve6(hostname)]);

    if (v4.status === "fulfilled") {
      addresses.push(...v4.value);
    }

    if (v6.status === "fulfilled") {
      addresses.push(...v6.value);
    }

    if (addresses.length === 0) {
      throw new Error(DNS_RESOLUTION_MESSAGE);
    }

    return addresses;
  }
}

/**
 * Запрещает Base URL, указывающие на локальные и приватные адреса сети (защита от SSRF).
 *
 * Проверяются литеральные IP, hostname (localhost) и DNS-резолюция имени: если имя
 * резолвится в приватный / link-local / metadata-адрес, URL отклоняется (DNS rebinding).
 * Для on-prem установок в частной сети проверку можно отключить целиком
 * переменной окружения QC_ALLOW_PRIVATE_BASE_URLS=1.
 */
export async function resolvePublicBaseUrl(url: URL): Promise<PublicBaseUrlResolution> {
  if (privateBaseUrlsAllowed()) {
    return { url, addresses: [] };
  }

  const hostname = canonicalHostname(url.hostname);
  assertHostnameNotPrivate(hostname);

  if (isIpLiteralHostname(hostname)) {
    const address = hostname.startsWith("[") ? hostname.slice(1, -1) : hostname;
    return { url, addresses: [address] };
  }

  const addresses = await resolveHostnameAddresses(hostname);

  if (addresses.length === 0) {
    throw new Error(DNS_RESOLUTION_MESSAGE);
  }

  for (const address of addresses) {
    if (isBlockedIpAddress(address)) {
      throw new Error(PRIVATE_BASE_URL_MESSAGE);
    }
  }

  return { url, addresses };
}

export async function assertPublicBaseUrl(url: URL): Promise<void> {
  await resolvePublicBaseUrl(url);
}

const DIRECTORY_SERVICE_BASE_URL_MESSAGE =
  "Адрес службы каталогов указывает на loopback, link-local, metadata или multicast — такие адреса запрещены.";

const DIRECTORY_DNS_RESOLUTION_MESSAGE =
  "Не удалось разрешить DNS-имя адреса службы каталогов — адрес отклонён.";

function assertHostnameNotDirectoryBlocked(hostname: string): void {
  if (isBlockedMetadataHostname(hostname)) {
    throw new Error(DIRECTORY_SERVICE_BASE_URL_MESSAGE);
  }

  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    const words = parseIpv6(hostname.slice(1, -1));

    if (words && isDirectoryBlockedIpv6(words)) {
      throw new Error(DIRECTORY_SERVICE_BASE_URL_MESSAGE);
    }

    return;
  }

  const octets = parseIpv4(hostname);

  if (octets && isDirectoryBlockedIpv4(octets)) {
    throw new Error(DIRECTORY_SERVICE_BASE_URL_MESSAGE);
  }
}

/**
 * SSRF gate for directory services (LDAPS / on-prem AD).
 * Allows RFC1918 and IPv6 ULA without QC_ALLOW_PRIVATE_BASE_URLS.
 * Still rejects loopback, link-local/metadata, multicast, and unspecified.
 */
export async function resolveDirectoryServiceBaseUrl(url: URL): Promise<PublicBaseUrlResolution> {
  const hostname = canonicalHostname(url.hostname);
  assertHostnameNotDirectoryBlocked(hostname);

  if (isIpLiteralHostname(hostname)) {
    const address = hostname.startsWith("[") ? hostname.slice(1, -1) : hostname;
    if (isDirectoryBlockedIpAddress(address)) {
      throw new Error(DIRECTORY_SERVICE_BASE_URL_MESSAGE);
    }
    return { url, addresses: [address] };
  }

  const addresses = await resolveHostnameAddresses(hostname).catch(() => {
    throw new Error(DIRECTORY_DNS_RESOLUTION_MESSAGE);
  });

  if (addresses.length === 0) {
    throw new Error(DIRECTORY_DNS_RESOLUTION_MESSAGE);
  }

  for (const address of addresses) {
    if (isDirectoryBlockedIpAddress(address)) {
      throw new Error(DIRECTORY_SERVICE_BASE_URL_MESSAGE);
    }
  }

  return { url, addresses };
}

export async function assertDirectoryServiceBaseUrl(url: URL): Promise<void> {
  await resolveDirectoryServiceBaseUrl(url);
}

const REDIRECT_HOP_LIMIT_MESSAGE =
  "Слишком много перенаправлений при запросе к внешнему URL — запрос отклонён для защиты от SSRF.";

const SENSITIVE_REDIRECT_HEADERS = ["authorization", "proxy-authorization", "cookie", "cookie2"] as const;

function stripSensitiveRedirectHeaders(headers: HeadersInit | undefined): Headers {
  const nextHeaders = new Headers(headers);

  for (const name of SENSITIVE_REDIRECT_HEADERS) {
    nextHeaders.delete(name);
  }

  return nextHeaders;
}

export type GuardedFetchInit = RequestInit & {
  /** Max redirect hops to follow (default 5). Each hop re-runs resolvePublicBaseUrl. */
  maxRedirects?: number;
};

/**
 * fetch() with pre-flight SSRF DNS validation on the initial URL and every redirect Location.
 * Always uses redirect:"manual" so the runtime cannot follow a private hop before we re-assert.
 *
 * Note: this is not true connection-level DNS pinning — `fetch` may re-resolve the hostname
 * after our check (TOCTOU). Prefer literal IPs in trusted configs when pinning is required.
 */
export async function guardedFetch(input: string | URL, init: GuardedFetchInit = {}): Promise<Response> {
  const maxRedirects = init.maxRedirects ?? 5;
  const { maxRedirects: _maxRedirects, redirect: _redirect, ...rest } = init;

  let current = typeof input === "string" ? new URL(input) : new URL(input.href);
  let method = rest.method;
  let body = rest.body;
  let headers = rest.headers;

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    await resolvePublicBaseUrl(current);

    // Pass href string so test doubles and wrappers that match on string URLs keep working.
    const response = await fetch(current.href, {
      ...rest,
      method,
      body,
      headers,
      redirect: "manual"
    });

    // Incomplete/mocked Responses (no numeric status) are treated as final.
    const status = response.status;
    if (typeof status !== "number" || status < 300 || status >= 400) {
      return response;
    }

    const location = response.headers?.get?.("location");
    if (!location) {
      return response;
    }

    let next: URL;
    try {
      next = new URL(location, current);
    } catch {
      throw new Error(PRIVATE_BASE_URL_MESSAGE);
    }

    if (next.protocol !== "http:" && next.protocol !== "https:") {
      throw new Error(PRIVATE_BASE_URL_MESSAGE);
    }

    const crossHost = next.host !== current.host || next.origin !== current.origin;

    // Drop body on classic redirect semantics (301/302/303) so we do not replay POST to a new host.
    if (
      response.status === 303 ||
      ((response.status === 301 || response.status === 302) && method && method !== "GET" && method !== "HEAD")
    ) {
      method = "GET";
      body = undefined;
      if (headers) {
        const nextHeaders = new Headers(headers);
        nextHeaders.delete("content-type");
        nextHeaders.delete("content-length");
        headers = nextHeaders;
      }
    }

    // Cross-host redirects must not forward credentials (Fetch CORS / SSRF hygiene).
    if (crossHost) {
      headers = stripSensitiveRedirectHeaders(headers);

      // 307/308 preserve method+body by default — drop body across hosts to be safer.
      if (response.status === 307 || response.status === 308) {
        body = undefined;
        if (headers) {
          const nextHeaders = new Headers(headers);
          nextHeaders.delete("content-type");
          nextHeaders.delete("content-length");
          headers = nextHeaders;
        }
      }
    }

    current = next;
  }

  throw new Error(REDIRECT_HOP_LIMIT_MESSAGE);
}
