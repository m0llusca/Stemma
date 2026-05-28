import type { NextAuthConfig } from "next-auth";
import "@/auth/types";
import { createQcAuthAdapter } from "@/auth/adapter";

export const authConfig = {
  adapter: createQcAuthAdapter(),
  session: {
    strategy: "database",
    maxAge: 60 * 60 * 12,
    updateAge: 60 * 5
  },
  trustHost: true,
  pages: {
    signIn: "/auth/login",
    signOut: "/auth/login?loggedOut=1",
    error: "/auth/login"
  },
  providers: [],
  callbacks: {
    session({ session, user }) {
      if (user) {
        session.user = {
          id: user.id,
          workspaceId: user.workspaceId,
          email: user.email,
          emailVerified: user.emailVerified,
          name: user.name ?? user.email,
          role: user.role
        };
      }

      return session;
    }
  }
} satisfies NextAuthConfig;
