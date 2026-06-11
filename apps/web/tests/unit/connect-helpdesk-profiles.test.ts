import { Buffer } from "node:buffer";
import { describe, expect, it, vi } from "vitest";
import { helpdeskProfiles } from "@/lib/integrations/connect/profiles/helpdesk";

const zendesk = helpdeskProfiles.zendesk;

describe("helpdesk verifyAuth", () => {
  it("zendesk: 200 -> ok with email/token basic credential slot", async () => {
    const transport = vi.fn(async () => ({ statusCode: 200, body: Buffer.from('{"user":{"id":1}}') }));
    const result = await zendesk.verifyAuth({
      baseUrl: "https://acme.zendesk.com",
      credentials: { email: "a@b.c", apiToken: "tok" },
      config: {},
      // @ts-expect-error test injects transport via the profile's optional probe override
      __transport: transport
    });
    expect(result.status).toBe("ok");
    expect(result.authMode).toBe("basic_api_token");
    expect(result.secretSlots[0].kind).toBe("auth_password");
    expect(result.secretSlots[0].secret).toBe("a@b.c/token:tok");
  });

  it("zendesk: 401 -> failed with russian hint", async () => {
    const transport = vi.fn(async () => ({ statusCode: 401, body: Buffer.from("denied") }));
    const result = await zendesk.verifyAuth({
      baseUrl: "https://acme.zendesk.com",
      credentials: { email: "a@b.c", apiToken: "bad" },
      config: {},
      // @ts-expect-error test transport
      __transport: transport
    });
    expect(result.status).toBe("failed");
    expect(result.hint).toMatch(/401|токен|пароль/i);
  });

  it("zendesk: 404 -> failed mentioning the endpoint", async () => {
    const transport = vi.fn(async () => ({ statusCode: 404, body: Buffer.from("not found") }));
    const result = await zendesk.verifyAuth({
      baseUrl: "https://acme.zendesk.com",
      credentials: { email: "a@b.c", apiToken: "tok" },
      config: {},
      // @ts-expect-error test transport
      __transport: transport
    });
    expect(result.status).toBe("failed");
    expect(result.hint).toMatch(/адрес|эндпоинт|404/i);
  });

  it("freshdesk: 200 -> ok with single-token basic_api_key slot", async () => {
    const transport = vi.fn(async () => ({ statusCode: 200, body: Buffer.from('{"id":7}') }));
    const result = await helpdeskProfiles.freshdesk.verifyAuth({
      baseUrl: "https://acme.freshdesk.com",
      credentials: { token: "fdtok" },
      config: {},
      // @ts-expect-error test transport
      __transport: transport
    });
    expect(result.status).toBe("ok");
    expect(result.authMode).toBe("basic_api_key");
    expect(result.secretSlots[0].secret).toBe("fdtok");
  });

  it("jira: builds email:apiToken basic credential secret", async () => {
    const transport = vi.fn(async () => ({ statusCode: 200, body: Buffer.from('{"accountId":"x"}') }));
    const result = await helpdeskProfiles.jira.verifyAuth({
      baseUrl: "https://acme.atlassian.net",
      credentials: { email: "a@b.c", apiToken: "jtok" },
      config: {},
      // @ts-expect-error test transport
      __transport: transport
    });
    expect(result.status).toBe("ok");
    expect(result.secretSlots[0].secret).toBe("a@b.c:jtok");
  });
});

describe("helpdesk profile metadata", () => {
  it("intercom profile uses a fixed base url and hides the url field", () => {
    expect(helpdeskProfiles.intercom.urlPolicy).toBe("fixed");
    expect(helpdeskProfiles.intercom.fixedBaseUrl).toBe("https://api.intercom.io");
  });

  it("hubspot profile uses a fixed base url and bearer token", () => {
    expect(helpdeskProfiles.hubspot.urlPolicy).toBe("fixed");
    expect(helpdeskProfiles.hubspot.fixedBaseUrl).toBe("https://api.hubapi.com");
  });

  it("intercom fixed-url normalizeUrl ignores raw input and reports detectedSource", () => {
    const out = helpdeskProfiles.intercom.normalizeUrl("ignored");
    expect(out.baseUrl).toBe("https://api.intercom.io");
    expect(out.hints?.detectedSource).toBe("intercom");
  });

  it("zendesk normalizeUrl reduces an agent ticket url and extracts the ticket id", () => {
    const out = helpdeskProfiles.zendesk.normalizeUrl("https://acme.zendesk.com/agent/tickets/123");
    expect(out.baseUrl).toBe("https://acme.zendesk.com");
    expect(out.hints?.detectedSource).toBe("zendesk");
    expect(out.hints?.testTicketId).toBe("123");
  });
});
