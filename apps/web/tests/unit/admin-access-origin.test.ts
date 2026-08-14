import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Simulates the production crash condition: any unconditional resolvePublicOrigin
// call during render throws, exactly like `next start` without QC_PUBLIC_ORIGIN.
const mocks = vi.hoisted(() => ({
  resolvePublicOrigin: vi.fn((): string => {
    throw new Error("QC_PUBLIC_ORIGIN must be HTTPS in production");
  }),
  findManyProviders: vi.fn(async (): Promise<unknown[]> => []),
  findManySessions: vi.fn(async (): Promise<unknown[]> => [])
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => ({ get: () => null }))
}));

vi.mock("@/lib/public-origin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/public-origin")>();
  return { ...actual, resolvePublicOrigin: mocks.resolvePublicOrigin };
});

vi.mock("@/lib/current-user", () => ({
  requireCurrentUserPermission: vi.fn(async () => ({ workspaceId: "workspace-1" }))
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    identityProvider: { findMany: mocks.findManyProviders },
    authSession: { findMany: mocks.findManySessions }
  }
}));

import AdminAccessPage from "@/app/admin/access/page";

type ContentProps = { searchParams: Promise<Record<string, string>> };
type AsyncComponent = (props: ContentProps) => Promise<ReactElement>;

async function renderAccessPage(searchParams: Record<string, string> = {}) {
  const tree = AdminAccessPage({ searchParams: Promise.resolve(searchParams) }) as ReactElement<{
    children: ReactElement<ContentProps>;
  }>;
  const content = tree.props.children;
  return (content.type as AsyncComponent)({ searchParams: Promise.resolve(searchParams) });
}

function samlProvider() {
  return {
    id: "provider-saml-1",
    workspaceId: "workspace-1",
    type: "SAML",
    name: "Corp SAML",
    slug: "corp-saml",
    status: "active",
    configJson: null,
    tenantId: null,
    clientId: null,
    clientSecretRef: null,
    scopes: null,
    issuer: null,
    authorizationUrl: "https://idp.example.test/sso",
    tokenUrl: null,
    jwksUrl: null,
    samlEntityId: null,
    samlMetadataUrl: null,
    samlCertificateRef: "env:SAML_IDP_CERT_CURRENT",
    ldapsUrl: null,
    ldapsBindDn: null,
    ldapsBindSecretRef: null,
    scimTokenPrefix: null,
    lastSyncAt: null,
    lastSyncStatus: null,
    lastSyncError: null,
    groupRoleMappings: [],
    _count: { externalIdentities: 0, authSessions: 0 }
  };
}

describe("admin access page public origin resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findManyProviders.mockResolvedValue([]);
    mocks.findManySessions.mockResolvedValue([]);
  });

  it("renders the page without resolving the public origin when no SAML provider is selected", async () => {
    const tree = await renderAccessPage();

    expect(tree).toBeTruthy();
    expect(mocks.resolvePublicOrigin).not.toHaveBeenCalled();
  });

  it("resolves the public origin only inside the SAML metadata branch", async () => {
    mocks.findManyProviders.mockResolvedValue([samlProvider()]);
    mocks.resolvePublicOrigin.mockReturnValue("https://qa.example.test");

    const tree = await renderAccessPage();

    expect(tree).toBeTruthy();
    expect(mocks.resolvePublicOrigin).toHaveBeenCalledTimes(1);
    expect(mocks.resolvePublicOrigin).toHaveBeenCalledWith({ headers: expect.anything() });
  });
});
