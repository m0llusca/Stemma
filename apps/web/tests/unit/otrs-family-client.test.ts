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

  it("parses TicketSearch response identifiers as strings", () => {
    expect(parseTicketSearchResponse({ TicketID: [42, "43"], TicketNumber: ["202605070001"] })).toEqual(["42", "43"]);
  });
});
