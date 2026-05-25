import { createHash, randomBytes } from "node:crypto";
import { Prisma, type UserLifecycleStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { auditLog } from "@/lib/audit";
import { resolveIdentityPolicyForUser } from "@/lib/auth/providers";
import { applyUserLifecycleStatus } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

const SCIM_ERROR_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:Error";
const LIST_RESPONSE_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:ListResponse";
const USER_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:User";
const GROUP_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:Group";
const PATCH_OP_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:PatchOp";

export type ScimContext = {
  workspaceId: string;
  providerId: string;
  providerName: string;
};

type ScimTokenAction = "issue" | "rotate";

type ScimTokenTransactionClient = Pick<Prisma.TransactionClient, "auditLog"> & {
  identityProvider: Pick<
    Prisma.TransactionClient["identityProvider"],
    "findFirst" | "findUniqueOrThrow" | "update" | "updateMany"
  >;
};

type ScimUserPayload = {
  userName?: unknown;
  externalId?: unknown;
  active?: unknown;
  displayName?: unknown;
  name?: {
    formatted?: unknown;
    givenName?: unknown;
    familyName?: unknown;
  };
  emails?: Array<{ value?: unknown; primary?: unknown; type?: unknown }>;
  groups?: Array<{ value?: unknown; display?: unknown }>;
};

type ScimGroupPayload = {
  displayName?: unknown;
  externalId?: unknown;
  members?: Array<{ value?: unknown; display?: unknown }>;
};

type ScimPatchPayload = {
  Operations?: Array<{
    op?: unknown;
    path?: unknown;
    value?: unknown;
  }>;
};

type UserForScim = {
  id: string;
  workspaceId: string;
  email: string;
  name: string;
  lifecycleStatus: UserLifecycleStatus;
  createdAt: Date;
  updatedAt: Date;
  externalIdentities?: Array<{
    externalId: string | null;
    providerSubject: string;
    displayName: string | null;
  }>;
};

type GroupForScim = {
  id: string;
  workspaceId: string;
  providerId: string;
  externalGroupId: string;
  externalGroupName: string;
  createdAt?: Date;
  updatedAt?: Date;
  members?: Array<{
    userId: string;
    user?: {
      id: string;
      email: string;
      name: string;
    };
  }>;
};

export class ScimHttpError extends Error {
  status: number;
  scimType?: string;

  constructor(status: number, message: string, scimType?: string) {
    super(message);
    this.status = status;
    this.scimType = scimType;
  }
}

export class ScimTokenLifecycleError extends Error {
  code: "not_found" | "conflict" | "stale";

  constructor(code: "not_found" | "conflict" | "stale", message: string) {
    super(message);
    this.code = code;
  }
}

export function hashScimToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function createPlainScimToken() {
  return `scim_${randomBytes(32).toString("base64url")}`;
}

function scimTokenPrefix(plainToken: string) {
  return `${plainToken.slice(0, 10)}...`;
}

function scimTokenConcurrencyError() {
  return new ScimTokenLifecycleError("stale", "SCIM token was changed by another request.");
}

async function loadProviderForScimToken(
  client: ScimTokenTransactionClient,
  input: { workspaceId: string; providerId: string }
) {
  const provider = await client.identityProvider.findFirst({
    where: {
      id: input.providerId,
      workspaceId: input.workspaceId,
      type: {
        not: "DEMO"
      }
    },
    select: {
      id: true,
      workspaceId: true,
      name: true,
      type: true,
      scimTokenPrefix: true,
      scimTokenHash: true,
      updatedAt: true
    }
  });

  if (!provider) {
    throw new ScimTokenLifecycleError("not_found", "SCIM provider was not found.");
  }

  return provider;
}

async function auditScimTokenLifecycle(
  client: Pick<Prisma.TransactionClient, "auditLog">,
  input: {
    workspaceId: string;
    actorId: string | null;
    providerId: string;
    action: string;
    metadata: Record<string, unknown>;
  }
) {
  await auditLog(
    {
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      action: input.action,
      targetType: "identity_provider",
      targetId: input.providerId,
      metadata: input.metadata
    },
    client
  );
}

async function writeScimProvisioningToken(input: {
  workspaceId: string;
  providerId: string;
  actorId: string | null;
  action: ScimTokenAction;
}) {
  const plainToken = createPlainScimToken();
  const prefix = scimTokenPrefix(plainToken);

  return prisma.$transaction(async (tx: ScimTokenTransactionClient) => {
    const existingProvider = await loadProviderForScimToken(tx, input);

    if (input.action === "issue" && existingProvider.scimTokenHash) {
      throw new ScimTokenLifecycleError("conflict", "SCIM token already exists.");
    }

    if (input.action === "rotate" && !existingProvider.scimTokenHash) {
      throw new ScimTokenLifecycleError("not_found", "SCIM token has not been issued.");
    }

    const updated = await tx.identityProvider.updateMany({
      where: {
        id: input.providerId,
        workspaceId: input.workspaceId,
        scimTokenHash: existingProvider.scimTokenHash
      },
      data: {
        scimTokenPrefix: prefix,
        scimTokenHash: hashScimToken(plainToken)
      }
    });

    if (updated.count !== 1) {
      throw scimTokenConcurrencyError();
    }

    const provider = await tx.identityProvider.findUniqueOrThrow({
      where: {
        id_workspaceId: {
          id: input.providerId,
          workspaceId: input.workspaceId
        }
      },
      select: {
        id: true,
        workspaceId: true,
        name: true,
        type: true,
        scimTokenPrefix: true,
        updatedAt: true
      }
    });

    await auditScimTokenLifecycle(tx, {
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      providerId: provider.id,
      action: input.action === "issue" ? "auth.scim_token_issued" : "auth.scim_token_rotated",
      metadata: {
        providerName: provider.name,
        providerType: provider.type,
        prefix,
        previousPrefix: existingProvider.scimTokenPrefix
      }
    });

    return { plainToken, provider };
  });
}

export async function issueScimProvisioningToken(input: { workspaceId: string; providerId: string; actorId: string | null }) {
  return writeScimProvisioningToken({ ...input, action: "issue" });
}

export async function rotateScimProvisioningToken(input: { workspaceId: string; providerId: string; actorId: string | null }) {
  return writeScimProvisioningToken({ ...input, action: "rotate" });
}

export async function revokeScimProvisioningToken(input: { workspaceId: string; providerId: string; actorId: string | null }) {
  return prisma.$transaction(async (tx: ScimTokenTransactionClient) => {
    const existingProvider = await loadProviderForScimToken(tx, input);

    if (!existingProvider.scimTokenHash) {
      throw new ScimTokenLifecycleError("not_found", "SCIM token has not been issued.");
    }

    const updated = await tx.identityProvider.updateMany({
      where: {
        id: input.providerId,
        workspaceId: input.workspaceId,
        scimTokenHash: existingProvider.scimTokenHash
      },
      data: {
        scimTokenPrefix: null,
        scimTokenHash: null
      }
    });

    if (updated.count !== 1) {
      throw scimTokenConcurrencyError();
    }

    const provider = await tx.identityProvider.findUniqueOrThrow({
      where: {
        id_workspaceId: {
          id: input.providerId,
          workspaceId: input.workspaceId
        }
      },
      select: {
        id: true,
        workspaceId: true,
        name: true,
        type: true,
        scimTokenPrefix: true,
        updatedAt: true
      }
    });

    await auditScimTokenLifecycle(tx, {
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      providerId: provider.id,
      action: "auth.scim_token_revoked",
      metadata: {
        providerName: provider.name,
        providerType: provider.type,
        prefix: existingProvider.scimTokenPrefix
      }
    });

    return provider;
  });
}

export async function createScimProvisioningToken(input: { workspaceId: string; providerId: string; actorId?: string | null }) {
  return issueScimProvisioningToken({ ...input, actorId: input.actorId ?? null });
}

function stringValue(value: unknown, maxLength = 240) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function boolValue(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function safeJson(value: unknown) {
  return JSON.stringify(value ?? {});
}

function readBearerToken(request: Request) {
  const authorization = request.headers.get("authorization")?.trim();
  if (!authorization?.toLowerCase().startsWith("bearer ")) {
    return "";
  }

  return authorization.slice("bearer ".length).trim();
}

const scimHeaders = {
  "Content-Type": "application/scim+json"
};

export function scimErrorResponse(status: number, detail: string, scimType?: string) {
  return NextResponse.json(
    {
      schemas: [SCIM_ERROR_SCHEMA],
      ...(scimType ? { scimType } : {}),
      detail,
      status: String(status)
    },
    { status, headers: scimHeaders }
  );
}

export function scimJson<T>(body: T, status = 200, headers?: HeadersInit) {
  return NextResponse.json(body, {
    status,
    headers: {
      ...scimHeaders,
      ...Object.fromEntries(new Headers(headers))
    }
  });
}

export function handleScimError(error: unknown) {
  if (error instanceof ScimHttpError) {
    return scimErrorResponse(error.status, error.message, error.scimType);
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    return scimErrorResponse(409, "SCIM resource already exists.", "uniqueness");
  }

  return scimErrorResponse(500, "SCIM request failed.");
}

export async function authenticateScimRequest(
  request: Request
): Promise<{ ok: true; context: ScimContext } | { ok: false; response: NextResponse }> {
  const token = readBearerToken(request);

  if (!token) {
    return {
      ok: false,
      response: scimErrorResponse(401, "Bearer token is required.")
    };
  }

  const provider = await prisma.identityProvider.findUnique({
    where: { scimTokenHash: hashScimToken(token) },
    select: {
      id: true,
      workspaceId: true,
      name: true,
      status: true,
      scimTokenHash: true
    }
  });

  if (!provider?.scimTokenHash || provider.status !== "active") {
    return {
      ok: false,
      response: scimErrorResponse(401, "Bearer token is invalid or expired.")
    };
  }

  await prisma.identityProvider.update({
    where: { id: provider.id },
    data: {
      lastSyncStartedAt: new Date(),
      lastSyncStatus: "scim_request_authenticated",
      lastSyncError: null
    }
  });

  return {
    ok: true,
    context: {
      workspaceId: provider.workspaceId,
      providerId: provider.id,
      providerName: provider.name
    }
  };
}

export function serviceProviderConfig() {
  return {
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig"],
    patch: { supported: true },
    bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
    filter: { supported: true, maxResults: 100 },
    changePassword: { supported: false },
    sort: { supported: false },
    etag: { supported: false },
    authenticationSchemes: [
      {
        type: "oauthbearertoken",
        name: "Bearer token",
        description: "Workspace-scoped SCIM provisioning bearer token.",
        specUri: "https://www.rfc-editor.org/rfc/rfc6750",
        primary: true
      }
    ],
    meta: {
      resourceType: "ServiceProviderConfig",
      location: "/scim/v2/ServiceProviderConfig"
    }
  };
}

export function schemasResponse() {
  return {
    schemas: [LIST_RESPONSE_SCHEMA],
    totalResults: 2,
    startIndex: 1,
    itemsPerPage: 2,
    Resources: [
      {
        schemas: ["urn:ietf:params:scim:schemas:core:2.0:Schema"],
        id: USER_SCHEMA,
        name: "User",
        description: "User account",
        attributes: [
          { name: "userName", type: "string", required: true, mutability: "readWrite", uniqueness: "server" },
          { name: "externalId", type: "string", required: false, mutability: "readWrite" },
          { name: "active", type: "boolean", required: false, mutability: "readWrite" },
          { name: "displayName", type: "string", required: false, mutability: "readWrite" },
          { name: "emails", type: "complex", multiValued: true, required: false, mutability: "readWrite" }
        ],
        meta: { resourceType: "Schema", location: `/scim/v2/Schemas/${encodeURIComponent(USER_SCHEMA)}` }
      },
      {
        schemas: ["urn:ietf:params:scim:schemas:core:2.0:Schema"],
        id: GROUP_SCHEMA,
        name: "Group",
        description: "Identity group",
        attributes: [
          { name: "displayName", type: "string", required: true, mutability: "readWrite" },
          { name: "externalId", type: "string", required: false, mutability: "readWrite" },
          { name: "members", type: "complex", multiValued: true, required: false, mutability: "readWrite" }
        ],
        meta: { resourceType: "Schema", location: `/scim/v2/Schemas/${encodeURIComponent(GROUP_SCHEMA)}` }
      }
    ]
  };
}

export function resourceTypesResponse() {
  return {
    schemas: [LIST_RESPONSE_SCHEMA],
    totalResults: 2,
    startIndex: 1,
    itemsPerPage: 2,
    Resources: [
      {
        schemas: ["urn:ietf:params:scim:schemas:core:2.0:ResourceType"],
        id: "User",
        name: "User",
        endpoint: "/Users",
        schema: USER_SCHEMA,
        schemaExtensions: [],
        meta: { resourceType: "ResourceType", location: "/scim/v2/ResourceTypes/User" }
      },
      {
        schemas: ["urn:ietf:params:scim:schemas:core:2.0:ResourceType"],
        id: "Group",
        name: "Group",
        endpoint: "/Groups",
        schema: GROUP_SCHEMA,
        schemaExtensions: [],
        meta: { resourceType: "ResourceType", location: "/scim/v2/ResourceTypes/Group" }
      }
    ]
  };
}

function primaryEmail(payload: ScimUserPayload) {
  const emails = Array.isArray(payload.emails) ? payload.emails : [];
  const primary = emails.find((email) => email.primary === true);
  return stringValue(primary?.value || emails[0]?.value || payload.userName, 320).toLowerCase();
}

function displayName(payload: ScimUserPayload) {
  const explicit = stringValue(payload.displayName || payload.name?.formatted, 160);
  if (explicit) return explicit;

  const parts = [stringValue(payload.name?.givenName, 80), stringValue(payload.name?.familyName, 80)].filter(Boolean);
  return parts.join(" ").trim() || primaryEmail(payload);
}

function externalId(payload: ScimUserPayload | ScimGroupPayload) {
  return stringValue(payload.externalId, 240) || null;
}

function providerSubject(payload: ScimUserPayload) {
  return externalId(payload) || stringValue(payload.userName, 320).toLowerCase() || primaryEmail(payload);
}

function userActiveStatus(payload: ScimUserPayload): UserLifecycleStatus {
  return payload.active === false ? "DEPROVISIONED" : "ACTIVE";
}

function serializeUser(user: UserForScim, providerId: string) {
  const identity = user.externalIdentities?.find((item) => item.providerSubject || item.externalId);

  return {
    schemas: [USER_SCHEMA],
    id: user.id,
    externalId: identity?.externalId ?? undefined,
    userName: user.email,
    name: {
      formatted: user.name
    },
    displayName: user.name,
    active: user.lifecycleStatus === "ACTIVE",
    emails: [
      {
        value: user.email,
        type: "work",
        primary: true
      }
    ],
    meta: {
      resourceType: "User",
      created: user.createdAt?.toISOString(),
      lastModified: user.updatedAt?.toISOString(),
      location: `/scim/v2/Users/${user.id}`
    }
  };
}

function serializeGroup(group: GroupForScim) {
  return {
    schemas: [GROUP_SCHEMA],
    id: group.id,
    externalId: group.externalGroupId,
    displayName: group.externalGroupName,
    members:
      group.members?.map((member) => ({
        value: member.userId,
        display: member.user?.name || member.user?.email,
        $ref: `/scim/v2/Users/${member.userId}`
      })) ?? [],
    meta: {
      resourceType: "Group",
      created: group.createdAt?.toISOString(),
      lastModified: group.updatedAt?.toISOString(),
      location: `/scim/v2/Groups/${group.id}`
    }
  };
}

function scimListResponse<T>(resources: T[], totalResults: number, startIndex: number, itemsPerPage: number) {
  return {
    schemas: [LIST_RESPONSE_SCHEMA],
    totalResults,
    startIndex,
    itemsPerPage,
    Resources: resources
  };
}

function parsePaging(url: URL) {
  const startIndex = Math.max(1, Number.parseInt(url.searchParams.get("startIndex") || "1", 10) || 1);
  const requestedCount = Number.parseInt(url.searchParams.get("count") || "100", 10) || 100;
  const count = Math.min(Math.max(0, requestedCount), 100);
  return { startIndex, count, skip: startIndex - 1 };
}

function parseEqFilter(url: URL) {
  const filter = url.searchParams.get("filter")?.trim();
  if (!filter) return null;

  const match = /^(userName|externalId|displayName)\s+eq\s+"([^"]*)"$/i.exec(filter);
  if (!match) {
    throw new ScimHttpError(400, "Unsupported SCIM filter.", "invalidFilter");
  }

  return {
    attribute: match[1].toLowerCase(),
    value: match[2].trim()
  };
}

