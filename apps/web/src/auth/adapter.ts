import type { UserLifecycleStatus } from "@prisma/client";
import type { Adapter, AdapterSession, AdapterUser } from "next-auth/adapters";
import "@/auth/types";
import { hashSessionToken } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

type QcAdapterUser = {
  id: string;
  workspaceId: string;
  email: string;
  name: string | null;
  role: AdapterUser["role"];
  lifecycleStatus: UserLifecycleStatus;
};

type QcAuthSession = {
  id: string;
  userId: string;
  expiresAt: Date;
  status: "ACTIVE" | "REVOKED" | "EXPIRED";
  user: QcAdapterUser;
};

const adapterUserSelect = {
  id: true,
  workspaceId: true,
  email: true,
  name: true,
  role: true,
  lifecycleStatus: true
} as const;

function toAdapterSession(sessionToken: string, session: Pick<QcAuthSession, "userId" | "expiresAt">): AdapterSession {
  return {
    sessionToken,
    userId: session.userId,
    expires: session.expiresAt
  };
}

function toAdapterUser(user: QcAdapterUser): AdapterUser {
  return {
    id: user.id,
    workspaceId: user.workspaceId,
    email: user.email,
    emailVerified: null,
    name: user.name ?? user.email,
    role: user.role
  };
}

export function createQcAuthAdapter(): Adapter {
  return {
    async createSession(session) {
      const user = await prisma.user.findUnique({
        where: { id: session.userId },
        select: {
          id: true,
          workspaceId: true,
          lifecycleStatus: true
        }
      });

      if (!user || user.lifecycleStatus !== "ACTIVE") {
        throw new Error("Auth.js user is missing or inactive.");
      }

      await prisma.authSession.create({
        data: {
          workspaceId: user.workspaceId,
          userId: user.id,
          sessionTokenHash: hashSessionToken(session.sessionToken),
          expiresAt: session.expires,
          status: "ACTIVE"
        }
      });

      return session;
    },

    async getSessionAndUser(sessionToken) {
      const now = new Date();
      const session = await prisma.authSession.findUnique({
        where: { sessionTokenHash: hashSessionToken(sessionToken) },
        include: {
          user: {
            select: adapterUserSelect
          }
        }
      });

      if (!session || session.status !== "ACTIVE") {
        return null;
      }

      if (session.expiresAt <= now) {
        await prisma.authSession.update({
          where: { id: session.id },
          data: { status: "EXPIRED" }
        });
        return null;
      }

      if (session.user.lifecycleStatus !== "ACTIVE") {
        await prisma.authSession.update({
          where: { id: session.id },
          data: {
            status: "REVOKED",
            revokedAt: now
          }
        });
        return null;
      }

      await prisma.authSession.update({
        where: { id: session.id },
        data: { lastSeenAt: now }
      });

      return {
        session: toAdapterSession(sessionToken, session),
        user: toAdapterUser(session.user)
      };
    },

    async updateSession(session) {
      const now = new Date();
      const sessionTokenHash = hashSessionToken(session.sessionToken);
      const updateResult = await prisma.authSession.updateMany({
        where: {
          sessionTokenHash,
          status: "ACTIVE",
          expiresAt: { gt: now },
          user: {
            lifecycleStatus: "ACTIVE"
          }
        },
        data: {
          ...(session.expires ? { expiresAt: session.expires } : {}),
          lastSeenAt: now
        }
      });

      if (updateResult.count === 0) {
        return null;
      }

      const currentSession = await prisma.authSession.findUnique({
        where: { sessionTokenHash },
        include: {
          user: {
            select: adapterUserSelect
          }
        }
      });

      if (
        !currentSession ||
        currentSession.status !== "ACTIVE" ||
        currentSession.expiresAt <= now ||
        currentSession.user.lifecycleStatus !== "ACTIVE"
      ) {
        return null;
      }

      return toAdapterSession(session.sessionToken, currentSession);
    },

    async deleteSession(sessionToken) {
      await prisma.authSession.updateMany({
        where: {
          sessionTokenHash: hashSessionToken(sessionToken),
          status: "ACTIVE"
        },
        data: {
          status: "REVOKED",
          revokedAt: new Date()
        }
      });
    }
  };
}
