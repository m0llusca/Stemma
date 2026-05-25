import { readFileSync } from "node:fs";
import type { ConnectionOptions } from "node:tls";
import { Client, type Entry, type SearchOptions, type SearchResult } from "ldapts";
import type { IdentityProvider, Prisma, UserLifecycleStatus } from "@prisma/client";
import { resolveIdentityPolicyFromExternalClaims } from "@/lib/auth/providers";
import { applyUserLifecycleStatus } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

const nestedGroupMatchingRule = "1.2.840.113556.1.4.1941";
const accountDisableBit = 0x0002;

type LdapsProvider = Pick<
  IdentityProvider,
  | "id"
  | "workspaceId"
  | "type"
  | "status"
  | "ldapsUrl"
  | "ldapsBindDn"
  | "ldapsBindSecretRef"
  | "configJson"
>;

export type LdapsClient = {
  bind(dn: string, password?: string): Promise<void>;
  search(baseDN: string, options?: SearchOptions): Promise<SearchResult>;
  searchPaginated?(baseDN: string, options?: SearchOptions): AsyncGenerator<SearchResult>;
  unbind(): Promise<void>;
};

export type LdapsClientFactory = (options: {
  url: string;
  timeout: number;
  connectTimeout: number;
  tlsOptions: ConnectionOptions;
}) => LdapsClient;

type LdapsSyncClient = Pick<
  Prisma.TransactionClient,
  | "identityProvider"
  | "externalIdentity"
  | "identityGroup"
  | "userIdentityGroup"
  | "user"
  | "groupRoleMapping"
  | "authSession"
  | "auditLog"
>;
type LdapsRootClient = LdapsSyncClient & {
  $transaction?: <T>(callback: (tx: LdapsSyncClient) => Promise<T>) => Promise<T>;
};

type DirectoryUser = {
  dn: string;
  subject: string;
  externalId: string | null;
  email: string;
  displayName: string;
  disabled: boolean;
  attributes: Record<string, unknown>;
  directGroupDns: string[];
  groupIds: string[];
  skippedGroupDns: string[];
};

type DirectoryGroup = {
  dn: string;
  externalGroupId: string;
  externalGroupName: string;
  attributes: Record<string, unknown>;
};

type MissingUserAction = "none" | "suspend" | "deprovision";