function userFilterWhere(context: ScimContext, filter: ReturnType<typeof parseEqFilter>) {
  const base: Prisma.UserWhereInput = {
    workspaceId: context.workspaceId,
    OR: [
      { sourceOfTruthProviderId: context.providerId },
      {
        externalIdentities: {
          some: { providerId: context.providerId }
        }
      }
    ]
  };

  if (!filter) return base;

  if (filter.attribute === "username") {
    return {
      ...base,
      AND: [
        {
          OR: [
            { email: filter.value.toLowerCase() },
            {
              externalIdentities: {
                some: {
                  providerId: context.providerId,
                  email: filter.value.toLowerCase()
                }
              }
            }
          ]
        }
      ]
    };
  }

  if (filter.attribute === "externalid") {
    return {
      ...base,
      externalIdentities: {
        some: {
          providerId: context.providerId,
          externalId: filter.value
        }
      }
    };
  }

  if (filter.attribute === "displayname") {
    return {
      ...base,
      AND: [
        {
          OR: [
            { name: filter.value },
            {
              externalIdentities: {
                some: {
                  providerId: context.providerId,
                  displayName: filter.value
                }
              }
            }
          ]
        }
      ]
    };
  }

  throw new ScimHttpError(400, "Unsupported SCIM user filter.", "invalidFilter");
}

