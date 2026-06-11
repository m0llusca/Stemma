import { describe, expect, it, vi } from "vitest";
import { runConnectPipeline } from "@/lib/integrations/connect/orchestrator";
import type { SourceConnectionProfile } from "@/lib/integrations/connect/types";

function fakeProfile(overrides: Partial<SourceConnectionProfile> = {}): SourceConnectionProfile {
  return {
    source: "fake",
    type: "native_helpdesk",
    urlPolicy: "required",
    credentialFields: [],
    normalizeUrl: (raw) => ({ baseUrl: raw }),
    verifyAuth: vi.fn(async () => ({ status: "ok" as const, authMode: "basic", secretSlots: [{ kind: "auth_password", secret: "s" }] })),
    ...overrides
  };
}

describe("runConnectPipeline", () => {
  it("runs validate->reachability->verify->persist and reports ok journal", async () => {
    const persist = vi.fn(async () => ({ integrationId: "int-1" }));
    const journal = await runConnectPipeline({
      profile: fakeProfile(),
      rawUrl: "https://acme.example.com",
      credentials: { token: "t" },
      workspaceId: "ws-1",
      actorId: "u-1",
      reachabilityCheck: vi.fn(async () => ({ status: "ok" as const, detail: "ответил" })),
      persist
    });
    const steps = journal.steps.map((s) => `${s.step}:${s.status}`);
    expect(steps).toContain("verify_auth:ok");
    expect(steps).toContain("persist:ok");
    expect(persist).toHaveBeenCalledOnce();
    expect(journal.connected).toBe(true);
  });

  it("stops and does not persist when verify_auth fails", async () => {
    const persist = vi.fn();
    const journal = await runConnectPipeline({
      profile: fakeProfile({ verifyAuth: vi.fn(async () => ({ status: "failed" as const, detail: "401", hint: "проверьте токен", authMode: "basic", secretSlots: [] })) }),
      rawUrl: "https://acme.example.com",
      credentials: { token: "bad" },
      workspaceId: "ws-1",
      actorId: "u-1",
      reachabilityCheck: vi.fn(async () => ({ status: "ok" as const })),
      persist
    });
    expect(persist).not.toHaveBeenCalled();
    expect(journal.connected).toBe(false);
    expect(journal.steps.find((s) => s.step === "verify_auth")?.status).toBe("failed");
  });

  it("persists with warning when test_import fails after verify ok", async () => {
    const journal = await runConnectPipeline({
      profile: fakeProfile({ testImport: vi.fn(async () => ({ status: "warning" as const, detail: "не вышло" })) }),
      rawUrl: "https://acme.example.com",
      credentials: { token: "t" },
      testTicketId: "123",
      workspaceId: "ws-1",
      actorId: "u-1",
      reachabilityCheck: vi.fn(async () => ({ status: "ok" as const })),
      persist: vi.fn(async () => ({ integrationId: "int-1" }))
    });
    expect(journal.connected).toBe(true);
    expect(journal.steps.find((s) => s.step === "test_import")?.status).toBe("warning");
  });
});
