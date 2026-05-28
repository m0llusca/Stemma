import { createHash, randomBytes } from "node:crypto";
import type { AuthSession, IdentityProviderType, Prisma, UserLifecycleStatus } from "@prisma/client";
import { auditLog } from "@/lib/audit";
import { prisma } from "@/lib/db";

export const sessionCookieName = "qc_session";
export const authJsSessionCookieNames = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
  "authjs.callback-url",
  "__Secure-authjs.callback-url",
  "authjs.csrf-token",
  "__Host-authjs.csrf-token"
] as const;
const sessionTtlMs = 1000 * 60 * 60 * 12;

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function hashOptionalValue(value: string | null | undefined) {
  return value ? createHash("sha256").update(value, "utf8").digest("hex") : undefined;
}

export function createOpaqueSessionToken() {
  return randomBytes(32).toString("base64url");
}

export async function findIdentityProvider(workspaceId: string, type: IdentityProviderType, slug?: string) {
  return prisma.identityProvider.findFirst({
    where: {
      workspaceId,
      type,
      ...(slug ? { slug } : {})
    }
  });
}

export async function createAuthSession(input: {
  userId: string;
  providerId?: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, workspaceId: true, lifecycleStatus: true }
  });

  if (!user) {
    throw new Error("Пользователь не найден.");
  }

  if (user.lifecycleStatus !== "ACTIVE") {
    throw new Error("Пользователь приостановлен или деактивирован.");
  }

  const token = createOpaqueSessionToken();
  const session = await prisma.authSession.create({
    data: {
      workspaceId: user.workspaceId,
      userId: user.id,
      providerId: input.providerId,
      sessionTokenHash: hashSessionToken(token),
      ipHash: hashOptionalValue(input.ipAddress),
      userAgent: input.userAgent?.slice(0, 240),
      expiresAt: new Date(Date.now() + sessionTtlMs)
    }
  });

  return { token, session };
}

export async function getValidAuthSession(token: string | undefined): Promise<
  | (AuthSession & {
      user: {
        id: string;
        workspaceId: string;
        email: string;
        name: string;
        role: import("@prisma/client").RoleName;
        lifecycleStatus: UserLifecycleStatus;
        supportLine: string | null;
        teamName: string | null;
        workspace: {
          id: string;
          name: string;
          brandName: string | null;
          brandTagline: string | null;
          brandLogoUrl: string | null;
          brandLogoAlt: string | null;
          brandMark: string | null;
          brandPrimaryColor: string;
          brandAccentColor: string;
          uiTheme: string;
          uiDensity: string;
          uiCorners: string;
          uiContrast: string;
          uiPaletteOverridesJson: string;
          createdAt: Date;
          updatedAt: Date;
        };
      };
    })
  | null
> {
  if (!token) {
    return null;
  }

  const session = await prisma.authSession.findUnique({
    where: { sessionTokenHash: hashSessionToken(token) },
    include: {
      user: {
        include: {
          workspace: true
        }
      }
    }
  });

  if (!session || session.status !== "ACTIVE" || session.expiresAt <= new Date() || session.user.lifecycleStatus !== "ACTIVE") {
    if (session?.status === "ACTIVE") {
      await prisma.authSession.update({
        where: { id: session.id },
        data:
          session.expiresAt <= new Date()
            ? { status: "EXPIRED" }
            : {
                status: "REVOKED",
                revokedAt: new Date()
              }
      });
    }

    return null;
  }

  await prisma.authSession.update({
    where: { id: session.id },
    data: { lastSeenAt: new Date() }
  });

  return session;
}

export async function revokeAuthSession(token: string | undefined) {
  if (!token) {
    return;
  }

  await prisma.authSession.updateMany({
    where: {
      sessionTokenHash: hashSessionToken(token),
      status: "ACTIVE"
    },
    data: {
      status: "REVOKED",
      revokedAt: new Date()
    }
  });
}

type LifecycleClient = Pick<Prisma.TransactionClient, "authSession" | "user" | "identityProvider" | "auditLog">;
type ApplyUserLifecycleStatusResult = {
  user: {
    id: string;
    workspaceId: string;
    lifecycleStatus: UserLifecycleStatus;
    sourceOfTruthProviderId: string | null;
  };
  revokedSessionCount: number;
};

export async function revokeActiveSessionsForUser(input: {
  userId: string;
  workspaceId?: string;
  actorId?: string;
  reason: "suspended" | "deprovisioned" | "manual";
  client?: LifecycleClient;
}) {
  const db = input.client ?? prisma;
  const now = new Date();
  const result = await db.authSession.updateMany({
    where: {
      userId: input.userId,
      status: "ACTIVE",
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {})
    },
    data: {
      status: "REVOKED",
      revokedAt: now
    }
  });

  if (input.actorId && input.workspaceId && result.count > 0) {
    await auditLog(
      {
        workspaceId: input.workspaceId,
        actorId: input.actorId,
        action: "auth.sessions_revoked_for_user",
        targetType: "user",
        targetId: input.userId,
        metadata: {
          reason: input.reason,
          revokedSessionCount: result.count
        }
      },
      db
    );
  }

  return result.count;
}

export async function applyUserLifecycleStatus(input: {
  userId: string;
  workspaceId: string;
  status: UserLifecycleStatus;
  actorId?: string | null;
  reason?: string;
  sourceOfTruthProviderId?: string | null;
  client?: LifecycleClient;
}): Promise<ApplyUserLifecycleStatusResult> {
  if (!input.client) {
    return prisma.$transaction((tx) => applyUserLifecycleStatus({ ...input, client: tx }));
  }

  const db = input.client;
  const now = new Date();

  const existingUser = await db.user.findFirst({
    where: {
      id: input.userId,
      workspaceId: input.workspaceId
    },
    select: { id: true }
  });

  if (!existingUser) {
    throw new Error("Пользователь не найден в рабочем пространстве.");
  }

  if (input.sourceOfTruthProviderId) {
    const provider = await db.identityProvider.findFirst({
      where: {
        id: input.sourceOfTruthProviderId,
        workspaceId: input.workspaceId
      },
      select: { id: true }
    });

    if (!provider) {
      throw new Error("Провайдер источника истины не найден в рабочем пространстве.");
    }
  }

  const user = await db.user.update({
    where: { id: input.userId },
    data: {
      lifecycleStatus: input.status,
      ...(input.status === "SUSPENDED" ? { suspendedAt: now } : {}),
      ...(input.status === "DEPROVISIONED" ? { deprovisionedAt: now } : {}),
      ...(input.status === "ACTIVE" ? { suspendedAt: null, deprovisionedAt: null } : {}),
      ...(input.sourceOfTruthProviderId !== undefined ? { sourceOfTruthProviderId: input.sourceOfTruthProviderId } : {})
    },
    select: {
      id: true,
      workspaceId: true,
      lifecycleStatus: true,
      sourceOfTruthProviderId: true
    }
  });

  const revokedSessionCount =
    input.status === "ACTIVE"
      ? 0
      : await revokeActiveSessionsForUser({
          userId: user.id,
          workspaceId: input.workspaceId,
          actorId: input.actorId ?? undefined,
          reason: input.status === "SUSPENDED" ? "suspended" : "deprovisioned",
          client: db
        });

  await auditLog(
    {
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      action: "auth.user_lifecycle_updated",
      targetType: "user",
      targetId: user.id,
      metadata: {
        status: input.status,
        sourceOfTruthProviderId: user.sourceOfTruthProviderId,
        revokedSessionCount
      }
    },
    db
  );

  return {
    user,
    revokedSessionCount
  };
}