function groupFilterWhere(context: ScimContext, filter: ReturnType<typeof parseEqFilter>) {
  const base: Prisma.IdentityGroupWhereInput = {
    workspaceId: context.workspaceId,
    providerId: context.providerId
  };

  if (!filter) return base;

  if (filter.attribute === "displayname") {
    return {
      ...base,
      externalGroupName: filter.value
    };
  }

  if (filter.attribute === "externalid") {
    return {
      ...base,
      externalGroupId: filter.value
    };
  }

  throw new ScimHttpError(400, "Unsupported SCIM group filter.", "invalidFilter");
}

async function auditScimEvent(
  client: Pick<Prisma.TransactionClient, "auditLog">,
  input: {
    workspaceId: string;
    action: string;
    targetType: string;
    targetId: string;
    metadata: Record<string, unknown>;
  }
) {
  await auditLog(
    {
      workspaceId: input.workspaceId,
      actorId: null,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      metadata: input.metadata
    },
    client
  );
}

async function userWithIdentity(client: Prisma.TransactionClient | typeof prisma, context: ScimContext, userId: string) {
  const user = await client.user.findFirst({
    where: {
      id: userId,
      workspaceId: context.workspaceId,
      OR: [
        { sourceOfTruthProviderId: context.providerId },
        {
          externalIdentities: {
            some: { providerId: context.providerId }
          }
        }
      ]
    },
    include: {
      externalIdentities: {
        where: { providerId: context.providerId }
      }
    }
  });

  if (!user) {
    throw new ScimHttpError(404, "SCIM user was not found.");
  }

  return user;
}

