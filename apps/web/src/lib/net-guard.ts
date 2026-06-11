const PRIVATE_BASE_URL_MESSAGE =
  "Base URL указывает на локальный или приватный адрес сети — такие адреса запрещены для защиты от SSRF. " +
  "Для on-prem развёртываний в частной сети установите переменную окружения QC_ALLOW_PRIVATE_BASE_URLS=1.";

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

/**
 * Запрещает Base URL, указывающие на локальные и приватные адреса сети (защита от SSRF).
 *
 * Проверяются только литеральные IP-адреса и hostname — DNS-резолюция намеренно не выполняется,
 * поэтому DNS-rebinding (публичное имя, резолвящееся в приватный адрес) этой проверкой не закрывается.
 * Для on-prem установок в частной сети проверку можно отключить целиком
 * переменной окружения QC_ALLOW_PRIVATE_BASE_URLS=1.
 */
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

export function assertPublicBaseUrl(url: URL): void {
  if (privateBaseUrlsAllowed()) {
    return;
  }

  const hostname = canonicalHostname(url.hostname);

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
