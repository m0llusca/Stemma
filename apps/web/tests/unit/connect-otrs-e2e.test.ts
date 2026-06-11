import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createOtrsGenericInterfaceServer,
  defaultOtrsFixtureAuth,
  type OtrsGenericInterfaceServer
} from "../fixtures/otrs-genericinterface-server";
import { otrsConnectionProfile } from "@/lib/integrations/connect/profiles/otrs";
import { runConnectPipeline } from "@/lib/integrations/connect/orchestrator";

// Сквозной e2e против настоящего OTRS GenericInterface-фикстура. Фикстур НЕ
// отдаёт SessionCreate (только TicketSearch GET/POST /Ticket и TicketGet
// GET /Ticket/:id, проверяя UserLogin/Password на каждый запрос), поэтому
// verify_auth обязан пройти через credentials-fallback, а не через сессию.
describe("connect pipeline e2e (otrs over real GenericInterface fixture)", () => {
  let server: OtrsGenericInterfaceServer | undefined;

  beforeEach(() => {
    // SSRF-guard блокирует приватные адреса по умолчанию — фикстур слушает
    // 127.0.0.1, поэтому включаем явное разрешение (как для on-prem OTRS).
    vi.stubEnv("QC_ALLOW_PRIVATE_BASE_URLS", "1");
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await server?.close();
    server = undefined;
  });

  it("connects an OTRS source end-to-end via the credentials fallback", async () => {
    server = await createOtrsGenericInterfaceServer({ ticketIds: ["101"] });
    const credentials = defaultOtrsFixtureAuth();

    const persist = vi.fn(async () => ({ integrationId: "int-otrs-1" }));
    const journal = await runConnectPipeline({
      profile: otrsConnectionProfile,
      rawUrl: server.baseUrl,
      credentials: { userLogin: credentials.userLogin, password: credentials.password },
      workspaceId: "ws-1",
      actorId: "user-1",
      reachabilityCheck: async () => ({ status: "ok" }),
      persist
    });

    const statuses = Object.fromEntries(journal.steps.map((step) => [step.step, step.status]));
    // auto_detect присутствует (ok или warning в зависимости от того, какие
    // маршруты привязал детектор против фикстура).
    expect(["ok", "warning"]).toContain(statuses.auto_detect);
    expect(statuses.verify_auth).toBe("ok");
    expect(statuses.persist).toBe("ok");
    expect(journal.connected).toBe(true);
    expect(journal.integrationId).toBe("int-otrs-1");

    expect(persist).toHaveBeenCalledOnce();
    const persistArg = (persist.mock.calls[0] as unknown[])[0] as {
      authMode: string;
      secretSlots: Array<{ kind: string; secret: string }>;
    };
    expect(persistArg.authMode).toBe("credentials");
    expect(persistArg.secretSlots[0]).toEqual({ kind: "auth_password", secret: credentials.password });
  });

  it("fails verify_auth and does not persist with wrong credentials", async () => {
    server = await createOtrsGenericInterfaceServer({
      ticketIds: ["101"],
      expectedAuth: defaultOtrsFixtureAuth()
    });

    const persist = vi.fn();
    const journal = await runConnectPipeline({
      profile: otrsConnectionProfile,
      rawUrl: server.baseUrl,
      credentials: { userLogin: "wrong-agent", password: "wrong-password" },
      workspaceId: "ws-1",
      actorId: "user-1",
      reachabilityCheck: async () => ({ status: "ok" }),
      persist
    });

    expect(journal.steps.find((step) => step.step === "verify_auth")?.status).toBe("failed");
    expect(journal.connected).toBe(false);
    expect(persist).not.toHaveBeenCalled();
  });
});