export async function listScimUsers(context: ScimContext, url: URL) {
  const paging = parsePaging(url);
  const where = userFilterWhere(context, parseEqFilter(url));
  const [totalResults, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: [{ email: "asc" }, { id: "asc" }],
      skip: paging.skip,
      take: paging.count,
      include: {
        externalIdentities: {
          where: { providerId: context.providerId }
        }
      }
    })
  ]);

  return scimListResponse(
    users.map((user) => serializeUser(user, context.providerId)),
    totalResults,
    paging.startIndex,
    users.length
  );
}

export async function getScimUser(context: ScimContext, id: string) {
  return serializeUser(await userWithIdentity(prisma, context, id), context.providerId);
}

export async function createScimUser(context: ScimContext, payload: ScimUserPayload) {
  const email = primaryEmail(payload);
  const name = displayName(payload);
  const subject = providerSubject(payload);
  const status = userActiveStatus(payload);

  if (!email || !subject) {
    throw new ScimHttpError(400, "SCIM userName or primary email is required.", "invalidValue");
  }

  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const existingIdentity = await tx.externalIdentity.findFirst({
      where: {
        providerId: context.providerId,
        OR: [{ providerSubject: subject }, ...(externalId(payload) ? [{ externalId: externalId(payload) }] : [])]
      },
      include: {
        user: {
          include: {
            externalIdentities: {
              where: { providerId: context.providerId }
            }
          }
        }
      }
    });

    if (existingIdentity?.user) {
      if (status !== existingIdentity.user.lifecycleStatus) {
        await applyUserLifecycleStatus({
          userId: existingIdentity.userId,
          workspaceId: context.workspaceId,
          status,
          actorId: null,
          sourceOfTruthProviderId: context.providerId,
          reason: "SCIM POST idempotent user update",
          client: tx
        });
      }

      const updated = await tx.user.update({
        where: { id: existingIdentity.userId },
        data: {
          email,
          name,
          sourceOfTruthProviderId: context.providerId,
          lastDirectorySyncAt: now,
          ...(status === "ACTIVE" ? { lifecycleStatus: "ACTIVE", suspendedAt: null, deprovisionedAt: null } : {})
        },
        include: {
          externalIdentities: {
            where: { providerId: context.providerId }
          }
        }
      });

      await tx.externalIdentity.update({
        where: { id: existingIdentity.id },
        data: {
          providerSubject: subject,
          externalId: externalId(payload),
          email,
          displayName: name,
          rawClaimsJson: safeJson(payload),
          lastSyncAt: now,
          disabledAt: status === "ACTIVE" ? null : now
        }
      });

      await auditScimEvent(tx, {
        workspaceId: context.workspaceId,
        action: "scim.user_updated",
        targetType: "user",
        targetId: updated.id,
        metadata: { providerId: context.providerId, status }
      });

      return {
        status: 200,
        resource: serializeUser(updated, context.providerId)
      };
    }

    const existingUser = await tx.user.findFirst({
      where: {
        workspaceId: context.workspaceId,
        email
      }
    });

    let user = existingUser;

    if (user) {
      if (status !== user.lifecycleStatus) {
        await applyUserLifecycleStatus({
          userId: user.id,
          workspaceId: context.workspaceId,
          status,
          actorId: null,
          sourceOfTruthProviderId: context.providerId,
          reason: "SCIM POST user link",
          client: tx
        });
      }

      user = await tx.user.update({
        where: { id: user.id },
        data: {
          email,
          name,
          sourceOfTruthProviderId: context.providerId,
          lastDirectorySyncAt: now,
          ...(status === "ACTIVE" ? { lifecycleStatus: "ACTIVE", suspendedAt: null, deprovisionedAt: null } : {})
        }
      });
    } else {
      user = await tx.user.create({
        data: {
          workspaceId: context.workspaceId,
          email,
          name,
          role: "SUPPORT_AGENT",
          lifecycleStatus: status,
          sourceOfTruthProviderId: context.providerId,
          lastDirectorySyncAt: now,
          ...(status === "ACTIVE" ? {} : { deprovisionedAt: now })
        }
      });
    }

    await tx.externalIdentity.create({
      data: {
        userId: user.id,
        providerId: context.providerId,
        providerSubject: subject,
        externalId: externalId(payload),
        email,
        displayName: name,
        rawClaimsJson: safeJson(payload),
        lastSyncAt: now,
        disabledAt: status === "ACTIVE" ? null : now
      }
    });

    const hydrated = await userWithIdentity(tx, context, user.id);
    await auditScimEvent(tx, {
      workspaceId: context.workspaceId,
      action: existingUser ? "scim.user_linked" : "scim.user_created",
      targetType: "user",
      targetId: user.id,
      metadata: {
        providerId: context.providerId,
        externalId: externalId(payload),
        status
      }
    });

    return {
      status: existingUser ? 200 : 201,
      resource: serializeUser(hydrated, context.providerId)
    };
  });
}

