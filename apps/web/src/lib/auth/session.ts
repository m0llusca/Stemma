import { createHash, randomBytes } from "node:crypto";
import type { AuthSession, IdentityProviderType } from "@prisma/client";
import { prisma } from "@/lib/db";

export const sessionCookieName = "qc_session";
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
    select: { id: true, workspaceId: true }
  });

  if (!user) {
    throw new Error("Пользователь не найден.");
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
        supportLine: string | null;
        teamName: string | null;
        workspace: {
          id: string;
          name: string;
          uiTheme: string;
          uiDensity: string;
          uiCorners: string;
          uiContrast: string;
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

  if (!session || session.status !== "ACTIVE" || session.expiresAt <= new Date()) {
    if (session?.status === "ACTIVE") {
      await prisma.authSession.update({
        where: { id: session.id },
        data: { status: "EXPIRED" }
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
