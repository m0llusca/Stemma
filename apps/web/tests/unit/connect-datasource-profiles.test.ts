import { Buffer } from "node:buffer";
import { describe, expect, it, vi } from "vitest";
import { dataSourceProfiles } from "@/lib/integrations/connect/profiles/data-source";

const ydb = dataSourceProfiles.ydb;
const ytsaurus = dataSourceProfiles.ytsaurus;

describe("data-source profile metadata", () => {
  it("exposes ydb and ytsaurus profiles with data_source type and required url policy", () => {
    expect(ydb.source).toBe("ydb");
    expect(ydb.type).toBe("data_source");
    expect(ydb.urlPolicy).toBe("required");

    expect(ytsaurus.source).toBe("ytsaurus");
    expect(ytsaurus.type).toBe("data_source");
    expect(ytsaurus.urlPolicy).toBe("required");
  });

  it("ydb collects connection string plus SA key / token / static credentials", () => {
    expect(ydb.credentialFields.map((f) => f.key)).toEqual([
      "connectionString",
      "serviceAccountKey",
      "accessToken",
      "username",
      "password"
    ]);
    const byKey = Object.fromEntries(ydb.credentialFields.map((f) => [f.key, f]));
    expect(byKey.connectionString.secret).toBe(false);
    expect(byKey.serviceAccountKey.secret).toBe(true);
    expect(byKey.accessToken.secret).toBe(true);
    expect(byKey.username.secret).toBe(false);
    expect(byKey.password.secret).toBe(true);
  });

  it("ytsaurus collects a single OAuth token secret field", () => {
    expect(ytsaurus.credentialFields.map((f) => f.key)).toEqual(["oauthToken"]);
    expect(ytsaurus.credentialFields[0].secret).toBe(true);
  });

  it("ydb normalizeUrl passes the grpc connection string through untouched", () => {
    const raw = "grpcs://ydb.example.net:2135/?database=/ru/qc";
    expect(ydb.normalizeUrl(raw).baseUrl).toBe(raw);
  });

  it("ytsaurus normalizeUrl passes the proxy URL through untouched", () => {
    const raw = "https://yt.example.net";
    expect(ytsaurus.normalizeUrl(raw).baseUrl).toBe(raw);
  });
});

describe("ytsaurus verifyAuth", () => {
  it("2xx -> ok with oauth_token authMode and data_source_token secret slot", async () => {
    const transport = vi.fn(async () => ({ statusCode: 200, body: Buffer.from('"//@"') }));
    const result = await ytsaurus.verifyAuth({
      baseUrl: "https://yt.example.net",
      credentials: { oauthToken: "yt-tok" },
      config: {},
      __transport: transport
    });
    expect(result.status).toBe("ok");
    expect(result.authMode).toBe("oauth_token");
    expect(result.secretSlots[0].kind).toBe("data_source_token");
    expect(result.secretSlots[0].secret).toBe("yt-tok");
  });

  it("401 -> failed with a russian hint", async () => {
    const transport = vi.fn(async () => ({ statusCode: 401, body: Buffer.from("denied") }));
    const result = await ytsaurus.verifyAuth({
      baseUrl: "https://yt.example.net",
      credentials: { oauthToken: "bad" },
      config: {},
      __transport: transport
    });
    expect(result.status).toBe("failed");
    expect(result.secretSlots).toEqual([]);
    expect(result.hint).toMatch(/401|токен|OAuth|доступ/i);
  });

  it("targets GET {baseUrl}/api/v3/get?path=//@ with an OAuth authorization header", async () => {
    const transport = vi.fn(async () => ({ statusCode: 200, body: Buffer.from('"//@"') }));
    await ytsaurus.verifyAuth({
      baseUrl: "https://yt.example.net",
      credentials: { oauthToken: "yt-tok" },
      config: {},
      __transport: transport
    });
    expect(transport).toHaveBeenCalledOnce();
    const request = (transport.mock.calls[0] as unknown[])[0] as {
      method: string;
      url: string;
      headers: Record<string, string>;
    };
    expect(request.method).toBe("GET");
    expect(request.url).toBe("https://yt.example.net/api/v3/get?path=//@");
    expect(request.headers.authorization).toBe("OAuth yt-tok");
  });
});

describe("ydb verifyAuth", () => {
  it("returns failed (not throw) and an empty secret slot list for a bogus connection string", async () => {
    const result = await ydb.verifyAuth({
      baseUrl: "grpcs://127.0.0.1:1/?database=/none",
      credentials: { username: "u", password: "p" },
      config: {},
      // keep the probe fast so the test never hangs on a real dial
      __timeoutMs: 250
    });
    expect(result.status).toBe("failed");
    expect(result.secretSlots).toEqual([]);
    expect(result.hint).toBeDefined();
  });
});