function patchEntries(payload: ScimPatchPayload) {
  if (!Array.isArray(payload.Operations)) {
    throw new ScimHttpError(400, "SCIM PATCH Operations are required.", "invalidSyntax");
  }

  return payload.Operations.map((operation) => ({
    op: stringValue(operation.op, 20).toLowerCase(),
    path: stringValue(operation.path, 160),
    value: operation.value
  }));
}

function applyUserPatchPayload(current: ScimUserPayload, path: string, value: unknown) {
  const target = path.toLowerCase();

  if (!path && value && typeof value === "object" && !Array.isArray(value)) {
    Object.assign(current, value as ScimUserPayload);
    return;
  }

  if (target === "active") {
    current.active = value;
    return;
  }
  if (target === "username") {
    current.userName = value;
    return;
  }
  if (target === "displayname") {
    current.displayName = value;
    return;
  }
  if (target === "name") {
    current.name = value as ScimUserPayload["name"];
    return;
  }
  if (target === "emails") {
    current.emails = value as ScimUserPayload["emails"];
    return;
  }

  throw new ScimHttpError(400, "Unsupported SCIM user PATCH path.", "mutability");
}

export async function patchScimUser(context: ScimContext, id: string, payload: ScimPatchPayload) {
  return prisma.$transaction(async (tx) => {
    const existing = await userWithIdentity(tx, context, id);
    const merged: ScimUserPayload = {
      userName: existing.email,
      displayName: existing.name,
      active: existing.lifecycleStatus === "ACTIVE",
      emails: [{ value: existing.email, primary: true }],
      externalId: existing.externalIdentities?.[0]?.externalId ?? undefined
    };

    for (const operation of patchEntries(payload)) {
      if (operation.op !== "replace" && operation.op !== "add") {
        throw new ScimHttpError(400, "Unsupported SCIM PATCH operation.", "mutability");
      }
      applyUserPatchPayload(merged, operation.path, operation.value);
    }

    const email = primaryEmail(merged);
    const name = displayName(merged);
    const nextStatus = userActiveStatus(merged);
    const now = new Date();

    let updated = existing;
    if (nextStatus !== existing.lifecycleStatus) {
      await applyUserLifecycleStatus({
        userId: existing.id,
        workspaceId: context.workspaceId,
        status: nextStatus,
        actorId: null,
        sourceOfTruthProviderId: context.providerId,
        reason: "SCIM PATCH active",
        client: tx
      });
    }

    updated = await tx.user.update({
      where: { id: existing.id },
      data: {
        email,
        name,
        sourceOfTruthProviderId: context.providerId,
        lastDirectorySyncAt: now,
        ...(nextStatus === "ACTIVE" ? { lifecycleStatus: "ACTIVE", suspendedAt: null, deprovisionedAt: null } : {})
      },
      include: {
        externalIdentities: {
          where: { providerId: context.providerId }
        }
      }
    });

    const identity = existing.externalIdentities?.[0];
    if (identity) {
      await tx.externalIdentity.update({
        where: { id: identity.id },
        data: {
          email,
          displayName: name,
          externalId: externalId(merged),
          rawClaimsJson: safeJson(merged),
          lastSyncAt: now,
          disabledAt: nextStatus === "ACTIVE" ? null : now
        }
      });
    }

    await auditScimEvent(tx, {
      workspaceId: context.workspaceId,
      action: nextStatus === "ACTIVE" ? "scim.user_updated" : "scim.user_deactivated",
      targetType: "user",
      targetId: existing.id,
      metadata: {
        providerId: context.providerId,
        status: nextStatus
      }
    });

    return {
      status: 200,
      resource: serializeUser(updated, context.providerId)
    };
  });
}

