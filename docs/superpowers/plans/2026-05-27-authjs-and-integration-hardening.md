# Auth.js Ownership and Integration Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Auth.js the primary authentication runtime while preserving enterprise identity semantics, then harden Jira/YDB/YTsaurus/tRPC integration paths to production-grade behavior.

**Architecture:** Auth.js owns handlers, sign-in/sign-out, and session issuance. A custom adapter maps Auth.js session operations onto the existing `AuthSession`, `User`, `IdentityProvider`, and `ExternalIdentity` domain models so workspace roles, lifecycle revocation, SCIM/LDAPS, and audit contracts remain intact. Integration hardening runs in parallel-safe slices after auth foundation work is in place.

**Tech Stack:** Next.js 16 App Router, React 19, Auth.js v5 via `next-auth`, Prisma/PostgreSQL, Zod, tRPC, TanStack Query, Vitest, Playwright.

---

## File Structure

Auth.js foundation:

- Create `apps/web/auth.ts`: root Auth.js export for `auth`, `handlers`, `signIn`, and `signOut`.
- Create `apps/web/src/auth/config.ts`: shared Auth.js config with database session strategy and provider list.
- Create `apps/web/src/auth/adapter.ts`: custom Auth.js adapter backed by `AuthSession`, `User`, and `ExternalIdentity`.
- Create `apps/web/src/auth/types.ts`: internal session/user mapping helpers and Auth.js module augmentation.
- Create `apps/web/src/auth/providers/local.ts`: local credentials provider and credential verification service.
- Create `apps/web/src/auth/providers/assertion.ts`: one-time enterprise assertion provider used by OIDC/SAML bridge slices.
- Create `apps/web/src/app/api/auth/[...nextauth]/route.ts`: Auth.js route handlers.
- Modify `apps/web/package.json` and lockfile: add `next-auth`.

Auth migration:

- Modify `apps/web/src/lib/current-user.ts`: primary session lookup through Auth.js.
- Modify `apps/web/src/lib/user-actions.ts`: local credential sign-in delegates to Auth.js.
- Modify `apps/web/src/app/auth/logout/route.ts`: revoke Auth.js session and clear legacy cookies.
- Modify `apps/web/src/lib/auth/session.ts`: keep compatibility helpers and add Auth.js-backed revocation helpers.
- Modify `apps/web/src/lib/auth-provider-actions.ts`: admin revocation targets Auth.js-backed sessions.
- Modify `apps/web/src/app/auth/callback/route.ts`: OIDC callback issues Auth.js-backed session through assertion provider.
- Modify `apps/web/src/app/auth/saml/acs/route.ts`: SAML ACS issues Auth.js-backed session through assertion provider.
- Modify `apps/web/src/proxy.ts`: use validated Auth.js-compatible session behavior after rollout.

Integration hardening:

- Modify `apps/web/src/lib/integration-import-service.ts`: strict contract validation and queue claim behavior.
- Modify `apps/web/src/lib/integration-actions.ts`: source-specific validation and duplicate setup handling.
- Modify `apps/web/src/server/trpc/routers/integrations.ts`: explicit `queueImport` return contract.
- Modify `apps/web/src/lib/integration-setup-schema.ts`: shared tRPC input/output schemas for secretless setup.
- Modify `apps/web/src/app/api/trpc/[trpc]/route.ts`: keep same-origin protection pinned by tests.
- Modify `apps/web/src/lib/integrations/helpdesk-adapters/jira.ts`: comment pagination.
- Modify `apps/web/src/lib/normalizers/native-helpdesk.ts`: Jira ADF/object body extraction.
- Modify `apps/web/src/lib/integrations/data-source-adapters/ytsaurus.ts`: server-side row limit and empty-result behavior.
- Modify `apps/web/src/lib/integrations/data-source-adapters/ydb.ts`: config/limit failures and sanitized diagnostics.
- Modify `apps/web/tests/live/data-source-live-smoke.test.ts` and `apps/web/package.json`: Phase D live smoke coverage.

Existing dirty working-tree changes must not be reverted or silently absorbed. Each task must stage only its own files.

---

### Task 1: Auth.js Dependency and Runtime Skeleton

**Files:**
- Modify: `apps/web/package.json`
- Modify: `apps/web/package-lock.json`
- Create: `apps/web/auth.ts`
- Create: `apps/web/src/auth/config.ts`
- Create: `apps/web/src/auth/types.ts`
- Create: `apps/web/src/app/api/auth/[...nextauth]/route.ts`
- Test: `apps/web/tests/unit/authjs-runtime.test.ts`

- [ ] **Step 1: Write the failing runtime test**

Create `apps/web/tests/unit/authjs-runtime.test.ts`:

```ts
import { describe, expect, it } from "vitest";

describe("Auth.js runtime wiring", () => {
  it("exports Auth.js handlers and helpers from the root auth module", async () => {
    const runtime = await import("../../auth");

    expect(runtime.auth).toEqual(expect.any(Function));
    expect(runtime.signIn).toEqual(expect.any(Function));
    expect(runtime.signOut).toEqual(expect.any(Function));
    expect(runtime.handlers.GET).toEqual(expect.any(Function));
    expect(runtime.handlers.POST).toEqual(expect.any(Function));
  });

  it("exposes the App Router Auth.js route handlers", async () => {
    const route = await import("@/app/api/auth/[...nextauth]/route");

    expect(route.GET).toEqual(expect.any(Function));
    expect(route.POST).toEqual(expect.any(Function));
  });
});
```

- [ ] **Step 2: Run the failing runtime test**

Run:

```bash
cd apps/web
npm run test -- tests/unit/authjs-runtime.test.ts
```

Expected: FAIL because `../../auth` and `/api/auth/[...nextauth]` do not exist.

- [ ] **Step 3: Install Auth.js**

Run:

```bash
cd apps/web
npm install next-auth
```

Expected: `package.json` includes `next-auth` and the lockfile is updated.

- [ ] **Step 4: Add Auth.js type augmentation**

Create `apps/web/src/auth/types.ts`:

```ts
import type { RoleName } from "@prisma/client";

export type AppAuthUser = {
  id: string;
  workspaceId: string;
  email: string;
  name: string;
  role: RoleName;
};

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      workspaceId: string;
      email: string;
      name: string;
      role: RoleName;
    };
  }

  interface User extends AppAuthUser {}
}
```

- [ ] **Step 5: Add minimal Auth.js config**

Create `apps/web/src/auth/config.ts`:

```ts
import type { NextAuthConfig } from "next-auth";

export const authConfig = {
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
          name: user.name,
          role: user.role
        };
      }

      return session;
    }
  }
} satisfies NextAuthConfig;
```

- [ ] **Step 6: Add root Auth.js module**

Create `apps/web/auth.ts`:

```ts
import NextAuth from "next-auth";
import { authConfig } from "@/auth/config";

export const { auth, handlers, signIn, signOut } = NextAuth(authConfig);
```

- [ ] **Step 7: Add App Router route handlers**

Create `apps/web/src/app/api/auth/[...nextauth]/route.ts`:

```ts
import { handlers } from "../../../../../auth";

export const { GET, POST } = handlers;
```

- [ ] **Step 8: Run runtime test and typecheck**

Run:

```bash
cd apps/web
npm run test -- tests/unit/authjs-runtime.test.ts
npm run typecheck
```

Expected: runtime test passes and typecheck passes with `apps/web/src/app/api/auth/[...nextauth]/route.ts` importing `handlers` via `../../../../../auth`.

- [ ] **Step 9: Commit**

```bash
git add apps/web/package.json apps/web/package-lock.json apps/web/auth.ts apps/web/src/auth/config.ts apps/web/src/auth/types.ts apps/web/src/app/api/auth/[...nextauth]/route.ts apps/web/tests/unit/authjs-runtime.test.ts
git commit -m "feat: add authjs runtime skeleton"
```

---

### Task 2: Custom Auth.js Adapter Backed by `AuthSession`

