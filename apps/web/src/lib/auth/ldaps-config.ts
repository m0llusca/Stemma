import type { IdentityProvider } from "@prisma/client";
import { assertSupportedSecretReference } from "@/lib/auth/secret-refs";

export type MissingUserAction = "none" | "suspend" | "deprovision";

export type ParsedLdapsConfig = {
  userSearchBase: string;
  groupSearchBase: string;
  userFilter: string;
  groupFilter: string;
  nestedGroups: boolean;
  pageSize: number;
  timeoutMs: number;
  connectTimeoutMs: number;
  caCertRefs: string[];
  caFileRefs: string[];
  binaryAttributes: string[];
  missingUserAction: MissingUserAction;
  userAttributes: {
    subject: string;
    externalId: string;
    email: string[];
    displayName: string[];
    disabled: string;
    memberOf: string;
    supportLine: string[];
    teamName: string[];
  };
  groupAttributes: {
    id: string;
    name: string[];
    member: string;
  };
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function parseLdapsConfigRecord(configJson: string | null | undefined) {
  try {
    const parsed = JSON.parse(configJson || "{}") as unknown;
    return isPlainObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function stringArray(value: unknown, fallback: string[] = []) {
  if (Array.isArray(value)) {
    return value.map((item) => stringValue(item)).filter(Boolean);
  }

  const single = stringValue(value);
  return single ? [single] : fallback;
}

function numberValue(value: unknown, fallback: number, min: number, max: number) {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) ? Math.min(Math.max(parsed, min), max) : fallback;
}

function booleanValue(value: unknown) {
  return value === true || value === "true";
}

function missingActionValue(value: unknown): MissingUserAction {
  return value === "suspend" || value === "deprovision" ? value : "none";
}

export function parseLdapsConfig(provider: Pick<IdentityProvider, "configJson">): ParsedLdapsConfig {
  const config = parseLdapsConfigRecord(provider.configJson);
  const ldaps = isPlainObject(config.ldaps) ? config.ldaps : config;
  const userAttributes = isPlainObject(ldaps.userAttributes) ? ldaps.userAttributes : {};
  const groupAttributes = isPlainObject(ldaps.groupAttributes) ? ldaps.groupAttributes : {};
  const subjectAttribute = stringValue(userAttributes.subject, "objectGUID");
  const externalIdAttribute = stringValue(userAttributes.externalId, "objectGUID");
  const groupIdAttribute = stringValue(groupAttributes.id, "dn");
  const configuredBinaryAttributes = stringArray(ldaps.binaryAttributes);
  const likelyBinaryAttributes = [subjectAttribute, externalIdAttribute, groupIdAttribute].filter((attribute) =>
    ["objectguid", "objectsid"].includes(attribute.toLowerCase())
  );

  return {
    userSearchBase: stringValue(ldaps.userSearchBase),
    groupSearchBase: stringValue(ldaps.groupSearchBase),
    userFilter: stringValue(ldaps.userFilter, "(&(objectClass=user)(!(objectClass=computer)))"),
    groupFilter: stringValue(ldaps.groupFilter, "(objectClass=group)"),
    nestedGroups: booleanValue(ldaps.nestedGroups),
    pageSize: numberValue(ldaps.pageSize, 500, 50, 5000),
    timeoutMs: numberValue(ldaps.timeoutMs, 15_000, 1000, 120_000),
    connectTimeoutMs: numberValue(ldaps.connectTimeoutMs, 5000, 1000, 60_000),
    caCertRefs: stringArray(ldaps.caCertRefs ?? ldaps.caCertRef),
    caFileRefs: stringArray(ldaps.caFileRefs ?? ldaps.caFileRef),
    binaryAttributes: [...new Set([...configuredBinaryAttributes, ...likelyBinaryAttributes])],
    missingUserAction: missingActionValue(ldaps.missingUserAction),
    userAttributes: {
      subject: subjectAttribute,
      externalId: externalIdAttribute,
      email: stringArray(userAttributes.email, ["mail", "userPrincipalName"]),
      displayName: stringArray(userAttributes.displayName, ["displayName", "cn", "sAMAccountName"]),
      disabled: stringValue(userAttributes.disabled, "userAccountControl"),
      memberOf: stringValue(userAttributes.memberOf, "memberOf"),
      supportLine: stringArray(userAttributes.supportLine, ["department", "extensionAttribute1"]),
      teamName: stringArray(userAttributes.teamName, ["division", "extensionAttribute2"])
    },
    groupAttributes: {
      id: groupIdAttribute,
      name: stringArray(groupAttributes.name, ["cn", "name"]),
      member: stringValue(groupAttributes.member, "member")
    }
  };
}

export function assertLdapsUrl(value: string | null | undefined) {
  const raw = value?.trim();
  if (!raw) {
    throw new Error("Для Active Directory LDAPS укажите ldapsUrl.");
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("ldapsUrl должен быть корректным URL.");
  }

  if (url.protocol !== "ldaps:") {
    throw new Error("Active Directory подключается только по LDAPS; plaintext LDAP запрещен.");
  }

  if (url.username || url.password || url.search || url.hash) {
    throw new Error("ldapsUrl не должен содержать username/password, query или fragment.");
  }
}

function assertSecretReference(value: string | null | undefined, label: string) {
  assertSupportedSecretReference(value, label);
}

export function validateLdapsProviderConfigForSave(input: {
  type: IdentityProvider["type"];
  status: string;
  ldapsUrl?: string | null;
  ldapsBindDn?: string | null;
  ldapsBindSecretRef?: string | null;
  config: Record<string, unknown>;
}) {
  if (input.type !== "ACTIVE_DIRECTORY_LDAPS") {
    return;
  }

  if (input.ldapsUrl) {
    assertLdapsUrl(input.ldapsUrl);
  }

  assertSecretReference(input.ldapsBindSecretRef, "Секрет bind-учетной записи LDAPS");

  const parsed = parseLdapsConfig({ configJson: JSON.stringify(input.config) });

  for (const ref of [...parsed.caCertRefs, ...parsed.caFileRefs]) {
    assertSecretReference(ref, "CA-сертификат LDAPS");
  }

  if (input.status !== "active") {
    return;
  }

  assertLdapsUrl(input.ldapsUrl);

  if (!input.ldapsBindDn?.trim()) {
    throw new Error("Для активного LDAPS-провайдера нужен bind DN сервисной учетной записи.");
  }

  if (!input.ldapsBindSecretRef?.trim()) {
    throw new Error("Для активного LDAPS-провайдера нужна ссылка на bind-секрет.");
  }

  if (!parsed.userSearchBase || !parsed.groupSearchBase) {
    throw new Error("Для активного LDAPS-провайдера нужны userSearchBase и groupSearchBase в JSON-конфигурации.");
  }
}