export async function replaceScimUser(context: ScimContext, id: string, payload: ScimUserPayload) {
  return patchScimUser(context, id, {
    schemas: [PATCH_OP_SCHEMA],
    Operations: [{ op: "Replace", value: payload }]
  } as ScimPatchPayload);
}

export async function deactivateScimUser(context: ScimContext, id: string) {
  return patchScimUser(context, id, {
    Operations: [{ op: "Replace", path: "active", value: false }]
  });
}

function groupExternalId(payload: ScimGroupPayload) {
  return externalId(payload) || stringValue(payload.displayName, 240);
}

async function groupById(client: Prisma.TransactionClient | typeof prisma, context: ScimContext, id: string) {
  const group = await client.identityGroup.findFirst({
    where: {
      id,
      workspaceId: context.workspaceId,
      providerId: context.providerId
    },
    include: {
      members: {
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true
            }
          }
        },
        orderBy: [{ userId: "asc" }]
      }
    }
  });

  if (!group) {
    throw new ScimHttpError(404, "SCIM group was not found.");
  }

  return group;
}

function memberIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => (item && typeof item === "object" ? stringValue((item as { value?: unknown }).value) : "")).filter(Boolean))];
}

async function assertProviderMemberIds(client: Prisma.TransactionClient, context: ScimContext, ids: string[]) {
  if (ids.length === 0) {
    return;
  }

  const users = await client.user.findMany({
    where: {
      id: { in: ids },
      workspaceId: context.workspaceId,
      OR: [
        { sourceOfTruthProviderId: context.providerId },
        {
          externalIdentities: {
            some: { providerId: context.providerId }
          }
        }
      ]
    },
    select: { id: true }
  });
  const validIds = new Set(users.map((user) => user.id));
  const invalidIds = ids.filter((id) => !validIds.has(id));

  if (invalidIds.length > 0) {
    throw new ScimHttpError(400, "SCIM group member is not linked to this provider.", "invalidValue");
  }
}