**Files:**
- Create: `apps/web/src/auth/adapter.ts`
- Modify: `apps/web/src/auth/config.ts`
- Test: `apps/web/tests/unit/authjs-adapter.test.ts`

- [ ] **Step 1: Write adapter tests**

Create `apps/web/tests/unit/authjs-adapter.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authSession: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn()
  },
  user: {
    findUnique: vi.fn()
  },
  externalIdentity: {
    findFirst: vi.fn(),
    upsert: vi.fn()
  }
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    authSession: mocks.authSession,
    user: mocks.user,
    externalIdentity: mocks.externalIdentity
  }
}));

describe("Auth.js custom adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates sessions in AuthSession with only a hashed token stored", async () => {
    mocks.user.findUnique.mockResolvedValue({
      id: "user-1",
      workspaceId: "workspace-1",
      email: "admin@example.com",
      name: "Admin",
      role: "ADMIN",
      lifecycleStatus: "ACTIVE"
    });
    mocks.authSession.create.mockResolvedValue({
      id: "session-1",
      userId: "user-1",
      sessionTokenHash: "hash",
      expiresAt: new Date("2026-06-01T00:00:00.000Z")
    });

    const { createQcAuthAdapter } = await import("@/auth/adapter");
    const adapter = createQcAuthAdapter();

    const session = await adapter.createSession?.({
      sessionToken: "raw-session-token",
      userId: "user-1",
      expires: new Date("2026-06-01T00:00:00.000Z")
    });

    expect(session).toEqual({
      sessionToken: "raw-session-token",
      userId: "user-1",
      expires: new Date("2026-06-01T00:00:00.000Z")
    });
    expect(mocks.authSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user-1",
          workspaceId: "workspace-1",
          sessionTokenHash: expect.not.stringContaining("raw-session-token")
        })
      })
    );
  });

  it("returns null for revoked, expired, or suspended sessions", async () => {
    mocks.authSession.findUnique.mockResolvedValue({
      id: "session-1",
      status: "REVOKED",
      expiresAt: new Date("2026-06-01T00:00:00.000Z"),
      userId: "user-1",
      sessionTokenHash: "hash",
      user: {
        id: "user-1",
        workspaceId: "workspace-1",
        email: "admin@example.com",
        name: "Admin",
        role: "ADMIN",
        lifecycleStatus: "ACTIVE"
      }
    });

    const { createQcAuthAdapter } = await import("@/auth/adapter");
    const adapter = createQcAuthAdapter();

    await expect(adapter.getSessionAndUser?.("raw-session-token")).resolves.toBeNull();
  });

  it("revokes sessions on delete instead of deleting rows", async () => {
    const { createQcAuthAdapter } = await import("@/auth/adapter");
    const adapter = createQcAuthAdapter();

    await adapter.deleteSession?.("raw-session-token");

    expect(mocks.authSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "ACTIVE"
        }),
        data: expect.objectContaining({
          status: "REVOKED",
          revokedAt: expect.any(Date)
        })
      })
    );
  });
});
```

- [ ] **Step 2: Run adapter tests to verify failure**

Run:

```bash
cd apps/web
npm run test -- tests/unit/authjs-adapter.test.ts
```

Expected: FAIL because `@/auth/adapter` does not exist.

- [ ] **Step 3: Implement custom adapter**

Create `apps/web/src/auth/adapter.ts`:

```ts
import type { Adapter, AdapterSession, AdapterUser } from "next-auth/adapters";
import type { RoleName } from "@prisma/client";
import { hashSessionToken } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

function toAdapterUser(user: {
  id: string;
  workspaceId: string;
  email: string;
  name: string;
  role: RoleName;
}): AdapterUser {
  return {
    id: user.id,
    workspaceId: user.workspaceId,
    email: user.email,
    name: user.name,
    role: user.role,
    emailVerified: null
  } as AdapterUser;
}

function toAdapterSession(input: { sessionToken: string; userId: string; expiresAt: Date }): AdapterSession {
  return {
    sessionToken: input.sessionToken,
    userId: input.userId,
    expires: input.expiresAt
  };
}

export function createQcAuthAdapter(): Adapter {
  return {
    async createSession(data) {
      const user = await prisma.user.findUnique({
        where: { id: data.userId },
        select: {
          id: true,
          workspaceId: true,
          lifecycleStatus: true
        }
      });

      if (!user || user.lifecycleStatus !== "ACTIVE") {
        throw new Error("Пользователь не найден или неактивен.");
      }

      await prisma.authSession.create({
        data: {
          workspaceId: user.workspaceId,
          userId: user.id,
          sessionTokenHash: hashSessionToken(data.sessionToken),
          expiresAt: data.expires,
          status: "ACTIVE"
        }
      });

      return toAdapterSession({
        sessionToken: data.sessionToken,
        userId: user.id,
        expiresAt: data.expires
      });
    },

    async getSessionAndUser(sessionToken) {
      const session = await prisma.authSession.findUnique({
        where: { sessionTokenHash: hashSessionToken(sessionToken) },
        include: { user: true }
      });

      const now = new Date();
      if (
        !session ||
        session.status !== "ACTIVE" ||
        session.expiresAt <= now ||
        session.user.lifecycleStatus !== "ACTIVE"
      ) {
        if (session?.status === "ACTIVE") {
          await prisma.authSession.update({
            where: { id: session.id },
            data:
              session.expiresAt <= now
                ? { status: "EXPIRED" }
                : { status: "REVOKED", revokedAt: now }
          });
        }
        return null;
      }

      await prisma.authSession.update({
        where: { id: session.id },
        data: { lastSeenAt: now }
      });

      return {
        session: toAdapterSession({
          sessionToken,
          userId: session.userId,
          expiresAt: session.expiresAt
        }),
        user: toAdapterUser(session.user)
      };
    },

    async updateSession(data) {
      await prisma.authSession.updateMany({
        where: {
          sessionTokenHash: hashSessionToken(data.sessionToken),
          status: "ACTIVE"
        },
        data: {
          ...(data.expires ? { expiresAt: data.expires } : {}),
          lastSeenAt: new Date()
        }
      });

      const session = await this.getSessionAndUser?.(data.sessionToken);
      return session?.session ?? null;
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
```

- [ ] **Step 4: Wire adapter into Auth.js config**

Modify `apps/web/src/auth/config.ts`:

```ts
import type { NextAuthConfig } from "next-auth";
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
          name: user.name,
          role: user.role
        };
      }

      return session;
    }
  }
} satisfies NextAuthConfig;
```

- [ ] **Step 5: Run adapter tests and typecheck**

Run:

```bash
cd apps/web
npm run test -- tests/unit/authjs-adapter.test.ts tests/unit/authjs-runtime.test.ts
npm run typecheck
```

Expected: tests pass and typecheck passes with the adapter helper using the Prisma `RoleName` type for project roles.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/auth/adapter.ts apps/web/src/auth/config.ts apps/web/tests/unit/authjs-adapter.test.ts
git commit -m "feat: back authjs sessions with auth session table"
```

---

### Task 3: Local Credentials Through Auth.js

**Files:**
- Create: `apps/web/src/auth/providers/local.ts`
- Modify: `apps/web/src/auth/config.ts`
- Modify: `apps/web/src/lib/user-actions.ts`
- Test: `apps/web/tests/unit/authjs-local-provider.test.ts`
- Test: `apps/web/tests/unit/user-actions.test.ts`

- [ ] **Step 1: Write local provider tests**

Create `apps/web/tests/unit/authjs-local-provider.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  localCredential: {
    findFirst: vi.fn(),
    update: vi.fn()
  },
  verifyLocalPassword: vi.fn()
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    localCredential: mocks.localCredential
  }
}));

vi.mock("@/lib/auth/local-credentials", () => ({
  normalizeLocalLogin: (value: string) => value.trim().toLowerCase(),
  verifyLocalPassword: mocks.verifyLocalPassword
}));