type ParsedLdapsConfig = {
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

export type LdapsDirectorySyncResult = {
  providerId: string;
  providerType: "ACTIVE_DIRECTORY_LDAPS";
  dryRun: boolean;
  status: "succeeded" | "dry_run_succeeded";
  scannedUsers: number;
  scannedGroups: number;
  activeUsers: number;
  disabledUsers: number;
  createdUsers: number;
  updatedUsers: number;
  linkedIdentities: number;
  suspendedUsers: number;
  deprovisionedUsers: number;
  missingUsers: number;
  groupsUpserted: number;
  membershipsUpserted: number;
  membershipsRemoved: number;
  diagnostics: Record<string, unknown>;
  preview: {
    users: Array<{ email: string; displayName: string; disabled: boolean; groups: string[] }>;
    groups: Array<{ externalGroupId: string; externalGroupName: string }>;
  };
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function parseProviderConfig(configJson: string | null | undefined) {
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

function parseLdapsConfig(provider: Pick<LdapsProvider, "configJson">): ParsedLdapsConfig {
  const config = parseProviderConfig(provider.configJson);
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

function assertLdapsUrl(value: string | null | undefined) {
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

function assertEnvReference(value: string | null | undefined, label: string) {
  const trimmed = value?.trim();

  if (trimmed && !trimmed.startsWith("env:")) {
    throw new Error(`${label} должен быть env:-ссылкой; vault:/secret:-ссылки пока не исполняются этим runtime.`);
  }
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

  assertEnvReference(input.ldapsBindSecretRef, "Секрет bind-учетной записи LDAPS");

  const parsed = parseLdapsConfig({ configJson: JSON.stringify(input.config) });

  for (const ref of [...parsed.caCertRefs, ...parsed.caFileRefs]) {
    assertEnvReference(ref, "CA-сертификат LDAPS");
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

function resolveSecretReference(ref: string | null | undefined, label: string) {
  const trimmed = ref?.trim();

  if (!trimmed) {
    throw new Error(`${label} не настроен.`);
  }

  if (trimmed.startsWith("env:")) {
    const value = process.env[trimmed.slice("env:".length)];
    if (!value) {
      throw new Error(`${label} ссылается на пустую переменную окружения.`);
    }
    return value;
  }

  throw new Error(`${label} должен быть env:-ссылкой.`);
}

function resolveManagedTextRef(ref: string) {
  if (ref.startsWith("env:")) {
    const value = process.env[ref.slice("env:".length)];
    if (!value) {
      throw new Error("LDAPS CA ref ссылается на пустую переменную окружения.");
    }
    return value;
  }

  throw new Error("LDAPS CA должна задаваться через env:-ссылку; vault:/secret:-ссылки пока не исполняются этим runtime.");
}

function buildTlsOptions(config: ParsedLdapsConfig) {
  const ca = [
    ...config.caCertRefs.map(resolveManagedTextRef),
    ...config.caFileRefs.map((ref) => readFileSync(resolveManagedTextRef(ref), "utf8"))
  ];

  return {
    tlsOptions: {
      rejectUnauthorized: true,
      minVersion: "TLSv1.2",
      ...(ca.length ? { ca } : {})
    } satisfies ConnectionOptions,
    sensitiveValues: ca
  };
}

function defaultLdapsClientFactory(options: {
  url: string;
  timeout: number;
  connectTimeout: number;
  tlsOptions: ConnectionOptions;
}): LdapsClient {
  return new Client({
    url: options.url,
    timeout: options.timeout,
    connectTimeout: options.connectTimeout,
    tlsOptions: options.tlsOptions,
    strictDN: true
  });
}

function entryValue(entry: Entry, key: string): unknown {
  return key === "dn" ? entry.dn : entry[key];
}

function firstString(entry: Entry, keys: string[]) {
  for (const key of keys) {
    const value = entryValue(entry, key);
    const first = Array.isArray(value) ? value[0] : value;

    if (typeof first === "string" && first.trim()) {
      return first.trim();
    }

    if (Buffer.isBuffer(first) && first.length > 0) {
      return first.toString("base64");
    }
  }

  return "";
}

function stringList(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
  }

  return typeof value === "string" && value.trim() ? [value.trim()] : [];
}

function normalizedAttribute(value: unknown): unknown {
  if (Buffer.isBuffer(value)) {
    return value.toString("base64");
  }

  if (Array.isArray(value)) {
    return value.map(normalizedAttribute);
  }

  return value;
}

function entryAttributes(entry: Entry, allowedKeys: string[]) {
  return Object.fromEntries(
    allowedKeys
      .map((key) => [key, key === "dn" ? entry.dn : normalizedAttribute(entry[key])] as const)
      .filter(([, value]) => value !== undefined)
  );
}

function escapeFilterValue(value: string) {
  return value.replace(/[\0()*\\]/g, (char) => `\\${char.charCodeAt(0).toString(16).padStart(2, "0")}`);
}

function andFilter(left: string, right: string) {
  return `(&${left.trim()}${right.trim()})`;
}

function isDisabledAccount(entry: Entry, disabledAttribute: string) {
  const raw = entryValue(entry, disabledAttribute);
  const value = Array.isArray(raw) ? raw[0] : raw;
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? "0"), 10);

  return Number.isInteger(parsed) && (parsed & accountDisableBit) === accountDisableBit;
}

function directoryGroupFromEntry(entry: Entry, config: ParsedLdapsConfig): DirectoryGroup {
  const externalGroupId = config.groupAttributes.id === "dn" ? entry.dn : firstString(entry, [config.groupAttributes.id]) || entry.dn;
  const externalGroupName = firstString(entry, config.groupAttributes.name) || externalGroupId;

  return {
    dn: entry.dn,
    externalGroupId,
    externalGroupName,
    attributes: entryAttributes(entry, ["dn", config.groupAttributes.id, ...config.groupAttributes.name, config.groupAttributes.member])
  };
}

function directoryUserFromEntry(entry: Entry, config: ParsedLdapsConfig, groupIds: string[], skippedGroupDns: string[]): DirectoryUser | null {
  const subject = firstString(entry, [config.userAttributes.subject]) || entry.dn;
  const externalId = firstString(entry, [config.userAttributes.externalId]) || null;
  const email = firstString(entry, config.userAttributes.email).toLowerCase();
  const displayName = firstString(entry, config.userAttributes.displayName) || email;

  if (!email) {
    return null;
  }

  const supportLine = firstString(entry, config.userAttributes.supportLine);
  const teamName = firstString(entry, config.userAttributes.teamName);

  return {
    dn: entry.dn,
    subject,
    externalId,
    email,
    displayName,
    disabled: isDisabledAccount(entry, config.userAttributes.disabled),
    directGroupDns: stringList(entryValue(entry, config.userAttributes.memberOf)),
    groupIds,
    skippedGroupDns,
    attributes: {
      ...entryAttributes(entry, [
        "dn",
        config.userAttributes.subject,
        config.userAttributes.externalId,
        ...config.userAttributes.email,
        ...config.userAttributes.displayName,
        config.userAttributes.disabled,
        config.userAttributes.memberOf,
        ...config.userAttributes.supportLine,
        ...config.userAttributes.teamName
      ]),
      ...(supportLine ? { supportLine } : {}),
      ...(teamName ? { teamName } : {})
    }
  };
}

async function searchEntries(client: LdapsClient, base: string, options: SearchOptions) {
  let searchReferenceCount = 0;

  if (client.searchPaginated) {
    const entries: Entry[] = [];
    for await (const page of client.searchPaginated(base, options)) {
      entries.push(...page.searchEntries);
      searchReferenceCount += page.searchReferences.length;
    }
    return { entries, searchReferenceCount };
  }

  const result = await client.search(base, options);
  return {
    entries: result.searchEntries,
    searchReferenceCount: result.searchReferences.length
  };
}

async function searchDirectory(client: LdapsClient, config: ParsedLdapsConfig) {
  const groupAttributes = ["dn", config.groupAttributes.id, ...config.groupAttributes.name, config.groupAttributes.member];
  const userAttributes = [
    "dn",
    config.userAttributes.subject,
    config.userAttributes.externalId,
    ...config.userAttributes.email,
    ...config.userAttributes.displayName,
    config.userAttributes.disabled,
    config.userAttributes.memberOf,
    ...config.userAttributes.supportLine,
    ...config.userAttributes.teamName
  ];
  const paged = { pageSize: config.pageSize };
  let searchReferencesSkipped = 0;
  let skippedUnknownGroupMemberships = 0;
  const groupSearch = await searchEntries(client, config.groupSearchBase, {
    scope: "sub",
    filter: config.groupFilter,
    attributes: [...new Set(groupAttributes)],
    explicitBufferAttributes: config.binaryAttributes,
    paged
  });
  searchReferencesSkipped += groupSearch.searchReferenceCount;
  const groupEntries = groupSearch.entries;
  const groups = groupEntries.map((entry) => directoryGroupFromEntry(entry, config));
  const groupByDn = new Map(groups.map((group) => [group.dn.toLowerCase(), group]));
  const userSearch = await searchEntries(client, config.userSearchBase, {
    scope: "sub",
    filter: config.userFilter,
    attributes: [...new Set(userAttributes)],
    explicitBufferAttributes: config.binaryAttributes,
    paged
  });
  searchReferencesSkipped += userSearch.searchReferenceCount;
  const userEntries = userSearch.entries;
  const users: DirectoryUser[] = [];

  for (const entry of userEntries) {
    let skippedGroupDns: string[] = [];
    const groupIds = config.nestedGroups
      ? await (async () => {
          const nestedSearch = await searchEntries(client, config.groupSearchBase, {
            scope: "sub",
            filter: andFilter(config.groupFilter, `(${config.groupAttributes.member}:${nestedGroupMatchingRule}:=${escapeFilterValue(entry.dn)})`),
            attributes: [...new Set(groupAttributes)],
            explicitBufferAttributes: config.binaryAttributes,
            paged
          });
          searchReferencesSkipped += nestedSearch.searchReferenceCount;
          return nestedSearch.entries.map((groupEntry) => {
            const group = directoryGroupFromEntry(groupEntry, config);
            if (!groupByDn.has(group.dn.toLowerCase())) {
              groups.push(group);
              groupByDn.set(group.dn.toLowerCase(), group);
            }
            return group.externalGroupId;
          });
        })()
      : stringList(entryValue(entry, config.userAttributes.memberOf))
          .map((dn) => {
            const group = groupByDn.get(dn.toLowerCase());
            if (!group) {
              skippedGroupDns.push(dn);
              skippedUnknownGroupMemberships += 1;
              return "";
            }
            return group.externalGroupId;
          })
          .filter(Boolean);
    const user = directoryUserFromEntry(entry, config, [...new Set(groupIds)], [...new Set(skippedGroupDns)]);

    if (user) {
      users.push(user);
    }
  }

  return { users, groups, skippedUnknownGroupMemberships, searchReferencesSkipped };
}

function syncDiagnostics(
  provider: LdapsProvider,
  config: ParsedLdapsConfig,
  counts: {
    scannedUsers?: number;
    scannedGroups?: number;
    skippedUnknownGroupMemberships?: number;
    searchReferencesSkipped?: number;
  } = {}
) {
  let host = "";
  let port = "";

  try {
    const parsed = new URL(provider.ldapsUrl ?? "");
    host = parsed.hostname;
    port = parsed.port || (parsed.hostname ? "636" : "");
  } catch {
    host = "";
  }

  return {
    protocol: "ldaps",
    host,
    port,
    bindDnConfigured: Boolean(provider.ldapsBindDn?.trim()),
    bindSecretConfigured: Boolean(provider.ldapsBindSecretRef?.trim()),
    customCaConfigured: config.caCertRefs.length + config.caFileRefs.length > 0,
    userSearchBase: config.userSearchBase,
    groupSearchBase: config.groupSearchBase,
    userFilter: config.userFilter,
    groupFilter: config.groupFilter,
    nestedGroups: config.nestedGroups,
    nestedGroupMatchingRule: config.nestedGroups ? nestedGroupMatchingRule : null,
    pageSize: config.pageSize,
    binaryAttributes: config.binaryAttributes,
    missingUserAction: config.missingUserAction,
    ...counts
  };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function safeSyncError(error: unknown, sensitiveValues: string[] = []) {
  const message = error instanceof Error ? error.message : "Ошибка синхронизации LDAPS.";
  let safe = message
    .replace(/env:[A-Za-z0-9_.:/@-]+/g, "env:[redacted]")
    .replace(/ldaps:\/\/[^/\s?#@]+:[^/\s?#@]+@/gi, "ldaps://[redacted]@")
    .replace(/-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/g, "[redacted certificate]");

  for (const value of sensitiveValues) {
    if (value.length >= 8) {
      safe = safe.replace(new RegExp(escapeRegExp(value), "g"), "[redacted]");
    }
  }

  return safe.slice(0, 500);
}

async function setProviderSyncState(
  client: LdapsSyncClient,
  providerId: string,
  data: Pick<Prisma.IdentityProviderUpdateInput, "lastSyncStartedAt" | "lastSyncAt" | "lastSyncStatus" | "lastSyncError">
) {
  await client.identityProvider.update({
    where: { id: providerId },
    data
  });
}

async function applyMissingUserAction(input: {
  client: LdapsSyncClient;
  workspaceId: string;
  providerId: string;
  userId: string;
  action: MissingUserAction;
}) {
  if (input.action === "none") {
    return { suspended: 0, deprovisioned: 0 };
  }

  const status: UserLifecycleStatus = input.action === "deprovision" ? "DEPROVISIONED" : "SUSPENDED";
  await applyUserLifecycleStatus({
    userId: input.userId,
    workspaceId: input.workspaceId,
    status,
    actorId: null,
    sourceOfTruthProviderId: input.providerId,
    reason: "LDAPS missing user",
    client: input.client
  });

  return {
    suspended: status === "SUSPENDED" ? 1 : 0,
    deprovisioned: status === "DEPROVISIONED" ? 1 : 0
  };
}

async function persistDirectorySnapshot(input: {
  client: LdapsSyncClient;
  provider: LdapsProvider;
  config: ParsedLdapsConfig;
  users: DirectoryUser[];
  groups: DirectoryGroup[];
}) {
  const { client, provider, config } = input;
  const now = new Date();
  const seenSubjects = new Set(input.users.map((user) => user.subject));
  let createdUsers = 0;
  let updatedUsers = 0;
  let linkedIdentities = 0;
  let suspendedUsers = 0;
  let deprovisionedUsers = 0;
  let membershipsUpserted = 0;
  let membershipsRemoved = 0;
  let groupsUpserted = 0;

  for (const group of input.groups) {
    await client.identityGroup.upsert({
      where: {
        providerId_externalGroupId: {
          providerId: provider.id,
          externalGroupId: group.externalGroupId
        }
      },
      create: {
        workspaceId: provider.workspaceId,
        providerId: provider.id,
        externalGroupId: group.externalGroupId,
        externalGroupName: group.externalGroupName,
        rawAttributesJson: JSON.stringify(group.attributes),
        lastSyncAt: now
      },
      update: {
        externalGroupName: group.externalGroupName,
        rawAttributesJson: JSON.stringify(group.attributes),
        lastSyncAt: now
      }
    });
    groupsUpserted += 1;
  }

  for (const directoryUser of input.users) {
    const existingIdentity = await client.externalIdentity.findFirst({
      where: {
        providerId: provider.id,
        OR: [
          { providerSubject: directoryUser.subject },
          ...(directoryUser.externalId ? [{ externalId: directoryUser.externalId }] : []),
          { email: directoryUser.email }
        ]
      },
      include: { user: true }
    });
    const existingUser =
      existingIdentity?.user ??
      (await client.user.findFirst({
        where: {
          workspaceId: provider.workspaceId,
          email: directoryUser.email
        }
      }));

    if (directoryUser.disabled && !existingUser) {
      continue;
    }

    const policy = await resolveIdentityPolicyFromExternalClaims(
      provider.workspaceId,
      provider.id,
      {
        groups: directoryUser.groupIds,
        attributes: directoryUser.attributes
      },
      client
    );
    const lifecycleStatus: UserLifecycleStatus = directoryUser.disabled ? "SUSPENDED" : "ACTIVE";
    const user = existingUser
      ? await client.user.update({
          where: { id: existingUser.id },
          data: {
            email: directoryUser.email,
            name: directoryUser.displayName,
            role: policy.role,
            supportLine: policy.supportLine ?? existingUser.supportLine,
            teamName: policy.teamName ?? existingUser.teamName,
            sourceOfTruthProviderId: provider.id,
            lastDirectorySyncAt: now,
            ...(lifecycleStatus === "ACTIVE" ? { lifecycleStatus: "ACTIVE", suspendedAt: null, deprovisionedAt: null } : {})
          }
        })
      : await client.user.create({
          data: {
            workspaceId: provider.workspaceId,
            email: directoryUser.email,
            name: directoryUser.displayName,
            role: policy.role,
            supportLine: policy.supportLine,
            teamName: policy.teamName,
            lifecycleStatus,
            sourceOfTruthProviderId: provider.id,
            lastDirectorySyncAt: now,
            ...(lifecycleStatus === "SUSPENDED" ? { suspendedAt: now } : {})
          }
        });

    if (existingUser) {
      updatedUsers += 1;
    } else {
      createdUsers += 1;
    }

    if (directoryUser.disabled) {
      await applyUserLifecycleStatus({
        userId: user.id,
        workspaceId: provider.workspaceId,
        status: "SUSPENDED",
        actorId: null,
        sourceOfTruthProviderId: provider.id,
        reason: "LDAPS userAccountControl ACCOUNTDISABLE",
        client
      });
      suspendedUsers += 1;
    }

    if (existingIdentity) {
      await client.externalIdentity.update({
        where: { id: existingIdentity.id },
        data: {
          providerSubject: directoryUser.subject,
          externalId: directoryUser.externalId,
          email: directoryUser.email,
          displayName: directoryUser.displayName,
          rawClaimsJson: JSON.stringify({
            groups: directoryUser.groupIds,
            groupDns: directoryUser.directGroupDns,
            skippedGroupDns: directoryUser.skippedGroupDns,
            disabled: directoryUser.disabled,
            attributes: directoryUser.attributes
          }),
          lastSyncAt: now,
          disabledAt: directoryUser.disabled ? now : null
        }
      });
    } else {
      await client.externalIdentity.create({
        data: {
          userId: user.id,
          providerId: provider.id,
          providerSubject: directoryUser.subject,
          externalId: directoryUser.externalId,
          email: directoryUser.email,
          displayName: directoryUser.displayName,
          rawClaimsJson: JSON.stringify({
            groups: directoryUser.groupIds,
            groupDns: directoryUser.directGroupDns,
            skippedGroupDns: directoryUser.skippedGroupDns,
            disabled: directoryUser.disabled,
            attributes: directoryUser.attributes
          }),
          lastSyncAt: now,
          disabledAt: directoryUser.disabled ? now : null
        }
      });
      linkedIdentities += 1;
    }

    const removed = await client.userIdentityGroup.deleteMany({
      where: {
        workspaceId: provider.workspaceId,
        providerId: provider.id,
        userId: user.id,
        ...(directoryUser.groupIds.length
          ? {
              externalGroupId: {
                notIn: directoryUser.groupIds
              }
            }
          : {})
      }
    });
    membershipsRemoved += removed.count;

    for (const externalGroupId of directoryUser.groupIds) {
      await client.userIdentityGroup.upsert({
        where: {
          userId_providerId_externalGroupId: {
            userId: user.id,
            providerId: provider.id,
            externalGroupId
          }
        },
        create: {
          workspaceId: provider.workspaceId,
          userId: user.id,
          providerId: provider.id,
          externalGroupId,
          lastSyncAt: now
        },
        update: {
          lastSyncAt: now
        }
      });
      membershipsUpserted += 1;
    }
  }

  const existingIdentities = await client.externalIdentity.findMany({
    where: { providerId: provider.id },
    include: { user: true }
  });
  let missingUsers = 0;

  for (const identity of existingIdentities) {
    if (seenSubjects.has(identity.providerSubject)) {
      continue;
    }

    missingUsers += 1;
    const lifecycle = await applyMissingUserAction({
      client,
      workspaceId: provider.workspaceId,
      providerId: provider.id,
      userId: identity.userId,
      action: config.missingUserAction
    });
    suspendedUsers += lifecycle.suspended;
    deprovisionedUsers += lifecycle.deprovisioned;
  }

  return {
    createdUsers,
    updatedUsers,
    linkedIdentities,
    suspendedUsers,
    deprovisionedUsers,
    missingUsers,
    groupsUpserted,
    membershipsUpserted,
    membershipsRemoved
  };
}

async function persistLdapsSyncSuccess(input: {
  client: LdapsRootClient;
  provider: LdapsProvider;
  config: ParsedLdapsConfig;
  users: DirectoryUser[];
  groups: DirectoryGroup[];
  dryRun?: boolean;
  status: LdapsDirectorySyncResult["status"];
}) {
  const persist = async (client: LdapsSyncClient) => {
    const persisted = input.dryRun
      ? {
          createdUsers: 0,
          updatedUsers: 0,
          linkedIdentities: 0,
          suspendedUsers: 0,
          deprovisionedUsers: 0,
          missingUsers: 0,
          groupsUpserted: 0,
          membershipsUpserted: 0,
          membershipsRemoved: 0
        }
      : await persistDirectorySnapshot({
          client,
          provider: input.provider,
          config: input.config,
          users: input.users,
          groups: input.groups
        });

    await setProviderSyncState(client, input.provider.id, {
      ...(input.dryRun ? {} : { lastSyncAt: new Date() }),
      lastSyncStatus: input.status,
      lastSyncError: null
    });

    return persisted;
  };

  if (input.dryRun) {
    return persist(input.client);
  }

  if (input.client.$transaction) {
    return input.client.$transaction(persist);
  }

  if (input.client === prisma) {
    return prisma.$transaction(persist);
  }

  return persist(input.client);
}

export async function syncActiveDirectoryLdapsProvider(input: {
  provider: LdapsProvider;
  client: LdapsRootClient;
  dryRun?: boolean;
  ldapClientFactory?: LdapsClientFactory;
}): Promise<LdapsDirectorySyncResult> {
  if (input.provider.type !== "ACTIVE_DIRECTORY_LDAPS") {
    throw new Error("LDAPS adapter supports only ACTIVE_DIRECTORY_LDAPS providers.");
  }

  if (!input.dryRun && input.provider.status !== "active") {
    throw new Error("LDAPS-синхронизация доступна только для активного провайдера.");
  }

  if (input.dryRun && input.provider.status === "disabled") {
    throw new Error("LDAPS dry-run недоступен для отключенного провайдера.");
  }

  assertLdapsUrl(input.provider.ldapsUrl);
  const config = parseLdapsConfig(input.provider);
  validateLdapsProviderConfigForSave({
    type: input.provider.type,
    status: "active",
    ldapsUrl: input.provider.ldapsUrl,
    ldapsBindDn: input.provider.ldapsBindDn,
    ldapsBindSecretRef: input.provider.ldapsBindSecretRef,
    config: parseProviderConfig(input.provider.configJson)
  });

  await setProviderSyncState(input.client, input.provider.id, {
    lastSyncStartedAt: new Date(),
    lastSyncStatus: input.dryRun ? "ldaps_dry_run_started" : "ldaps_sync_started",
    lastSyncError: null
  });

  let ldapClient: LdapsClient | null = null;
  let sensitiveValues: string[] = [];

  try {
    const bindPassword = resolveSecretReference(input.provider.ldapsBindSecretRef, "Bind-секрет LDAPS");
    sensitiveValues.push(bindPassword);
    const tls = buildTlsOptions(config);
    sensitiveValues = [...sensitiveValues, ...tls.sensitiveValues];
    ldapClient = (input.ldapClientFactory ?? defaultLdapsClientFactory)({
      url: input.provider.ldapsUrl ?? "",
      timeout: config.timeoutMs,
      connectTimeout: config.connectTimeoutMs,
      tlsOptions: tls.tlsOptions
    });
    await ldapClient.bind(input.provider.ldapsBindDn ?? "", bindPassword);
    const snapshot = await searchDirectory(ldapClient, config);
    const activeUsers = snapshot.users.filter((user) => !user.disabled).length;
    const disabledUsers = snapshot.users.length - activeUsers;
    const status = input.dryRun ? "dry_run_succeeded" : "succeeded";
    const diagnostics = syncDiagnostics(input.provider, config, {
      scannedUsers: snapshot.users.length,
      scannedGroups: snapshot.groups.length,
      skippedUnknownGroupMemberships: snapshot.skippedUnknownGroupMemberships,
      searchReferencesSkipped: snapshot.searchReferencesSkipped
    });
    const persisted = await persistLdapsSyncSuccess({
      client: input.client,
      provider: input.provider,
      config,
      users: snapshot.users,
      groups: snapshot.groups,
      dryRun: input.dryRun,
      status
    });
    const result: LdapsDirectorySyncResult = {
      providerId: input.provider.id,
      providerType: "ACTIVE_DIRECTORY_LDAPS",
      dryRun: input.dryRun === true,
      status,
      scannedUsers: snapshot.users.length,
      scannedGroups: snapshot.groups.length,
      activeUsers,
      disabledUsers,
      ...persisted,
      diagnostics,
      preview: {
        users: snapshot.users.slice(0, 10).map((user) => ({
          email: user.email,
          displayName: user.displayName,
          disabled: user.disabled,
          groups: user.groupIds.slice(0, 10)
        })),
        groups: snapshot.groups.slice(0, 10).map((group) => ({
          externalGroupId: group.externalGroupId,
          externalGroupName: group.externalGroupName
        }))
      }
    };

    return result;
  } catch (error) {
    const message = safeSyncError(error, sensitiveValues);
    await setProviderSyncState(input.client, input.provider.id, {
      lastSyncStatus: input.dryRun ? "ldaps_dry_run_failed" : "ldaps_sync_failed",
      lastSyncError: message
    });
    throw new Error(message);
  } finally {
    await ldapClient?.unbind().catch(() => undefined);
  }
}