async function addGroupMembers(client: Prisma.TransactionClient, context: ScimContext, group: GroupForScim, ids: string[]) {
  await assertProviderMemberIds(client, context, ids);
  const now = new Date();
  for (const userId of ids) {
    await client.userIdentityGroup.upsert({
      where: {
        userId_providerId_externalGroupId: {
          userId,
          providerId: context.providerId,
          externalGroupId: group.externalGroupId
        }
      },
      create: {
        workspaceId: context.workspaceId,
        userId,
        providerId: context.providerId,
        externalGroupId: group.externalGroupId,
        lastSyncAt: now
      },
      update: {
        lastSyncAt: now
      }
    });
  }
}

async function refreshUserPoliciesForScimMembers(client: Prisma.TransactionClient, context: ScimContext, userIds: string[]) {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (ids.length === 0) {
    return;
  }

  for (const userId of ids) {
    const policy = await resolveIdentityPolicyForUser(context.workspaceId, context.providerId, userId, {}, client);
    await client.user.updateMany({
      where: {
        id: userId,
        workspaceId: context.workspaceId,
        OR: [
          { sourceOfTruthProviderId: context.providerId },
          {
            externalIdentities: {
              some: { providerId: context.providerId }
            }
          }
        ]
      },
      data: {
        role: policy.role,
        ...(policy.supportLine ? { supportLine: policy.supportLine } : {}),
        ...(policy.teamName ? { teamName: policy.teamName } : {}),
        sourceOfTruthProviderId: context.providerId,
        lastDirectorySyncAt: new Date()
      }
    });
  }
}

export async function listScimGroups(context: ScimContext, url: URL) {
  const paging = parsePaging(url);
  const where = groupFilterWhere(context, parseEqFilter(url));
  const [totalResults, groups] = await Promise.all([
    prisma.identityGroup.count({ where }),
    prisma.identityGroup.findMany({
      where,
      orderBy: [{ externalGroupName: "asc" }, { id: "asc" }],
      skip: paging.skip,
      take: paging.count,
      include: {
        members: {
          include: {
            user: {
              select: { id: true, email: true, name: true }
            }
          },
          orderBy: [{ userId: "asc" }]
        }
      }
    })
  ]);

  return scimListResponse(
    groups.map((group) => serializeGroup(group)),
    totalResults,
    paging.startIndex,
    groups.length
  );
}

export async function getScimGroup(context: ScimContext, id: string) {
  return serializeGroup(await groupById(prisma, context, id));
}

export async function createScimGroup(context: ScimContext, payload: ScimGroupPayload) {
  const displayName = stringValue(payload.displayName, 160);
  const externalGroupId = groupExternalId(payload);

  if (!displayName || !externalGroupId) {
    throw new ScimHttpError(400, "SCIM group displayName is required.", "invalidValue");
  }

  return prisma.$transaction(async (tx) => {
    const existingGroup = await tx.identityGroup.findFirst({
      where: {
        workspaceId: context.workspaceId,
        providerId: context.providerId,
        externalGroupId
      },
      select: { id: true }
    });
    const group = await tx.identityGroup.upsert({
      where: {
        providerId_externalGroupId: {
          providerId: context.providerId,
          externalGroupId
        }
      },
      create: {
        workspaceId: context.workspaceId,
        providerId: context.providerId,
        externalGroupId,
        externalGroupName: displayName,
        rawAttributesJson: safeJson(payload),
        lastSyncAt: new Date()
      },
      update: {
        externalGroupName: displayName,
        rawAttributesJson: safeJson(payload),
        lastSyncAt: new Date()
      }
    });

    const members = memberIds(payload.members);
    await addGroupMembers(tx, context, group, members);
    await refreshUserPoliciesForScimMembers(tx, context, members);
    const hydrated = await groupById(tx, context, group.id);
    await auditScimEvent(tx, {
      workspaceId: context.workspaceId,
      action: "scim.group_upserted",
      targetType: "identity_group",
      targetId: group.id,
      metadata: {
        providerId: context.providerId,
        externalGroupId,
        memberCount: memberIds(payload.members).length
      }
    });

    return {
      status: existingGroup ? 200 : 201,
      resource: serializeGroup(hydrated)
    };
  });
}

