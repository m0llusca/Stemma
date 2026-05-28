import type { NextAuthConfig } from "next-auth";
import { RoleName } from "@prisma/client";
import "@/auth/types";
import { enterpriseAssertionProvider } from "@/auth/providers/assertion";
import type { AppAuthUser } from "@/auth/types";
import type { RoleName as AppRoleName } from "@prisma/client";

function tokenString(value: unknown) {
  return typeof value === "string" && value ? value : undefined;
}

function tokenRole(value: unknown): AppRoleName | undefined {
  return Object.values(RoleName).includes(value as AppRoleName) ? (value as AppRoleName) : undefined;
}

export const authConfig = {
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 12,
    updateAge: 60 * 5
  },
  trustHost: true,
  pages: {
    signIn: "/auth/login",
    signOut: "/auth/login?loggedOut=1",
    error: "/auth/login"
  },
  providers: [enterpriseAssertionProvider],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        const authUser = user as AppAuthUser;
        token.sub = authUser.id;
        token.workspaceId = authUser.workspaceId;
        token.email = authUser.email;
        token.name = authUser.name;
        token.role = authUser.role;
      }

      return token;
    },
    session({ session, user, token }) {
      if (user) {
        const authUser = user as AppAuthUser & { emailVerified?: Date | null };
        session.user = {
          id: authUser.id,
          workspaceId: authUser.workspaceId,
          email: authUser.email,
          emailVerified: authUser.emailVerified ?? null,
          name: authUser.name ?? authUser.email,
          role: authUser.role
        };

        return session;
      }

      const id = tokenString(token.sub);
      const workspaceId = tokenString(token.workspaceId);
      const email = tokenString(token.email);
      const name = tokenString(token.name) ?? email;
      const role = tokenRole(token.role);

      if (id && workspaceId && email && name && role) {
        session.user = {
          id,
          workspaceId,
          email,
          emailVerified: null,
          name,
          role
        };
      }

      return session;
    }
  }
} satisfies NextAuthConfig;
