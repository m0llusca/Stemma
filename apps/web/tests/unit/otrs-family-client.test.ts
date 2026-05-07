import http from "node:http";
import { buildDefaultOtrsConnectorConfig, parseOtrsConnectorConfig } from "@/lib/integrations/otrs-family/config";
import {
  createOtrsHttpClient,
  redactOtrsPayload,
  redactOtrsUrl,
  type OtrsTransport,
  type OtrsTransportRequest
} from "@/lib/integrations/otrs-family/client";
import { OtrsConnectorError } from "@/lib/integrations/otrs-family/errors";
import { buildTicketGetRequest, buildTicketSearchRequest, parseTicketSearchResponse } from "@/lib/integrations/otrs-family/requests";
import { describe, expect, it } from "vitest";

const baseUrl = "https://support.example.com/otrs";
const userLogin = "qa_api";
const password = "super-secret";
const testTimeoutMs = 1500;

function createRecordingClient(responseBody: unknown = { Success: 1 }) {
  const requests: OtrsTransportRequest[] = [];
  const transport: OtrsTransport = async (request) => {
    requests.push(request);
    return {
      statusCode: 200,
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(responseBody)
    };
  };
  const config = buildDefaultOtrsConnectorConfig("otrs_ce_6");
  const client = createOtrsHttpClient({
    config,
    baseUrl,
    userLogin,
    password,
    transport
  });

  return { client, config, requests };
}

async function expectConnectorError(action: () => Promise<unknown>) {
  try {
    await action();
  } catch (error) {
    expect(error).toBeInstanceOf(OtrsConnectorError);
    return error as OtrsConnectorError;
  }

  throw new Error("Expected OtrsConnectorError");
}

async function withHttpServer<T>(
  handler: http.RequestListener,
  run: (input: { baseUrl: string }) => Promise<T>
): Promise<T> {
  const server = http.createServer(handler);

  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => resolve());
    });

    const address = server.address();

    if (!address || typeof address === "string") {
      throw new Error("Expected local HTTP server address.");
    }

    return await run({ baseUrl: `http://127.0.0.1:${address.port}/otrs` });
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

function withTestTimeout<T>(promise: Promise<T>, timeoutMs = testTimeoutMs): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timeout = setTimeout(() => reject(new Error(`Test operation timed out after ${timeoutMs}ms.`)), timeoutMs);
    })
  ]).finally(() => {
    if (timeout) {
      clearTimeout(timeout);
    }
  });
}