export async function patchScimGroup(context: ScimContext, id: string, payload: ScimPatchPayload) {
  return prisma.$transaction(async (tx) => {
    let group = await groupById(tx, context, id);
    let changedMembership = false;
    const affectedUserIds = new Set<string>();

    for (const operation of patchEntries(payload)) {
      const op = operation.op;
      const rawPath = operation.path;
      const path = rawPath.toLowerCase();

      if (op === "replace" && (!path || path === "members")) {
        group.members?.forEach((member) => affectedUserIds.add(member.userId));
        const ids = memberIds(operation.value);
        await tx.userIdentityGroup.deleteMany({
          where: {
            workspaceId: context.workspaceId,
            providerId: context.providerId,
            externalGroupId: group.externalGroupId
          }
        });
        await addGroupMembers(tx, context, group, ids);
        ids.forEach((userId) => affectedUserIds.add(userId));
        changedMembership = true;
      } else if (op === "add" && (!path || path === "members")) {
        const ids = memberIds(operation.value);
        await addGroupMembers(tx, context, group, ids);
        ids.forEach((userId) => affectedUserIds.add(userId));
        changedMembership = true;
      } else if (op === "remove" && path.startsWith("members")) {
        const match = /members\[value eq "([^"]+)"\]/i.exec(rawPath);
        const ids = match ? [match[1]] : memberIds(operation.value);
        await assertProviderMemberIds(tx, context, ids);
        if (ids.length === 0) {
          group.members?.forEach((member) => affectedUserIds.add(member.userId));
        }
        await tx.userIdentityGroup.deleteMany({
          where: {
            workspaceId: context.workspaceId,
            providerId: context.providerId,
            externalGroupId: group.externalGroupId,
            ...(ids.length ? { userId: { in: ids } } : {})
          }
        });
        ids.forEach((userId) => affectedUserIds.add(userId));
        changedMembership = true;
      } else if (op === "replace" && path === "displayname") {
        const nextName = stringValue(operation.value, 160) || group.externalGroupName;
        await tx.identityGroup.update({
          where: { id: group.id },
          data: {
            externalGroupName: nextName,
            lastSyncAt: new Date()
          }
        });
        group = { ...group, externalGroupName: nextName };
      } else {
        throw new ScimHttpError(400, "Unsupported SCIM group PATCH operation.", "mutability");
      }
    }

    await refreshUserPoliciesForScimMembers(tx, context, [...affectedUserIds]);
    const hydrated = await groupById(tx, context, group.id);
    await auditScimEvent(tx, {
      workspaceId: context.workspaceId,
      action: changedMembership ? "scim.group_membership_updated" : "scim.group_updated",
      targetType: "identity_group",
      targetId: group.id,
      metadata: {
        providerId: context.providerId,
        externalGroupId: group.externalGroupId
      }
    });

    return {
      status: 200,
      resource: serializeGroup(hydrated)
    };
  });
}

export async function replaceScimGroup(context: ScimContext, id: string, payload: ScimGroupPayload) {
  const existing = await groupById(prisma, context, id);
  return patchScimGroup(context, id, {
    Operations: [
      { op: "Replace", path: "displayName", value: payload.displayName ?? existing.externalGroupName },
      { op: "Replace", path: "members", value: payload.members ?? [] }
    ]
  });
}

export async function deleteScimGroup(context: ScimContext, id: string) {
  return prisma.$transaction(async (tx) => {
    const group = await groupById(tx, context, id);
    const affectedUserIds = group.members?.map((member) => member.userId) ?? [];
    await tx.userIdentityGroup.deleteMany({
      where: {
        workspaceId: context.workspaceId,
        providerId: context.providerId,
        externalGroupId: group.externalGroupId
      }
    });
    await auditScimEvent(tx, {
      workspaceId: context.workspaceId,
      action: "scim.group_deleted",
      targetType: "identity_group",
      targetId: group.id,
      metadata: {
        providerId: context.providerId,
        externalGroupId: group.externalGroupId
      }
    });
    await tx.identityGroup.delete({
      where: { id: group.id }
    });
    await refreshUserPoliciesForScimMembers(tx, context, affectedUserIds);

    return { status: 204, resource: null };
  });
}
