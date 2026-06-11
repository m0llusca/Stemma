import { Buffer } from "node:buffer";
import { describe, expect, it, vi } from "vitest";
import {
  enterpriseProfiles,
  limitedSupportSources
} from "@/lib/integrations/connect/profiles/enterprise";
import type { ConnectContext } from "@/lib/integrations/connect/types";

type FakeTransport = (req: unknown) => Promise<{ statusCode: number; body: Buffer }>;

function ctxWith(transport: FakeTransport): ConnectContext {
  return {
    baseUrl: "https://example.my.salesforce.com",
    credentials: { clientId: "id", clientSecret: "secret" },
    config: {},
    // injected fake transport (consumed by verifyAuth via the optional override)
    __transport: transport
  } as ConnectContext & { __transport: FakeTransport };
}

describe("enterprise connection profiles", () => {
  it("exposes salesforce, servicenow and dynamics profiles, all type enterprise", () => {
    for (const source of ["salesforce", "servicenow", "dynamics"] as const) {
      const profile = enterpriseProfiles[source];
      expect(profile).toBeDefined();
      expect(profile.source).toBe(source);
      expect(profile.type).toBe("enterprise");
      expect(profile.urlPolicy).toBe("required");
    }
  });

  it("marks the first credential field with the limited-support hint", () => {
    for (const source of ["salesforce", "servicenow", "dynamics"] as const) {
      const fields = enterpriseProfiles[source].credentialFields;
      expect(fields[0].secret).toBe(false);
      expect(fields[0].key).toBe("clientId");
      expect(fields[0].hint ?? "").toMatch(/ограниченная поддержка — требуется живая сертификация/i);
      const secretField = fields.find((field) => field.secret);
      expect(secretField?.key).toBe("clientSecret");
      expect(secretField?.secret).toBe(true);
    }
  });

  it("normalizeUrl reduces the instance URL to its origin and detects the source from host", () => {
    const out = enterpriseProfiles.salesforce.normalizeUrl(
      "https://example.my.salesforce.com/lightning/page/home"
    );
    expect(out.baseUrl).toBe("https://example.my.salesforce.com");
    expect(out.hints?.detectedSource).toBe("salesforce");
  });

  it("salesforce verifyAuth returns ok when the token endpoint yields a 2xx access_token", async () => {
    const transport = vi.fn(async () => ({
      statusCode: 200,
      body: Buffer.from(JSON.stringify({ access_token: "00Dxx!token", token_type: "Bearer" }))
    }));
    const result = await enterpriseProfiles.salesforce.verifyAuth(ctxWith(transport));
    expect(result.status).toBe("ok");
    expect(result.authMode).toBe("oauth_connected_app");
    expect(result.secretSlots[0].kind).toBe("oauth_client_credentials");
    expect(JSON.parse(result.secretSlots[0].secret)).toEqual({ clientId: "id", clientSecret: "secret" });
    // POST to the salesforce token endpoint with a client_credentials grant
    const req = transport.mock.calls[0][0] as { method: string; url: string; body?: string };
    expect(req.method).toBe("POST");
    expect(req.url).toBe("https://example.my.salesforce.com/services/oauth2/token");
    expect(req.body).toContain("grant_type=client_credentials");
  });

  it("salesforce verifyAuth returns failed with a russian hint on 401", async () => {
    const transport = vi.fn(async () => ({
      statusCode: 401,
      body: Buffer.from(JSON.stringify({ error: "invalid_client" }))
    }));
    const result = await enterpriseProfiles.salesforce.verifyAuth(ctxWith(transport));
    expect(result.status).toBe("failed");
    expect(result.secretSlots).toEqual([]);
    expect(result.hint ?? result.detail ?? "").toMatch(/[а-яё]/i);
  });

  it("salesforce verifyAuth returns failed when a 2xx body carries no access_token", async () => {
    const transport = vi.fn(async () => ({
      statusCode: 200,
      body: Buffer.from(JSON.stringify({ token_type: "Bearer" }))
    }));
    const result = await enterpriseProfiles.salesforce.verifyAuth(ctxWith(transport));
    expect(result.status).toBe("failed");
  });

  it("servicenow verifyAuth returns ok when the token endpoint yields a 2xx access_token", async () => {
    const transport = vi.fn(async () => ({
      statusCode: 200,
      body: Buffer.from(JSON.stringify({ access_token: "snow-token" }))
    }));
    const result = await enterpriseProfiles.servicenow.verifyAuth({
      baseUrl: "https://dev12345.service-now.com",
      credentials: { clientId: "id", clientSecret: "secret" },
      config: {},
      __transport: transport
    } as ConnectContext & { __transport: FakeTransport });
    expect(result.status).toBe("ok");
    expect(result.authMode).toBe("oauth_connected_app");
    expect(result.secretSlots[0].kind).toBe("oauth_client_credentials");
  });

  it("servicenow verifyAuth returns failed with the manual-fallback russian hint when no token is issued", async () => {
    const transport = vi.fn(async () => ({ statusCode: 401, body: Buffer.from("denied") }));
    const result = await enterpriseProfiles.servicenow.verifyAuth({
      baseUrl: "https://dev12345.service-now.com",
      credentials: { clientId: "id", clientSecret: "secret" },
      config: {},
      __transport: transport
    } as ConnectContext & { __transport: FakeTransport });
    expect(result.status).toBe("failed");
    expect(result.hint ?? "").toMatch(
      /Живая сертификация не пройдена — настройте вручную в расширенных настройках/i
    );
  });

  it("dynamics verifyAuth returns failed with the manual-fallback russian hint when no token is issued", async () => {
    const transport = vi.fn(async () => ({ statusCode: 403, body: Buffer.from("denied") }));
    const result = await enterpriseProfiles.dynamics.verifyAuth({
      baseUrl: "https://example.crm.dynamics.com",
      credentials: { clientId: "id", clientSecret: "secret" },
      config: {},
      __transport: transport
    } as ConnectContext & { __transport: FakeTransport });
    expect(result.status).toBe("failed");
    expect(result.hint ?? "").toMatch(
      /Живая сертификация не пройдена — настройте вручную в расширенных настройках/i
    );
  });

  it("dynamics verifyAuth returns ok when a 2xx token response is received", async () => {
    const transport = vi.fn(async () => ({
      statusCode: 200,
      body: Buffer.from(JSON.stringify({ access_token: "dyn-token" }))
    }));
    const result = await enterpriseProfiles.dynamics.verifyAuth({
      baseUrl: "https://example.crm.dynamics.com",
      credentials: { clientId: "id", clientSecret: "secret" },
      config: {},
      __transport: transport
    } as ConnectContext & { __transport: FakeTransport });
    expect(result.status).toBe("ok");
    expect(result.secretSlots[0].kind).toBe("oauth_client_credentials");
  });

  it("limitedSupportSources contains all three enterprise sources", () => {
    expect(limitedSupportSources.has("salesforce")).toBe(true);
    expect(limitedSupportSources.has("servicenow")).toBe(true);
    expect(limitedSupportSources.has("dynamics")).toBe(true);
    expect(limitedSupportSources.size).toBe(3);
  });
});
