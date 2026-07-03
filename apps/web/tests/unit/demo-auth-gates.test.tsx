import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookieGet: vi.fn(),
  cookies: vi.fn(),
  getValidAuthSession: vi.fn(),
  isDemoAuthEnabled: vi.fn(),
  requireCurrentUserPermission: vi.fn(),
  signInWithDemoUser: vi.fn(),
  signInWithLocalCredentials: vi.fn(),
  revokeApiTokenById: vi.fn(),
  prisma: {
    apiToken: {
      findMany: vi.fn()
    },
    identityProvider: {
      findMany: vi.fn()
    },
    user: {
      findMany: vi.fn()
    }
  }
}));

vi.mock("next/headers", () => ({
  cookies: mocks.cookies
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  usePathname: () => "/admin/tokens"
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  )
}));

vi.mock("@/components/admin/api-token-create-form", () => ({
  ApiTokenCreateForm: () => <form aria-label="Создать API-ключ" />
}));

vi.mock("@/components/copy-button", () => ({
  CopyButton: ({ value, label = "Скопировать" }: { value: string; label?: string }) => (
    <button type="button" data-copy-value={value}>
      {label}
    </button>
  )
}));

vi.mock("@/components/ui/help-tooltip", () => ({
  HelpTooltip: ({ label }: { label: string }) => <button type="button">{label}</button>
}));

vi.mock("@/lib/api-token-actions", () => ({
  revokeApiTokenById: mocks.revokeApiTokenById
}));

vi.mock("@/lib/auth/session", () => ({
  getValidAuthSession: mocks.getValidAuthSession,
  sessionCookieName: "qc_session"
}));

vi.mock("@/lib/current-user", () => ({
  currentUserCookieName: "qc_current_user_id",
  isDemoAuthEnabled: mocks.isDemoAuthEnabled,
  requireCurrentUserPermission: mocks.requireCurrentUserPermission
}));

// AdminFrame is an async server component (resolves the role to gate the admin
// sub-nav); React Testing Library can't render nested async server components,
// so stub it to a passthrough — this test only asserts on the page content it
// wraps, and the rail's role gating is covered by admin-subnav.test.ts.
vi.mock("@/components/admin/admin-frame", () => ({
  AdminFrame: ({ children }: { children: ReactNode }) => children
}));

vi.mock("@/lib/db", () => ({
  prisma: mocks.prisma
}));

vi.mock("@/lib/user-actions", () => ({
  signInWithDemoUser: mocks.signInWithDemoUser,
  signInWithLocalCredentials: mocks.signInWithLocalCredentials
}));

describe("demo auth gated surfaces", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mocks.cookieGet.mockReturnValue(undefined);
    mocks.cookies.mockResolvedValue({ get: mocks.cookieGet });
    mocks.getValidAuthSession.mockResolvedValue(null);
    mocks.isDemoAuthEnabled.mockReturnValue(false);
    mocks.requireCurrentUserPermission.mockResolvedValue({
      id: "admin-1",
      workspaceId: "workspace-1",
      role: "ADMIN"
    });
    mocks.prisma.apiToken.findMany.mockResolvedValue([]);
    mocks.prisma.identityProvider.findMany.mockResolvedValue([]);
    mocks.prisma.user.findMany.mockResolvedValue([
      {
        id: "demo-user",
        name: "Демо",
        email: "demo@example.com",
        role: "QA_ANALYST",
        workspace: { name: "Демо workspace" }
      }
    ]);
  });

  it("does not query or render demo login options when demo auth is disabled", async () => {
    const { default: LoginPage } = await import("@/app/auth/login/page");

    render(await LoginPage({ searchParams: Promise.resolve({}) }));

    expect(mocks.prisma.user.findMany).not.toHaveBeenCalled();
    expect(screen.queryByText("Демо-вход")).toBeNull();
    expect(screen.getByRole("button", { name: "Войти" })).not.toBeNull();
  });

  it("does not render the hard-coded demo API token on the admin tokens page when demo auth is disabled", async () => {
    const { demoApiToken } = await import("@/lib/custom-api-docs");
    const { AdminTokensPageContent } = await import("@/app/admin/tokens/page");

    render(await AdminTokensPageContent({ searchParams: Promise.resolve({ section: "local" }) }));

    expect(screen.queryByText(demoApiToken)).toBeNull();
    expect(screen.queryByText(`Authorization: Bearer ${demoApiToken}`)).toBeNull();
    expect(screen.getByText(/Плейсхолдер <API_TOKEN>/)).not.toBeNull();
  });

  it("keeps seeded demo API token creation gated by QC_DEMO_AUTH", () => {
    const seedSource = readFileSync(join(process.cwd(), "prisma/seed.ts"), "utf8");
    const demoAuthGateIndex = seedSource.indexOf('process.env.QC_DEMO_AUTH === "enabled"');
    const demoTokenCreateIndex = seedSource.indexOf("prisma.apiToken.create");

    expect(demoAuthGateIndex).toBeGreaterThanOrEqual(0);
    expect(demoAuthGateIndex).toBeLessThan(demoTokenCreateIndex);
  });
});