describe("OTRS-family HTTP client", () => {
  it("builds TicketSearch as default OTRS CE 6 POST JSON with auth, filters, and limit", async () => {
    const { client, config, requests } = createRecordingClient({ TicketID: ["1", "2"] });

    await client.requestJson(
      buildTicketSearchRequest({
        config,
        baseUrl,
        userLogin,
        password,
        filters: {
          Queue: "Support::Refunds",
          StateType: "Open"
        },
        limit: 25
      })
    );

    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe("POST");
    expect(requests[0].url).toBe(`${baseUrl}/nph-genericinterface.pl/Webservice/GenericTicketConnectorREST/Ticket`);
    expect(requests[0].headers["content-type"]).toBe("application/json");
    expect(JSON.parse(requests[0].body ?? "")).toEqual({
      UserLogin: userLogin,
      Password: password,
      Queue: "Support::Refunds",
      StateType: "Open",
      Limit: 25
    });
  });

  it("honors a POST route override with post_json serialization", async () => {
    const requests: OtrsTransportRequest[] = [];
    const config = parseOtrsConnectorConfig({
      product: "otrs_ce_6",
      advanced: {
        routeOverridesEnabled: true
      },
      routes: {
        ticketSearchPath: "/CustomTicketSearch",
        ticketSearchMethod: "POST"
      },
      requestMode: {
        ticketSearch: "post_json"
      }
    });
    const client = createOtrsHttpClient({
      config,
      baseUrl,
      userLogin,
      password,
      transport: async (request) => {
        requests.push(request);
        return {
          statusCode: 200,
          body: JSON.stringify({ TicketID: ["42"] })
        };
      }
    });

    await client.requestJson(
      buildTicketSearchRequest({
        config,
        baseUrl,
        userLogin,
        password,
        filters: {
          Queue: "Raw"
        }
      })
    );

    expect(requests[0].method).toBe("POST");
    expect(requests[0].url).toBe(`${baseUrl}/nph-genericinterface.pl/Webservice/GenericTicketConnectorREST/CustomTicketSearch`);
    expect(JSON.parse(requests[0].body ?? "")).toMatchObject({
      UserLogin: userLogin,
      Password: password,
      Queue: "Raw"
    });
  });

  it("builds default OTOBO TicketSearch as GET query", async () => {
    const requests: OtrsTransportRequest[] = [];
    const config = buildDefaultOtrsConnectorConfig("otobo");
    const client = createOtrsHttpClient({
      config,
      baseUrl,
      userLogin,
      password,
      transport: async (request) => {
        requests.push(request);
        return {
          statusCode: 200,
          body: JSON.stringify({ TicketID: ["42"] })
        };
      }
    });

    await client.requestJson(
      buildTicketSearchRequest({
        config,
        baseUrl,
        userLogin,
        password,
        filters: {
          Queue: "Raw"
        },
        limit: 10
      })
    );

    expect(requests[0].method).toBe("GET");
    expect(requests[0].body).toBeUndefined();

    const url = new URL(requests[0].url);
    expect(url.pathname).toBe("/otrs/nph-genericinterface.pl/Webservice/GenericTicketConnectorREST/TicketSearch");
    expect(url.searchParams.get("UserLogin")).toBe(userLogin);
    expect(url.searchParams.get("Password")).toBe(password);
    expect(url.searchParams.get("Queue")).toBe("Raw");
    expect(url.searchParams.get("Limit")).toBe("10");
  });

  it("rejects unsupported route method and serialization mode combinations safely", () => {
    const config = parseOtrsConnectorConfig({
      product: "otrs_ce_6",
      advanced: {
        routeOverridesEnabled: true
      },
      routes: {
        ticketSearchMethod: "GET"
      },
      requestMode: {
        ticketSearch: "post_json"
      }
    });

    expect(() =>
      buildTicketSearchRequest({
        config,
        baseUrl,
        userLogin,
        password,
        filters: {
          Queue: "Raw"
        }
      })
    ).toThrow(/unsupported/i);
  });

  it("builds TicketGet as default OTRS CE 6 GET query with auth, articles, and attachment metadata only", async () => {
    const { client, config, requests } = createRecordingClient({ Ticket: [] });

    await client.requestJson(
      buildTicketGetRequest({
        config,
        baseUrl,
        userLogin,
        password,
        ticketId: "42"
      })
    );

    expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe("GET");

    const url = new URL(requests[0].url);
    expect(url.pathname).toBe("/otrs/nph-genericinterface.pl/Webservice/GenericTicketConnectorREST/Ticket/42");
    expect(url.searchParams.get("UserLogin")).toBe(userLogin);
    expect(url.searchParams.get("Password")).toBe(password);
    expect(url.searchParams.get("AllArticles")).toBe("1");
    expect(url.searchParams.get("Attachments")).toBe("1");
    expect(url.searchParams.get("GetAttachmentContents")).toBe("0");
    expect(url.searchParams.has("TicketID")).toBe(false);
  });

  it("redacts auth values from URLs and nested payloads", () => {
    const rawUrl =
      "https://qa_api:super-secret@support.example.com/otrs/Ticket?UserLogin=qa_api&Password=super-secret&SessionID=sid&token=raw-token-value&Queue=Raw";
    const redactedUrl = redactOtrsUrl(rawUrl);
    const redactedPayload = redactOtrsPayload({
      UserLogin: userLogin,
      Password: password,
      nested: {
        SessionID: "sid",
        token: "raw-token-value",
        url: rawUrl,
        Authorization: "Bearer abc",
        Queue: "Raw"
      }
    });

    expect(redactedUrl).not.toContain(userLogin);
    expect(redactedUrl).not.toContain(password);
    expect(redactedUrl).not.toContain("sid");
    expect(redactedUrl).not.toContain("raw-token-value");
    expect(redactedUrl).toContain("Queue=Raw");
    expect(JSON.stringify(redactedPayload)).not.toContain(userLogin);
    expect(JSON.stringify(redactedPayload)).not.toContain(password);
    expect(JSON.stringify(redactedPayload)).not.toContain("Bearer abc");
    expect(redactedPayload).toMatchObject({
      UserLogin: "[REDACTED]",
      Password: "[REDACTED]",
      nested: {
        SessionID: "[REDACTED]",
        token: "[REDACTED]",
        Queue: "Raw"
      }
    });
  });

  it("maps HTTP 401 to auth_failed and redacts error detail", async () => {
    const config = buildDefaultOtrsConnectorConfig("otrs_ce_6");
    const client = createOtrsHttpClient({
      config,
      baseUrl,
      userLogin,
      password,
      transport: async () => ({
        statusCode: 401,
        body: JSON.stringify({ Error: "bad login", Password: password, UserLogin: userLogin })
      })
    });

    const error = await expectConnectorError(() =>
      client.requestJson(buildTicketSearchRequest({ config, baseUrl, userLogin, password, filters: { Queue: "Raw" } }))
    );

    expect(error.code).toBe("auth_failed");
    expect(JSON.stringify(error.redactedDetail)).not.toContain(password);
    expect(JSON.stringify(error.redactedDetail)).not.toContain(userLogin);
  });

  it("redacts sensitive keys inside JSON error body strings", async () => {
    const config = buildDefaultOtrsConnectorConfig("otrs_ce_6");
    const sensitiveBody = JSON.stringify({
      Error: "bad login",
      SessionID: "raw-session-id",
      token: "raw-token-value",
      Password: password,
      UserLogin: userLogin,
      nested: {
        apiToken: "raw-api-token"
      }
    });
    const authClient = createOtrsHttpClient({
      config,
      baseUrl,
      userLogin,
      password,
      transport: async () => ({
        statusCode: 401,
        body: sensitiveBody
      })
    });
    const failureClient = createOtrsHttpClient({
      config,
      baseUrl,
      userLogin,
      password,
      transport: async () => ({
        statusCode: 500,
        body: sensitiveBody
      })
    });

    const authError = await expectConnectorError(() =>
      authClient.requestJson(buildTicketSearchRequest({ config, baseUrl, userLogin, password, filters: { Queue: "Raw" } }))
    );
    const failureError = await expectConnectorError(() =>
      failureClient.requestJson(buildTicketSearchRequest({ config, baseUrl, userLogin, password, filters: { Queue: "Raw" } }))
    );

    expect(authError.code).toBe("auth_failed");
    expect(failureError.code).toBe("ticket_search_failed");

    for (const error of [authError, failureError]) {
      const detail = JSON.stringify(error.redactedDetail);

      expect(detail).not.toContain("raw-session-id");
      expect(detail).not.toContain("raw-token-value");
      expect(detail).not.toContain("raw-api-token");
      expect(detail).not.toContain(password);
      expect(detail).not.toContain(userLogin);
    }
  });

  it("redacts sensitive keys inside malformed JSON-like error body strings", async () => {
    const config = buildDefaultOtrsConnectorConfig("otrs_ce_6");
    const malformedSensitiveBody = [
      '{\\"SessionID\\":\\"raw-session-id\\"',
      ',\\"UserLogin\\":\\"raw-user-login\\"',
      ',\\"Password\\":\\"raw-password-value\\"',
      ',\\"token\\":\\"raw-token-value\\"',
      ',\\"bearerToken\\":\\"raw-bearer-token\\"',
      ',\\"accessToken\\":\\"raw-access-token\\"',
      ',\\"apiToken\\":\\"raw-api-token\\"',
      ',\\"clientSecret\\":\\"raw-client-secret\\"',
      ',\\"authorization\\":\\"Bearer raw-auth-token\\"',
      ',\\"Secret\\":\\"raw-secret-value\\"',
      ',\\"caBundle\\":\\"raw-ca-material\\"'
    ].join("");
    const httpErrorClient = createOtrsHttpClient({
      config,
      baseUrl,
      userLogin,
      password,
      transport: async () => ({
        statusCode: 500,
        body: malformedSensitiveBody
      })
    });
    const invalidJsonClient = createOtrsHttpClient({
      config,
      baseUrl,
      userLogin,
      password,
      transport: async () => ({
        statusCode: 200,
        body: malformedSensitiveBody
      })
    });

    const httpError = await expectConnectorError(() =>
      httpErrorClient.requestJson(
        buildTicketSearchRequest({ config, baseUrl, userLogin, password, filters: { Queue: "Raw" } })
      )
    );
    const invalidJsonError = await expectConnectorError(() =>
      invalidJsonClient.requestJson(
        buildTicketSearchRequest({ config, baseUrl, userLogin, password, filters: { Queue: "Raw" } })
      )
    );

    expect(httpError.code).toBe("ticket_search_failed");
    expect(invalidJsonError.code).toBe("invalid_json");

    for (const error of [httpError, invalidJsonError]) {
      const detail = JSON.stringify(error.redactedDetail);

      expect(detail).not.toContain("raw-session-id");
      expect(detail).not.toContain("raw-user-login");
      expect(detail).not.toContain("raw-password-value");
      expect(detail).not.toContain("raw-token-value");
      expect(detail).not.toContain("raw-bearer-token");
      expect(detail).not.toContain("raw-access-token");
      expect(detail).not.toContain("raw-api-token");
      expect(detail).not.toContain("raw-client-secret");
      expect(detail).not.toContain("raw-auth-token");
      expect(detail).not.toContain("raw-secret-value");
      expect(detail).not.toContain("raw-ca-material");
    }
  });

  it("redacts query-style auth fragments with whitespace inside values", async () => {
    const config = buildDefaultOtrsConnectorConfig("otrs_ce_6");
    const client = createOtrsHttpClient({
      config,
      baseUrl,
      userLogin,
      password,
      transport: async () => ({
        statusCode: 500,
        body: [
          "https://support.example.com/otrs?Authorization=Bearer raw-auth-token&Queue=Raw",
          "Password=raw password#done"
        ].join("\n")
      })
    });

    const error = await expectConnectorError(() =>
      client.requestJson(buildTicketSearchRequest({ config, baseUrl, userLogin, password, filters: { Queue: "Raw" } }))
    );
    const detail = JSON.stringify(error.redactedDetail);

    expect(error.code).toBe("ticket_search_failed");
    expect(detail).not.toContain("raw-auth-token");
    expect(detail).not.toContain("raw password");
  });

  it("maps operation HTTP failures to operation-specific codes", async () => {
    const config = buildDefaultOtrsConnectorConfig("otrs_ce_6");
    const client = createOtrsHttpClient({
      config,
      baseUrl,
      userLogin,
      password,
      transport: async () => ({
        statusCode: 500,
        body: JSON.stringify({ Error: "OTRS failed" })
      })
    });

    const searchError = await expectConnectorError(() =>
      client.requestJson(buildTicketSearchRequest({ config, baseUrl, userLogin, password, filters: { Queue: "Raw" } }))
    );
    const getError = await expectConnectorError(() =>
      client.requestJson(buildTicketGetRequest({ config, baseUrl, userLogin, password, ticketId: "42" }))
    );

    expect(searchError.code).toBe("ticket_search_failed");
    expect(getError.code).toBe("ticket_get_failed");
  });

  it("maps network TLS failures to tls_failed with CA remediation and redacts CA details", async () => {
    const caBundle = "-----BEGIN CERTIFICATE-----\nsecret-ca\n-----END CERTIFICATE-----";
    const config = buildDefaultOtrsConnectorConfig("otrs_ce_6");
    const requests: OtrsTransportRequest[] = [];
    const client = createOtrsHttpClient({
      config,
      baseUrl,
      userLogin,
      password,
      caBundle,
      transport: async (request) => {
        requests.push(request);
        throw Object.assign(new Error(`self signed certificate ${caBundle}`), {
          code: "SELF_SIGNED_CERT_IN_CHAIN",
          caBundle
        });
      }
    });

    const error = await expectConnectorError(() =>
      client.requestJson(buildTicketSearchRequest({ config, baseUrl, userLogin, password, filters: { Queue: "Raw" } }))
    );

    expect(requests[0].caBundle).toBe(caBundle);
    expect(error.code).toBe("tls_failed");
    expect(error.remediationHint).toMatch(/CA/i);
    expect(JSON.stringify(error.redactedDetail)).not.toContain("secret-ca");
  });

  it("redacts colon-style auth header fragments from transport errors", async () => {
    const config = buildDefaultOtrsConnectorConfig("otrs_ce_6");
    const client = createOtrsHttpClient({
      config,
      baseUrl,
      userLogin,
      password,
      transport: async () => {
        throw new Error(
          [
            "upstream rejected request",
            "Authorization: Bearer raw-auth-token",
            "Password: raw-password-value",
            "SessionID: raw-session-value",
            "apiToken: raw-api-token",
            "caBundle: raw-ca-material"
          ].join("\n")
        );
      }
    });

    const error = await expectConnectorError(() =>
      client.requestJson(buildTicketSearchRequest({ config, baseUrl, userLogin, password, filters: { Queue: "Raw" } }))
    );
    const detail = JSON.stringify(error.redactedDetail);

    expect(error.code).toBe("webservice_unreachable");
    expect(detail).not.toContain("raw-auth-token");
    expect(detail).not.toContain("raw-password-value");
    expect(detail).not.toContain("raw-session-value");
    expect(detail).not.toContain("raw-api-token");
    expect(detail).not.toContain("raw-ca-material");
  });

  it("maps timeout, invalid JSON, and oversized responses", async () => {
    const timeoutConfig = buildDefaultOtrsConnectorConfig("otrs_ce_6");
    const timeoutClient = createOtrsHttpClient({
      config: timeoutConfig,
      baseUrl,
      userLogin,
      password,
      transport: async () => {
        throw Object.assign(new Error("request timed out"), { code: "ETIMEDOUT" });
      }
    });
    const invalidJsonClient = createOtrsHttpClient({
      config: timeoutConfig,
      baseUrl,
      userLogin,
      password,
      transport: async () => ({ statusCode: 200, body: "not json" })
    });
    const sizeConfig = parseOtrsConnectorConfig({
      product: "otrs_ce_6",
      limits: {
        maxResponseBytes: 10
      }
    });
    const oversizedClient = createOtrsHttpClient({
      config: sizeConfig,
      baseUrl,
      userLogin,
      password,
      transport: async () => ({ statusCode: 200, body: JSON.stringify({ Success: 1, TicketID: ["123"] }) })
    });

    expect(
      await expectConnectorError(() =>
        timeoutClient.requestJson(
          buildTicketSearchRequest({ config: timeoutConfig, baseUrl, userLogin, password, filters: { Queue: "Raw" } })
        )
      )
    ).toMatchObject({ code: "timeout" });
    expect(
      await expectConnectorError(() =>
        invalidJsonClient.requestJson(
          buildTicketSearchRequest({ config: timeoutConfig, baseUrl, userLogin, password, filters: { Queue: "Raw" } })
        )
      )
    ).toMatchObject({ code: "invalid_json" });
    expect(
      await expectConnectorError(() =>
        oversizedClient.requestJson(
          buildTicketSearchRequest({ config: sizeConfig, baseUrl, userLogin, password, filters: { Queue: "Raw" } })
        )
      )
    ).toMatchObject({ code: "response_too_large" });
  });

  it("uses the real Node transport for successful JSON responses", async () => {
    await withHttpServer(
      (request, response) => {
        expect(request.method).toBe("POST");
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ Success: 1, TicketID: ["42"] }));
      },
      async ({ baseUrl: localBaseUrl }) => {
        const config = buildDefaultOtrsConnectorConfig("otrs_ce_6");
        const client = createOtrsHttpClient({
          config,
          baseUrl: localBaseUrl,
          userLogin,
          password
        });

        await expect(
          client.requestJson(
            buildTicketSearchRequest({
              config,
              baseUrl: localBaseUrl,
              userLogin,
              password,
              filters: {
                Queue: "Raw"
              }
            })
          )
        ).resolves.toEqual({ Success: 1, TicketID: ["42"] });
      }
    );
  });

  it("maps oversized streaming responses from the real Node transport", async () => {
    await withHttpServer(
      (_request, response) => {
        response.writeHead(200, { "content-type": "application/json" });
        response.write('{"payload":"');
        response.write("x".repeat(128));
        response.end('"}');
      },
      async ({ baseUrl: localBaseUrl }) => {
        const config = parseOtrsConnectorConfig({
          product: "otrs_ce_6",
          limits: {
            maxResponseBytes: 32
          }
        });
        const client = createOtrsHttpClient({
          config,
          baseUrl: localBaseUrl,
          userLogin,
          password
        });

        await expect(
          expectConnectorError(() =>
            withTestTimeout(
              client.requestJson(
                buildTicketSearchRequest({
                  config,
                  baseUrl: localBaseUrl,
                  userLogin,
                  password,
                  filters: {
                    Queue: "Raw"
                  }
                })
              )
            )
          )
        ).resolves.toMatchObject({ code: "response_too_large" });
      }
    );
  });

  it("maps premature response close from the real Node transport without hanging", async () => {
    await withHttpServer(
      (_request, response) => {
        response.writeHead(200, { "content-type": "application/json" });
        response.write('{"Success":');
        response.destroy();
      },
      async ({ baseUrl: localBaseUrl }) => {
        const config = parseOtrsConnectorConfig({
          product: "otrs_ce_6",
          limits: {
            requestTimeoutMs: 1000
          }
        });
        const client = createOtrsHttpClient({
          config,
          baseUrl: localBaseUrl,
          userLogin,
          password
        });

        const error = await expectConnectorError(() =>
          withTestTimeout(
            client.requestJson(
              buildTicketSearchRequest({
                config,
                baseUrl: localBaseUrl,
                userLogin,
                password,
                filters: {
                  Queue: "Raw"
                }
              })
            )
          )
        );

        expect(["webservice_unreachable", "timeout"]).toContain(error.code);
      }
    );
  });

  it("parses TicketSearch response identifiers as strings", () => {
    expect(parseTicketSearchResponse({ TicketID: [42, "43"], TicketNumber: ["202605070001"] })).toEqual(["42", "43"]);
  });
});