describe("Auth.js local credentials provider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("authorizes active users and resets failed login counters", async () => {
    mocks.localCredential.findFirst.mockResolvedValue({
      id: "credential-1",
      login: "admin@example.com",
      passwordHash: "hash",
      passwordSalt: "salt",
      keyVersion: "scrypt-v1",
      failedLoginCount: 2,
      failedLoginWindowStart: new Date("2026-05-27T10:00:00.000Z"),
      lockedUntil: null,
      user: {
        id: "user-1",
        workspaceId: "workspace-1",
        email: "admin@example.com",
        name: "Admin",
        role: "ADMIN",
        lifecycleStatus: "ACTIVE"
      }
    });
    mocks.verifyLocalPassword.mockResolvedValue(true);

    const { authorizeLocalCredentials } = await import("@/auth/providers/local");

    await expect(
      authorizeLocalCredentials({ login: " Admin@Example.com ", password: "secret" })
    ).resolves.toMatchObject({
      id: "user-1",
      workspaceId: "workspace-1",
      email: "admin@example.com",
      role: "ADMIN"
    });
    expect(mocks.localCredential.update).toHaveBeenCalledWith({
      where: { id: "credential-1" },
      data: expect.objectContaining({
        failedLoginCount: 0,
        failedLoginWindowStart: null,
        lastFailedLoginAt: null,
        lockedUntil: null,
        lastLoginAt: expect.any(Date)
      })
    });
  });

  it("records failed attempts without revealing whether login exists", async () => {
    mocks.localCredential.findFirst.mockResolvedValue({
      id: "credential-1",
      login: "admin@example.com",
      passwordHash: "hash",
      passwordSalt: "salt",
      keyVersion: "scrypt-v1",
      failedLoginCount: 0,
      failedLoginWindowStart: null,
      lockedUntil: null,
      user: {
        id: "user-1",
        workspaceId: "workspace-1",
        lifecycleStatus: "ACTIVE"
      }
    });
    mocks.verifyLocalPassword.mockResolvedValue(false);

    const { authorizeLocalCredentials } = await import("@/auth/providers/local");

    await expect(authorizeLocalCredentials({ login: "admin@example.com", password: "bad" })).resolves.toBeNull();
    expect(mocks.localCredential.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "credential-1" },
        data: expect.objectContaining({
          failedLoginCount: 1,
          lastFailedLoginAt: expect.any(Date)
        })
      })
    );
  });

  it("rejects inactive users", async () => {
    mocks.localCredential.findFirst.mockResolvedValue({
      id: "credential-1",
      login: "admin@example.com",
      passwordHash: "hash",
      passwordSalt: "salt",
      keyVersion: "scrypt-v1",
      lockedUntil: null,
      user: {
        id: "user-1",
        workspaceId: "workspace-1",
        lifecycleStatus: "SUSPENDED"
      }
    });
    mocks.verifyLocalPassword.mockResolvedValue(true);

    const { authorizeLocalCredentials } = await import("@/auth/providers/local");

    await expect(authorizeLocalCredentials({ login: "admin@example.com", password: "secret" })).resolves.toBeNull();
  });
});
```

- [ ] **Step 2: Run local provider tests to verify failure**

Run:

```bash
cd apps/web
npm run test -- tests/unit/authjs-local-provider.test.ts
```

Expected: FAIL because `@/auth/providers/local` does not exist.

- [ ] **Step 3: Implement local provider service**

Create `apps/web/src/auth/providers/local.ts`:

```ts
import Credentials from "next-auth/providers/credentials";
import { normalizeLocalLogin, verifyLocalPassword } from "@/lib/auth/local-credentials";
import { prisma } from "@/lib/db";

const localLoginFailureWindowMs = 15 * 60_000;
const localLoginLockMs = 15 * 60_000;
const localLoginMaxFailures = 5;

