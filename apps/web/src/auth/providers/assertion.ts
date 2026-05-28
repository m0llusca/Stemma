import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { AppAuthUser } from "@/auth/types";
import { createAuthSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

const defaultEnterpriseAssertionTtlMs = 60_000;
const enterpriseAssertionKeyPrefix = "authjs-assertion:";

type EnterpriseAssertionPayload = {
  userId: string;
  expiresAt: string;
  consumedAt: string | null;
};
type EnterpriseAssertionClient = Pick<Prisma.TransactionClient, "ssoRequestState" | "user" | "identityProvider">;

function credentialString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function createOpaqueAssertionToken() {
  return randomBytes(32).toString("base64url");
}

function parseEnterpriseAssertionPayload(value: string): EnterpriseAssertionPayload | null {
  try {
    const payload = JSON.parse(value) as Partial<EnterpriseAssertionPayload>;

    if (typeof payload.userId !== "string" || !payload.userId.trim()) {
      return null;
    }

    if (typeof payload.expiresAt !== "string" || Number.isNaN(new Date(payload.expiresAt).getTime())) {
      return null;
    }

    if (payload.consumedAt !== undefined && payload.consumedAt !== null && typeof payload.consumedAt !== "string") {
      return null;
    }

    return {
      userId: payload.userId,
      expiresAt: payload.expiresAt,
      consumedAt: payload.consumedAt ?? null
    };
  } catch {
    return null;
  }
}

function appAuthUser(user: AppAuthUser): AppAuthUser {
  return {
    id: user.id,
    workspaceId: user.workspaceId,
    email: user.email,
    name: user.name,
    role: user.role
  };
}

export async function createEnterpriseAssertion(input: {
  workspaceId: string;
  providerId: string;
  userId: string;
  ttlMs?: number;
}) {
  const requestedTtlMs = input.ttlMs;
  const ttlMs =
    typeof requestedTtlMs === "number" && Number.isFinite(requestedTtlMs) && requestedTtlMs > 0
      ? requestedTtlMs
      : defaultEnterpriseAssertionTtlMs;
  const token = createOpaqueAssertionToken();
  const key = `${enterpriseAssertionKeyPrefix}${token}`;
  const expiresAt = new Date(Date.now() + ttlMs);
  const value: EnterpriseAssertionPayload = {
    userId: input.userId,
    expiresAt: expiresAt.toISOString(),
    consumedAt: null
  };

  await prisma.ssoRequestState.create({
    data: {
      key,
      workspaceId: input.workspaceId,
      providerId: input.providerId,
      value: JSON.stringify(value),
      expiresAt,
      consumedAt: null
    }
  });

  return {
    token,
    key,
    expiresAt
  };
}

async function loadActiveAssertionPrincipals(
  db: EnterpriseAssertionClient,
  input: {
    workspaceId: string;
    providerId: string;
    userId: string;
  }
) {
  const [user, provider] = await Promise.all([
    db.user.findFirst({
      where: {
        id: input.userId,
        workspaceId: input.workspaceId,
        lifecycleStatus: "ACTIVE"
      },
      select: {
        id: true,
        workspaceId: true,
        email: true,
        name: true,
        role: true
      }
    }),
    db.identityProvider.findFirst({
      where: {
        id: input.providerId,
        workspaceId: input.workspaceId,
        status: "active"
      },
      select: { id: true }
    })
  ]);

  if (!user || !provider) {
    return null;
  }

  return {
    user: appAuthUser(user),
    providerId: provider.id
  };
}

export async function consumeEnterpriseAssertion(input: { token: string; providerId?: string }) {
  const token = credentialString(input.token);
  const providerId = credentialString(input.providerId);

  if (!token) {
    return null;
  }

  const key = `${enterpriseAssertionKeyPrefix}${token}`;
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const candidate = await tx.ssoRequestState.findUnique({
      where: { key }
    });

    if (!candidate || candidate.expiresAt <= now || candidate.consumedAt) {
      return null;
    }

    if (providerId && candidate.providerId !== providerId) {
      return null;
    }

    const payload = parseEnterpriseAssertionPayload(candidate.value);

    if (!payload || payload.consumedAt || new Date(payload.expiresAt) <= now) {
      return null;
    }

    const consumedAt = now;
    const consumed = await tx.ssoRequestState.updateMany({
      where: {
        key,
        workspaceId: candidate.workspaceId,
        providerId: candidate.providerId,
        consumedAt: null,
        expiresAt: { gt: now }
      },
      data: {
        consumedAt,
        value: JSON.stringify({
          ...payload,
          consumedAt: consumedAt.toISOString()
        })
      }
    });

    if (consumed.count !== 1) {
      return null;
    }

    return loadActiveAssertionPrincipals(tx, {
      workspaceId: candidate.workspaceId,
      providerId: candidate.providerId,
      userId: payload.userId
    });
  });
}

export async function issueSessionFromEnterpriseAssertion(input: {
  token: string;
  providerId?: string;
  userAgent?: string | null;
  ipAddress?: string | null;
}) {
  const assertion = await consumeEnterpriseAssertion({
    token: input.token,
    providerId: input.providerId
  });

  if (!assertion) {
    return null;
  }

  return createAuthSession({
    userId: assertion.user.id,
    providerId: assertion.providerId,
    userAgent: input.userAgent,
    ipAddress: input.ipAddress
  });
}