function stringCredential(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isCredentialLocked(credential: { lockedUntil?: Date | null }, now = new Date()) {
  return Boolean(credential.lockedUntil && credential.lockedUntil > now);
}

async function recordFailedLocalCredentialAttempt(
  credential: {
    id: string;
    failedLoginCount?: number | null;
    failedLoginWindowStart?: Date | null;
  },
  now = new Date()
) {
  const windowStart =
    credential.failedLoginWindowStart && now.getTime() - credential.failedLoginWindowStart.getTime() <= localLoginFailureWindowMs
      ? credential.failedLoginWindowStart
      : now;
  const failedLoginCount = windowStart === credential.failedLoginWindowStart ? (credential.failedLoginCount ?? 0) + 1 : 1;

  await prisma.localCredential.update({
    where: { id: credential.id },
    data: {
      failedLoginCount,
      failedLoginWindowStart: windowStart,
      lastFailedLoginAt: now,
      lockedUntil: failedLoginCount >= localLoginMaxFailures ? new Date(now.getTime() + localLoginLockMs) : null
    }
  });
}

export async function authorizeLocalCredentials(credentials: Partial<Record<"login" | "password", unknown>>) {
  const login = normalizeLocalLogin(stringCredential(credentials.login));
  const password = stringCredential(credentials.password);

  if (!login || !password) {
    return null;
  }

  const credential = await prisma.localCredential.findFirst({
    where: { login },
    include: { user: true }
  });

  if (!credential || isCredentialLocked(credential)) {
    return null;
  }

  const passwordMatches = await verifyLocalPassword({
    password,
    passwordHash: credential.passwordHash,
    passwordSalt: credential.passwordSalt,
    keyVersion: credential.keyVersion
  });

  if (!passwordMatches) {
    await recordFailedLocalCredentialAttempt(credential);
    return null;
  }

  if (credential.user.lifecycleStatus !== "ACTIVE") {
    return null;
  }

  await prisma.localCredential.update({
    where: { id: credential.id },
    data: {
      failedLoginCount: 0,
      failedLoginWindowStart: null,
      lastFailedLoginAt: null,
      lastLoginAt: new Date(),
      lockedUntil: null
    }
  });

  return {
    id: credential.user.id,
    workspaceId: credential.user.workspaceId,
    email: credential.user.email,
    name: credential.user.name,
    role: credential.user.role
  };
}

export const localCredentialsProvider = Credentials({
  id: "credentials",
  name: "Local credentials",
  credentials: {
    login: {},
    password: {}
  },
  authorize: authorizeLocalCredentials
});
```

- [ ] **Step 4: Register provider in Auth.js config**

Modify `apps/web/src/auth/config.ts`:

```ts
import type { NextAuthConfig } from "next-auth";
import { createQcAuthAdapter } from "@/auth/adapter";
import { localCredentialsProvider } from "@/auth/providers/local";

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
  providers: [localCredentialsProvider],
  callbacks: {
    session({ session, user }) {
      if (user) {
        session.user = {
          id: user.id,
          workspaceId: user.workspaceId,
          email: user.email,
          name: user.name,
          role: user.role
        };
      }

      return session;
    }
  }
} satisfies NextAuthConfig;
```

- [ ] **Step 5: Delegate local sign-in server action to Auth.js**

Modify `apps/web/src/lib/user-actions.ts` so `signInWithLocalCredentials()` validates `returnTo`, then calls Auth.js:

```ts
import { AuthError } from "next-auth";
import { signIn } from "../../auth";
```

Replace the body of `signInWithLocalCredentials()` with:

```ts
export async function signInWithLocalCredentials(formData: FormData) {
  const login = normalizeLocalLogin(stringField(formData, "login"));
  const password = stringField(formData, "password");
  const returnTo = safeReturnTo(stringField(formData, "returnTo"));

  if (!login || !password) {
    return loginErrorRedirect(returnTo);
  }

  try {
    await signIn("credentials", {
      login,
      password,
      redirectTo: returnTo
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return loginErrorRedirect(returnTo);
    }

    throw error;
  }
}
```

Remove duplicated local credential verification helpers from `user-actions.ts` only after tests prove the provider covers lockout behavior. Keep demo user session actions unchanged in this task.

- [ ] **Step 6: Update user action tests**

Modify `apps/web/tests/unit/user-actions.test.ts` mocks so `signInWithLocalCredentials()` expects `signIn("credentials", ...)` on success and login flash redirect on `AuthError`. Add a test:

```ts
it("delegates local credential login to Auth.js credentials provider", async () => {
  const { signInWithLocalCredentials } = await import("@/lib/user-actions");
  const { signIn } = await import("../../auth");
  const formData = new FormData();
  formData.set("login", "admin@example.com");
  formData.set("password", "secret");
  formData.set("returnTo", "/reviews");

  await expect(signInWithLocalCredentials(formData)).rejects.toMatchObject({ digest: expect.any(String) });
  expect(signIn).toHaveBeenCalledWith("credentials", {
    login: "admin@example.com",
    password: "secret",
    redirectTo: "/reviews"
  });
});
```

The current server-action tests mock `redirect()` as a thrown redirect, so this assertion must stay on the thrown redirect object.

- [ ] **Step 7: Run targeted tests**

Run:

```bash
cd apps/web
npm run test -- tests/unit/authjs-local-provider.test.ts tests/unit/user-actions.test.ts tests/unit/authjs-runtime.test.ts
npm run typecheck
```

Expected: tests pass and typecheck passes.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/auth/providers/local.ts apps/web/src/auth/config.ts apps/web/src/lib/user-actions.ts apps/web/tests/unit/authjs-local-provider.test.ts apps/web/tests/unit/user-actions.test.ts
git commit -m "feat: route local credentials through authjs"
```

---

### Task 4: `getCurrentUser()` Uses Auth.js Session First

**Files:**
- Modify: `apps/web/src/lib/current-user.ts`
- Test: `apps/web/tests/unit/current-user.test.ts`
- Test: `apps/web/tests/unit/api-session.test.ts`

- [ ] **Step 1: Extend current-user tests**

Modify `apps/web/tests/unit/current-user.test.ts` to mock `auth()` from `../../auth` and assert primary Auth.js lookup:

```ts
it("returns the Auth.js session user before legacy demo fallback", async () => {
  mocks.auth.mockResolvedValue({
    user: {
      id: "user-authjs",
      workspaceId: "workspace-1",
      email: "admin@example.com",
      name: "Admin",
      role: "ADMIN"
    }
  });
  mocks.prisma.user.findUnique.mockResolvedValue({
    id: "user-authjs",
    workspaceId: "workspace-1",
    email: "admin@example.com",
    name: "Admin",
    role: "ADMIN",
    lifecycleStatus: "ACTIVE",
    workspace: { id: "workspace-1", name: "Workspace" }
  });

  const { getCurrentUser } = await import("@/lib/current-user");

  await expect(getCurrentUser()).resolves.toMatchObject({
    id: "user-authjs",
    role: "ADMIN",
    workspace: { id: "workspace-1" }
  });
  expect(mocks.getValidAuthSession).not.toHaveBeenCalled();
});
```

Add another test:

```ts
it("rejects Auth.js sessions for inactive users", async () => {
  mocks.auth.mockResolvedValue({
    user: {
      id: "user-authjs",
      workspaceId: "workspace-1",
      email: "admin@example.com",
      name: "Admin",
      role: "ADMIN"
    }
  });
  mocks.prisma.user.findUnique.mockResolvedValue({
    id: "user-authjs",
    workspaceId: "workspace-1",
    lifecycleStatus: "SUSPENDED",
    workspace: { id: "workspace-1" }
  });

  const { getCurrentUser, AuthRequiredError } = await import("@/lib/current-user");

  await expect(getCurrentUser()).rejects.toBeInstanceOf(AuthRequiredError);
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
cd apps/web
npm run test -- tests/unit/current-user.test.ts
```

Expected: FAIL because `getCurrentUser()` does not read Auth.js.

- [ ] **Step 3: Implement Auth.js primary lookup**

Modify `apps/web/src/lib/current-user.ts`:

```ts
import { auth } from "../../auth";
```

Add helper:

```ts
async function userFromAuthJsSession() {
  const session = await auth();

  if (!session?.user?.id) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { workspace: true }
  });

  if (!user || user.lifecycleStatus !== "ACTIVE") {
    throw new AuthRequiredError();
  }

  return user;
}
```

At the start of `getCurrentUser()`:

```ts
  const authJsUser = await userFromAuthJsSession();

  if (authJsUser) {
    return authJsUser;
  }
```

Keep the existing `qc_session` and demo fallback after this block.

- [ ] **Step 4: Run auth/session tests**

Run:

```bash
cd apps/web
npm run test -- tests/unit/current-user.test.ts tests/unit/api-session.test.ts tests/unit/auth-session-lifecycle.test.ts
npm run typecheck
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/current-user.ts apps/web/tests/unit/current-user.test.ts
git commit -m "feat: resolve current user from authjs sessions"
```

---

### Task 5: Logout, Admin Revocation, and Lifecycle Revocation

**Files:**
- Modify: `apps/web/src/lib/auth/session.ts`
- Modify: `apps/web/src/app/auth/logout/route.ts`
- Modify: `apps/web/src/lib/auth-provider-actions.ts`
- Test: `apps/web/tests/unit/auth-logout-route.test.ts`
- Test: `apps/web/tests/unit/auth-session-lifecycle.test.ts`

- [ ] **Step 1: Write revocation tests**

Add to `apps/web/tests/unit/auth-session-lifecycle.test.ts`:

```ts
it("revokes Auth.js-backed sessions using the same AuthSession rows", async () => {
  mocks.prisma.authSession.updateMany.mockResolvedValue({ count: 2 });

  const { revokeActiveSessionsForUser } = await import("@/lib/auth/session");

  await expect(
    revokeActiveSessionsForUser({
      userId: "user-1",
      workspaceId: "workspace-1",
      actorId: "admin-1",
      reason: "manual"
    })
  ).resolves.toBe(2);
  expect(mocks.prisma.authSession.updateMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        userId: "user-1",
        status: "ACTIVE",
        workspaceId: "workspace-1"
      },
      data: expect.objectContaining({
        status: "REVOKED",
        revokedAt: expect.any(Date)
      })
    })
  );
});
```

Add to `apps/web/tests/unit/auth-logout-route.test.ts`:

```ts
it("clears legacy and Auth.js cookies on logout", async () => {
  const response = await POST(requestWithSessionCookie("session-token"));
  const setCookie = response.headers.getSetCookie().join("\\n");

  expect(setCookie).toContain("qc_session=");
  expect(setCookie).toContain("authjs.session-token=");
  expect(setCookie).toContain("authjs.callback-url=");
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
cd apps/web
npm run test -- tests/unit/auth-logout-route.test.ts tests/unit/auth-session-lifecycle.test.ts
```

Expected: logout cookie test fails until Auth.js cookies are cleared.

- [ ] **Step 3: Add Auth.js cookie names helper**

Modify `apps/web/src/lib/auth/session.ts`:

```ts
export const authJsSessionCookieNames = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
  "authjs.callback-url",
  "__Secure-authjs.callback-url",
  "authjs.csrf-token",
  "__Host-authjs.csrf-token"
];
```

- [ ] **Step 4: Clear Auth.js cookies on logout**

Modify `apps/web/src/app/auth/logout/route.ts`:

```ts
import { authJsSessionCookieNames, revokeAuthSession, sessionCookieName } from "@/lib/auth/session";
```

Inside `logout()` after existing cookie clearing:

```ts
  for (const cookieName of authJsSessionCookieNames) {
    response.cookies.set(cookieName, "", expiredCookieOptions());
  }
```

- [ ] **Step 5: Ensure admin revocation targets AuthSession**

In `apps/web/src/lib/auth-provider-actions.ts`, keep `revokeAuthSessionById()` updating `AuthSession.status = "REVOKED"`. Add no second store; Auth.js adapter already stores sessions in `AuthSession`.

- [ ] **Step 6: Run targeted tests**

Run:

```bash
cd apps/web
npm run test -- tests/unit/auth-logout-route.test.ts tests/unit/auth-session-lifecycle.test.ts tests/unit/auth-providers-route.test.ts
npm run typecheck
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/auth/session.ts apps/web/src/app/auth/logout/route.ts apps/web/src/lib/auth-provider-actions.ts apps/web/tests/unit/auth-logout-route.test.ts apps/web/tests/unit/auth-session-lifecycle.test.ts
git commit -m "fix: revoke authjs-backed sessions consistently"
```

---

### Task 6: OIDC and SAML Auth.js Session Bridge

**Files:**
- Create: `apps/web/src/auth/providers/assertion.ts`
- Modify: `apps/web/src/auth/config.ts`
- Modify: `apps/web/src/app/auth/callback/route.ts`
- Modify: `apps/web/src/app/auth/saml/acs/route.ts`
- Test: `apps/web/tests/unit/oidc-callback-route.test.ts`
- Test: `apps/web/tests/unit/saml-routes.test.ts`

- [ ] **Step 1: Write bridge provider tests**

Create test cases in the existing OIDC/SAML route tests asserting that callbacks no longer set only `qc_session`; they issue Auth.js-backed session cookies through the bridge and still clear unsafe state cookies.

OIDC test snippet:

```ts
it("issues an Auth.js-backed session after a valid OIDC callback", async () => {
  mocks.completeOidcSignIn.mockResolvedValue({
    user: { id: "user-1", workspaceId: "workspace-1" },
    providerId: "provider-1",
    redirectTo: "/reviews"
  });
  mocks.signIn.mockResolvedValue(undefined);

  const { GET } = await import("@/app/auth/callback/route");
  const response = await GET(new Request("http://localhost/auth/callback?code=abc&state=state"));

  expect(mocks.signIn).toHaveBeenCalledWith("enterprise-assertion", {
    userId: "user-1",
    providerId: "provider-1",
    redirect: false
  });
  expect(response.headers.get("location")).toBe("http://localhost/reviews");
});
```

SAML test snippet:

```ts
it("issues an Auth.js-backed session after valid SAML ACS validation", async () => {
  mocks.completeSamlSignIn.mockResolvedValue({
    user: { id: "user-1", workspaceId: "workspace-1" },
    providerId: "provider-1",
    redirectTo: "/reviews"
  });
  mocks.signIn.mockResolvedValue(undefined);

  const { POST } = await import("@/app/auth/saml/acs/route");
  const formData = new FormData();
  formData.set("SAMLResponse", "base64-response");
  formData.set("RelayState", "/reviews");
  const response = await POST(new Request("http://localhost/auth/saml/acs", { method: "POST", body: formData }));

  expect(mocks.signIn).toHaveBeenCalledWith("enterprise-assertion", {
    userId: "user-1",
    providerId: "provider-1",
    redirect: false
  });
  expect(response.headers.get("location")).toBe("http://localhost/reviews");
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
cd apps/web
npm run test -- tests/unit/oidc-callback-route.test.ts tests/unit/saml-routes.test.ts
```

Expected: tests fail because callbacks still create legacy session cookies directly.

- [ ] **Step 3: Add enterprise assertion provider**

Create `apps/web/src/auth/providers/assertion.ts`:

```ts
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/db";

export async function authorizeEnterpriseAssertion(credentials: Partial<Record<"userId" | "providerId", unknown>>) {
  const userId = typeof credentials.userId === "string" ? credentials.userId : "";
  const providerId = typeof credentials.providerId === "string" ? credentials.providerId : null;

  if (!userId) {
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      workspaceId: true,
      email: true,
      name: true,
      role: true,
      lifecycleStatus: true
    }
  });

  if (!user || user.lifecycleStatus !== "ACTIVE") {
    return null;
  }

  if (providerId) {
    const provider = await prisma.identityProvider.findFirst({
      where: {
        id: providerId,
        workspaceId: user.workspaceId,
        status: "active"
      },
      select: { id: true }
    });

    if (!provider) {
      return null;
    }
  }

  return {
    id: user.id,
    workspaceId: user.workspaceId,
    email: user.email,
    name: user.name,
    role: user.role
  };
}

export const enterpriseAssertionProvider = Credentials({
  id: "enterprise-assertion",
  name: "Enterprise assertion",
  credentials: {
    userId: {},
    providerId: {}
  },
  authorize: authorizeEnterpriseAssertion
});
```

- [ ] **Step 4: Register provider**

Modify `apps/web/src/auth/config.ts` providers:

```ts
providers: [localCredentialsProvider, enterpriseAssertionProvider],
```

- [ ] **Step 5: Delegate OIDC/SAML session issuance to Auth.js**

Modify `apps/web/src/app/auth/callback/route.ts`:

```ts
import { signIn } from "../../../../auth";
```

Modify `apps/web/src/app/auth/saml/acs/route.ts`:

```ts
import { signIn } from "../../../../../auth";
```

After current OIDC/SAML domain validation returns `{ user, providerId, redirectTo }`, replace direct `createAuthSession()` and `response.cookies.set(sessionCookieName, ...)` with:

```ts
await signIn("enterprise-assertion", {
  userId: authResult.user.id,
  providerId: authResult.providerId,
  redirect: false
});
```

Keep existing state cleanup, RelayState safety, audit, and redirect behavior unchanged.

- [ ] **Step 6: Run targeted tests**

Run:

```bash
cd apps/web
npm run test -- tests/unit/oidc-callback-route.test.ts tests/unit/saml-routes.test.ts tests/unit/authjs-adapter.test.ts
npm run typecheck
```

Expected: all pass; route tests must prove the callback no longer writes `qc_session` directly and delegates final session issuance to Auth.js.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/auth/providers/assertion.ts apps/web/src/auth/config.ts apps/web/src/app/auth/callback/route.ts apps/web/src/app/auth/saml/acs/route.ts apps/web/tests/unit/oidc-callback-route.test.ts apps/web/tests/unit/saml-routes.test.ts
git commit -m "feat: issue enterprise sso sessions through authjs"
```

---

### Task 7: E2E Helpers and Proxy Compatibility

**Files:**
- Modify: `apps/web/src/proxy.ts`
- Modify: `apps/web/tests/e2e/admin-layout-visual.spec.ts`
- Modify: `apps/web/tests/e2e/otrs-integration-cockpit.spec.ts`
- Modify: `apps/web/tests/e2e/review-workflow.spec.ts`
- Test: `apps/web/tests/unit/auth-shell-layout.test.ts`

- [ ] **Step 1: Add a shared E2E auth helper**

Create or update a helper in `apps/web/tests/e2e/helpers/auth.ts`:

```ts
import type { BrowserContext } from "@playwright/test";
import { createAuthSession, sessionCookieName } from "@/lib/auth/session";

export async function signInE2EUser(context: BrowserContext, user: { id: string }, userAgent: string) {
  const { token, session } = await createAuthSession({ userId: user.id, userAgent });

  await context.addCookies([
    {
      name: sessionCookieName,
      value: token,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
      expires: Math.floor(session.expiresAt.getTime() / 1000)
    }
  ]);
}
```

This preserves E2E stability while Auth.js cookie rollout is staged. Task 12 verifies that remaining legacy cookie issuance is confined to compatibility and tests, not new production sign-in paths.

- [ ] **Step 2: Update E2E specs to use helper**

Replace duplicated session cookie setup in:

- `apps/web/tests/e2e/admin-layout-visual.spec.ts`
- `apps/web/tests/e2e/otrs-integration-cockpit.spec.ts`

with:

```ts
await signInE2EUser(context, admin, "playwright-admin-layout");
```

or the relevant user/user-agent pair.

- [ ] **Step 3: Keep proxy conservative**

Modify `apps/web/src/proxy.ts` so it accepts Auth.js and legacy cookies during migration:

```ts
const sessionCookieNames = [
  "qc_session",
  "authjs.session-token",
  "__Secure-authjs.session-token",
  "next-auth.session-token",
  "__Secure-next-auth.session-token"
];

function hasAnySessionCookie(request: NextRequest) {
  return sessionCookieNames.some((name) => request.cookies.get(name)?.value);
}
```

Use `hasAnySessionCookie(request)` instead of checking only `qc_session`. Keep server-side `getCurrentUser()` as the real authorization boundary.

- [ ] **Step 4: Run E2E and proxy-related tests**

Run:

```bash
cd apps/web
npm run test -- tests/unit/auth-shell-layout.test.ts
npm run test:e2e
```

Expected: unit test passes and E2E passes.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/proxy.ts apps/web/tests/e2e/helpers/auth.ts apps/web/tests/e2e/admin-layout-visual.spec.ts apps/web/tests/e2e/otrs-integration-cockpit.spec.ts apps/web/tests/e2e/review-workflow.spec.ts apps/web/tests/unit/auth-shell-layout.test.ts
git commit -m "test: centralize auth session setup for e2e"
```

---

### Task 8: Integration Contract Validation and Duplicate Setup Safety

**Files:**
- Modify: `apps/web/src/lib/integration-import-service.ts`
- Modify: `apps/web/src/lib/integration-actions.ts`
- Test: `apps/web/tests/unit/integration-import-service.test.ts`
- Test: `apps/web/tests/unit/integration-actions-otrs.test.ts`

- [ ] **Step 1: Add failing contract tests**

Add to `apps/web/tests/unit/integration-import-service.test.ts`:

```ts
it("rejects unknown native helpdesk sources before queueing", async () => {
  const { assertIntegrationSourceContractSupported } = await import("@/lib/integration-import-service");

  expect(() => assertIntegrationSourceContractSupported("unknown_native", "native_helpdesk")).toThrow(
    "Источник unknown_native не поддерживается для типа native_helpdesk."
  );
});

it("rejects unknown data source sources before queueing", async () => {
  const { assertIntegrationSourceContractSupported } = await import("@/lib/integration-import-service");

  expect(() => assertIntegrationSourceContractSupported("unknown_data", "data_source")).toThrow(
    "Источник unknown_data не поддерживается для типа data_source."
  );
});
```

Add to `apps/web/tests/unit/integration-actions-otrs.test.ts`:

```ts
it("does not create duplicate setup jobs for an already queued dry-run", async () => {
  mocks.prisma.integrationRun.findFirst.mockResolvedValue({
    id: "run-existing",
    status: "queued",
    integrationId: "integration-1"
  });

  const { recordIntegrationDryRun } = await import("@/lib/integration-actions");
  const formData = validOtrsSetupFormData();

  await expect(recordIntegrationDryRun(formData)).resolves.toEqual({
    integrationId: "integration-1",
    runId: "run-existing",
    reusedQueuedRun: true
  });
  expect(mocks.prisma.backendJob.create).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
cd apps/web
npm run test -- tests/unit/integration-import-service.test.ts tests/unit/integration-actions-otrs.test.ts
```

Expected: tests fail because unknown known-type sources pass and setup always creates a new job.

- [ ] **Step 3: Harden source contract gate**

Modify `apps/web/src/lib/integration-import-service.ts`:

```ts
const knownNativeHelpdeskSources = new Set(phaseBHelpdeskSources);
const knownDataSourceSources = new Set(dataSourceSources);

export function assertIntegrationSourceContractSupported(source: string, type: string) {
  const helpdeskContract = phaseBSourceContracts[source as PhaseBHelpdeskSource];
  const dataSourceContract = dataSourceContracts[source as keyof typeof dataSourceContracts];

  if (type === "native_helpdesk" && !knownNativeHelpdeskSources.has(source as PhaseBHelpdeskSource)) {
    throw new Error(`Источник ${source} не поддерживается для типа native_helpdesk.`);
  }

  if (type === "data_source" && !knownDataSourceSources.has(source as keyof typeof dataSourceContracts)) {
    throw new Error(`Источник ${source} не поддерживается для типа data_source.`);
  }

  if (helpdeskContract && type !== helpdeskContract.type) {
    throw new Error(`Источник ${source} должен использовать тип ${helpdeskContract.type}.`);
  }

  if (dataSourceContract && type !== dataSourceContract.type) {
    throw new Error(`Источник ${source} должен использовать тип ${dataSourceContract.type}.`);
  }
}
```

- [ ] **Step 4: Add queued run reuse in setup dry-run**

Modify `recordIntegrationDryRun()` in `apps/web/src/lib/integration-actions.ts` after the integration is known and before creating a new run/job:

```ts
const existingQueuedRun = await tx.integrationRun.findFirst({
  where: {
    workspaceId: user.workspaceId,
    integrationId: integration.id,
    source: setup.source,
    mode: setup.mode,
    dryRun: setup.dryRun,
    status: { in: ["dry_run_queued", "queued", "running"] }
  },
  orderBy: { startedAt: "desc" },
  select: { id: true, status: true }
});

if (existingQueuedRun) {
  return {
    integrationId: integration.id,
    runId: existingQueuedRun.id,
    jobId: undefined,
    reusedQueuedRun: true
  };
}
```

Adjust the return type so callers can surface `runId` and `reusedQueuedRun`.

- [ ] **Step 5: Run targeted tests**

Run:

```bash
cd apps/web
npm run test -- tests/unit/integration-import-service.test.ts tests/unit/integration-actions-otrs.test.ts tests/unit/integration-runner-ledger.test.ts
npm run typecheck
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/integration-import-service.ts apps/web/src/lib/integration-actions.ts apps/web/tests/unit/integration-import-service.test.ts apps/web/tests/unit/integration-actions-otrs.test.ts
git commit -m "fix: harden integration setup contract gates"
```

---

### Task 9: Jira Pagination and Body Extraction

**Files:**
- Modify: `apps/web/src/lib/integrations/helpdesk-adapters/jira.ts`
- Modify: `apps/web/src/lib/normalizers/native-helpdesk.ts`
- Test: `apps/web/tests/unit/helpdesk-adapter-service.test.ts`
- Test: `apps/web/tests/unit/native-helpdesk-normalizer.test.ts`

- [ ] **Step 1: Add Jira pagination and body tests**

Add to `apps/web/tests/unit/helpdesk-adapter-service.test.ts`:

```ts
it("loads Jira comments across pages", async () => {
  const server = await createHelpdeskFixtureServer({
    source: "jira",
    jiraCommentsPages: [
      { start: 0, limit: 100, isLastPage: false, values: Array.from({ length: 100 }, (_, index) => jiraComment(index)) },
      { start: 100, limit: 100, isLastPage: true, values: [jiraComment(100)] }
    ]
  });

  try {
    const service = createHelpdeskAdapterService();
    const result = await service.loadConversation({
      source: "jira",
      baseUrl: server.baseUrl,
      ticketId: "JSD-1",
      credential: "email@example.com:token",
      limit: 200
    });

    expect(result.conversations[0]?.messages).toHaveLength(101);
    expect(server.requests.map((request) => request.query.start)).toContain("100");
  } finally {
    await server.close();
  }
});
```

Add to `apps/web/tests/unit/native-helpdesk-normalizer.test.ts`:

```ts
it("extracts Jira ADF-like comment body objects", () => {
  const { normalizeNativeHelpdeskConversation } = loadNormalizer();
  const result = normalizeNativeHelpdeskConversation({
    source: "jira",
    ticket: jiraTicketFixture(),
    comments: [
      {
        id: "comment-1",
        body: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "ADF comment body" }]
            }
          ]
        },
        author: { displayName: "Agent" },
        created: "2026-05-27T10:00:00Z",
        public: true
      }
    ]
  });

  expect(result.messages[0]?.body).toContain("ADF comment body");
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
cd apps/web
npm run test -- tests/unit/helpdesk-adapter-service.test.ts tests/unit/native-helpdesk-normalizer.test.ts
```

Expected: tests fail because Jira comments are not paginated and object body text is lost.

- [ ] **Step 3: Implement Jira comment pagination**

Modify `apps/web/src/lib/integrations/helpdesk-adapters/jira.ts`:

```ts
async function fetchJiraComments(client: HelpdeskHttpClient, ticketId: string, maxComments: number) {
  const comments: unknown[] = [];
  let start = 0;
  const limit = Math.min(100, Math.max(1, maxComments));

  while (comments.length < maxComments) {
    const response = await client.getJson(`/rest/servicedeskapi/request/${encodeURIComponent(ticketId)}/comment?limit=${limit}&start=${start}`);
    const values = Array.isArray((response as { values?: unknown }).values)
      ? ((response as { values: unknown[] }).values)
      : [];

    comments.push(...values);

    const isLastPage = (response as { isLastPage?: unknown }).isLastPage === true;
    if (isLastPage || values.length === 0) {
      break;
    }

    start += values.length;
  }

  return comments.slice(0, maxComments);
}
```

Use `fetchJiraComments()` in `createJiraAdapter().loadConversation()`.

- [ ] **Step 4: Implement generic Jira object body extraction**

Modify the Jira branch in `apps/web/src/lib/normalizers/native-helpdesk.ts`:

```ts
function jiraAdfText(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(jiraAdfText).filter(Boolean).join(" ");
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return [
      typeof record.text === "string" ? record.text : "",
      jiraAdfText(record.content),
      jiraAdfText(record.value)
    ]
      .filter(Boolean)
      .join(" ");
  }
  return "";
}
```

When normalizing Jira comments:

```ts
const body = jiraFieldText(comment.renderedBody) || jiraAdfText(comment.body) || jiraFieldText(comment.body);
```

- [ ] **Step 5: Run targeted tests**

Run:

```bash
cd apps/web
npm run test -- tests/unit/helpdesk-adapter-service.test.ts tests/unit/native-helpdesk-normalizer.test.ts tests/unit/helpdesk-adapter-contracts.test.ts
npm run typecheck
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/integrations/helpdesk-adapters/jira.ts apps/web/src/lib/normalizers/native-helpdesk.ts apps/web/tests/unit/helpdesk-adapter-service.test.ts apps/web/tests/unit/native-helpdesk-normalizer.test.ts
git commit -m "fix: harden jira adapter pagination and bodies"
```

---

### Task 10: YDB/YTsaurus Policy and Live Smoke Hardening

**Files:**
- Modify: `apps/web/src/lib/integrations/data-source-adapters/service.ts`
- Modify: `apps/web/src/lib/integrations/data-source-adapters/ytsaurus.ts`
- Modify: `apps/web/src/lib/integrations/data-source-adapters/ydb.ts`
- Modify: `apps/web/tests/live/data-source-live-smoke.test.ts`
- Modify: `apps/web/package.json`
- Test: `apps/web/tests/unit/ytsaurus-adapter.test.ts`
- Test: `apps/web/tests/unit/ydb-adapter.test.ts`
- Test: `apps/web/tests/unit/live-smoke-harness.test.ts`

- [ ] **Step 1: Add empty-result and server-limit tests**

Add to `apps/web/tests/unit/ytsaurus-adapter.test.ts`:

```ts
it("passes the requested row limit to YTsaurus read_table", async () => {
  const server = await createYTsaurusServer({ mode: "success" });

  try {
    await createYTsaurusAdapter().loadRows({
      source: "ytsaurus",
      baseUrl: server.baseUrl,
      config: { tablePath: "//home/qc/conversations" },
      credential: "yt-token",
      limit: 17
    });

    expect(server.requests[0]?.query.limit).toBe("17");
  } finally {
    await server.close();
  }
});
```

Add to `apps/web/tests/unit/ydb-adapter.test.ts`:

```ts
it("rejects empty normalized data source results unless connectivityOnly is enabled", async () => {
  mocks.executeQuery.mockResolvedValue({ resultSets: [{ rows: [] }] });

  await expect(
    createYdbAdapter().loadRows({
      source: "ydb",
      baseUrl: "grpc://localhost:2136/local",
      config: { query: "SELECT * FROM conversations LIMIT 1" },
      credential: JSON.stringify({ username: "qa", password: "secret" }),
      limit: 1
    })
  ).rejects.toThrow("Источник не вернул нормализованные диалоги.");
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
cd apps/web
npm run test -- tests/unit/ytsaurus-adapter.test.ts tests/unit/ydb-adapter.test.ts tests/unit/live-smoke-harness.test.ts
```

Expected: tests fail until limits and empty-result policy are implemented.

- [ ] **Step 3: Add YTsaurus server-side limit**

Modify `apps/web/src/lib/integrations/data-source-adapters/ytsaurus.ts` URL construction:

```ts
const url = new URL(`${proxyUrl}/api/v3/read_table`);
url.searchParams.set("path", tablePath);
url.searchParams.set("limit", String(input.limit));
```

Pass `url.toString()` to `fetchTextWithLimits()` and diagnostics.

- [ ] **Step 4: Enforce non-empty conversations in data source service**

Modify `apps/web/src/lib/integrations/data-source-adapters/service.ts`:

```ts
if (result.conversations.length === 0 && input.config.connectivityOnly !== true) {
  throw new Error("Источник не вернул нормализованные диалоги.");
}
```

Keep `connectivityOnly` allowed only from explicit config, not implicit dry-run success.

- [ ] **Step 5: Include data-source smoke in Phase D script**

Modify `apps/web/package.json`:

```json
"test:live:phase-d": "cross-env VITEST_INCLUDE_LIVE=1 vitest run tests/live/helpdesk-live-smoke.test.ts tests/live/identity-live-smoke.test.ts tests/live/data-source-live-smoke.test.ts"
```

Modify `apps/web/tests/unit/live-smoke-harness.test.ts`:

```ts
expect(packageJson.scripts["test:live:phase-d"]).toContain("tests/live/data-source-live-smoke.test.ts");
```

- [ ] **Step 6: Require non-empty live smoke output unless connectivity-only env is set**

Modify `apps/web/tests/live/data-source-live-smoke.test.ts`:

```ts
const connectivityOnly = process.env.DATA_SOURCE_LIVE_CONNECTIVITY_ONLY === "1";

if (!connectivityOnly && result.conversations.length === 0) {
  throw new Error("DATA_SOURCE live smoke expected at least one normalized conversation.");
}
```

- [ ] **Step 7: Run targeted tests**

Run:

```bash
cd apps/web
npm run test -- tests/unit/ytsaurus-adapter.test.ts tests/unit/ydb-adapter.test.ts tests/unit/live-smoke-harness.test.ts tests/unit/data-source-adapter-contracts.test.ts
npm run test:live:data-source
npm run typecheck
```

Expected: unit tests pass, live data-source test skips safely without protected env, typecheck passes.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/lib/integrations/data-source-adapters/service.ts apps/web/src/lib/integrations/data-source-adapters/ytsaurus.ts apps/web/src/lib/integrations/data-source-adapters/ydb.ts apps/web/tests/live/data-source-live-smoke.test.ts apps/web/package.json apps/web/tests/unit/ytsaurus-adapter.test.ts apps/web/tests/unit/ydb-adapter.test.ts apps/web/tests/unit/live-smoke-harness.test.ts
git commit -m "fix: harden data source import policy"
```

---

### Task 11: tRPC Queue Import Contract Honesty

**Files:**
- Modify: `apps/web/src/lib/integration-actions.ts`
- Modify: `apps/web/src/lib/integration-setup-schema.ts`
- Modify: `apps/web/src/server/trpc/routers/integrations.ts`
- Test: `apps/web/tests/unit/integration-trpc-router.test.ts`
- Test: `apps/web/tests/unit/integration-actions-otrs.test.ts`
- Test: `apps/web/tests/unit/trpc-route.test.ts`

- [ ] **Step 1: Add failing tests for the real tRPC return shape**

Add to `apps/web/tests/unit/integration-trpc-router.test.ts`:

```ts
it("returns the exact queueImport result shape from the server action bridge", async () => {
  mocks.recordIntegrationDryRunFromInput.mockResolvedValueOnce({
    ok: true,
    message: "Проверка подключения уже находится в очереди.",
    integrationId: "integration-1",
    runId: "run-existing",
    jobId: "job-existing",
    reusedQueuedRun: true
  });

  const { appRouter } = await import("@/server/trpc/root");
  const caller = appRouter.createCaller({
    user: { id: "user-1", workspaceId: "workspace-1", role: "ADMIN" } as never
  });

  await expect(
    caller.integrations.queueImport({
      source: "custom_api",
      sourceLabel: "Custom API",
      mode: "custom_api",
      baseUrl: "https://helpdesk.example.com",
      maxTickets: 100,
      batchSize: 25,
      dateRangeDays: 30,
      dryRun: true,
      deduplicate: true,
      config: {}
    })
  ).resolves.toEqual({
    ok: true,
    message: "Проверка подключения уже находится в очереди.",
    integrationId: "integration-1",
    runId: "run-existing",
    jobId: "job-existing",
    reusedQueuedRun: true
  });
});
```

Add to `apps/web/tests/unit/integration-actions-otrs.test.ts` in the dry-run action section:

```ts
it("preserves run and job ids when queueImport is called through tRPC input", async () => {
  mocks.prisma.$transaction.mockImplementation(async (callback) =>
    callback({
      integration: mocks.prisma.integration,
      integrationRun: {
        create: vi.fn().mockResolvedValue({
          id: "run-1",
          status: "dry_run_queued"
        })
      },
      backendJob: {
        create: vi.fn().mockResolvedValue({
          id: "job-1"
        })
      },
      auditLog: mocks.prisma.auditLog
    } as never)
  );

  const { recordIntegrationDryRunFromInput } = await import("@/lib/integration-actions");

  await expect(
    recordIntegrationDryRunFromInput({
      source: "custom_api",
      sourceLabel: "Custom API",
      mode: "custom_api",
      baseUrl: "https://helpdesk.example.com",
      maxTickets: 100,
      batchSize: 25,
      dateRangeDays: 30,
      ticketId: "",
      userLogin: "",
      dryRun: true,
      deduplicate: true,
      config: {}
    })
  ).resolves.toMatchObject({
    ok: true,
    integrationId: "integration-1",
    runId: "run-1",
    jobId: "job-1"
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
cd apps/web
npm run test -- tests/unit/integration-trpc-router.test.ts tests/unit/integration-actions-otrs.test.ts tests/unit/trpc-route.test.ts
```

Expected: the action bridge test fails because `recordIntegrationDryRunFromInput()` currently discards `runId` and `jobId`; route CSRF tests keep passing.

- [ ] **Step 3: Add a shared tRPC queue output schema**

Modify `apps/web/src/lib/integration-setup-schema.ts`:

```ts
export const integrationQueueImportOutputSchema = z.object({
  ok: z.literal(true),
  message: z.string().trim().min(1),
  integrationId: z.string().trim().min(1),
  runId: z.string().trim().min(1).optional(),
  jobId: z.string().trim().min(1).optional(),
  reusedQueuedRun: z.boolean().optional()
});

export type IntegrationQueueImportOutput = z.infer<typeof integrationQueueImportOutputSchema>;
```

- [ ] **Step 4: Return the real dry-run identifiers from the action bridge**

Modify `IntegrationImportActionState` in `apps/web/src/lib/integration-actions.ts`:

```ts
export type IntegrationImportActionState = {
  ok: boolean;
  message: string;
  integrationId?: string;
  runId?: string;
  jobId?: string;
  reusedQueuedRun?: boolean;
} | null;
```

Modify `recordIntegrationDryRun()` so the transaction returns the identifiers created or reused by Task 8:

```ts
return {
  integrationId: integration.id,
  runId: run.id,
  jobId: job.id,
  reusedQueuedRun: false
};
```

Modify the existing queued-run reuse branch from Task 8 to return:

```ts
return {
  integrationId: integration.id,
  runId: existingQueuedRun.id,
  jobId: undefined,
  reusedQueuedRun: true
};
```

Modify `recordIntegrationDryRunFromInput()` return:

```ts
return {
  ok: true,
  message: result.reusedQueuedRun
    ? "Проверка подключения уже находится в очереди."
    : parsed.dryRun
      ? "Проверка подключения поставлена в backend-очередь. Запуск выполнит connector runner."
      : "Импорт поставлен в backend-очередь. Запуск выполнит connector runner.",
  integrationId: result.integrationId,
  runId: result.runId,
  jobId: result.jobId,
  reusedQueuedRun: result.reusedQueuedRun
};
```

- [ ] **Step 5: Attach output validation to the tRPC router**

Modify `apps/web/src/server/trpc/routers/integrations.ts`:

```ts
import {
  integrationQueueImportOutputSchema,
  secretlessIntegrationSetupInputSchema
} from "@/lib/integration-setup-schema";
```

Change `queueImport` to:

```ts
queueImport: permissionProcedure("integrations:manage")
  .input(secretlessIntegrationSetupInputSchema)
  .output(integrationQueueImportOutputSchema)
  .mutation(({ input }) => recordIntegrationDryRunFromInput(input))
```

- [ ] **Step 6: Run targeted tests**

Run:

```bash
cd apps/web
npm run test -- tests/unit/integration-trpc-router.test.ts tests/unit/integration-actions-otrs.test.ts tests/unit/trpc-route.test.ts tests/unit/integration-setup-workspace.test.tsx
npm run typecheck
```

Expected: tRPC returns the same identifiers the server action creates or reuses, credentialed sources remain rejected by `secretlessIntegrationSetupInputSchema`, same-origin protection remains pinned by `trpc-route.test.ts`, and typecheck passes.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/integration-actions.ts apps/web/src/lib/integration-setup-schema.ts apps/web/src/server/trpc/routers/integrations.ts apps/web/tests/unit/integration-trpc-router.test.ts apps/web/tests/unit/integration-actions-otrs.test.ts apps/web/tests/unit/trpc-route.test.ts
git commit -m "fix: harden trpc queue import contract"
```

---

### Task 12: Final Verification and Review Gate

**Files:**
- No new source files required.
- Use full repository state.

- [ ] **Step 1: Run full verification**

Run:

```bash
cd apps/web
npm run typecheck
npm run test
npm run test:e2e
npm run test:live:data-source
cd ../..
git diff --check
```

Expected:

- `typecheck` exits 0.
- `test` exits 0.
- `test:e2e` exits 0.
- `test:live:data-source` skips safely without live env or passes with protected env.
- `git diff --check` exits 0.

- [ ] **Step 2: Dispatch final code review subagent**

Use a read-only reviewer prompt:

```text
Review the complete Auth.js ownership and integration hardening implementation in /Users/dubrsky/Downloads/qc_app.
Focus on security regressions, session revocation, cookie behavior, OIDC/SAML/SCIM lifecycle, Jira/YDB/YTsaurus hardening, tRPC CSRF/permission behavior, and missing tests.
Do not edit files. Return findings by severity with file:line references.
```

Expected: no Critical or Important findings. Fix any findings with a targeted task and rerun relevant tests.

- [ ] **Step 3: Confirm staged changes do not include unrelated dirty work**

Run:

```bash
git status --short
git diff --name-only
git diff --cached --name-only
```

Expected: unrelated pre-existing dirty files remain unstaged unless a task explicitly modified the same file for this hardening work.

- [ ] **Step 4: Commit final review fixes only through a targeted follow-up task**

For a small follow-up fix produced by final review, add a new task directly above this final verification gate with exact files, tests, and a commit command for that fix. For a clean final review, leave the branch at the last implementation commit and create no empty commit.

## Self-Review

- Spec coverage: Auth.js runtime, custom adapter, local credentials, current-user lookup, logout/revocation, OIDC/SAML bridge, proxy/E2E, integration contract gates, Jira hardening, data-source hardening, tRPC contract honesty, and live smoke coverage are all mapped to tasks.
- Vague-step scan: no vague "add tests later" steps remain.
- Type consistency: Auth.js session ownership consistently maps to existing `AuthSession`, `User`, and `ExternalIdentity`; product permissions remain in `current-user` and API guards.
- Risk control: high-risk SAML and OIDC work is isolated after adapter/local/current-user tasks; integration hardening tasks can be delegated separately after auth skeleton stabilizes.
