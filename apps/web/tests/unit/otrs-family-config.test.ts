import {
  buildDefaultOtrsConnectorConfig,
  buildOtrsWebServiceBaseUrl,
  parseOtrsConnectorConfig,
  redactOtrsConfigForUi
} from "@/lib/integrations/otrs-family/config";
import { otrsFamilyProfiles } from "@/lib/integrations/otrs-family/profiles";
import { describe, expect, it } from "vitest";

describe("OTRS-family connector config", () => {
  it("expands minimal OTRS CE 6 config with production defaults", () => {
    const config = parseOtrsConnectorConfig({ product: "otrs_ce_6" });

    expect(config).toEqual({
      connector: "otrs_family",
      configVersion: 1,
      product: "otrs_ce_6",
      webServiceName: "GenericTicketConnectorREST",
      basePath: "/otrs",
      routes: {
        ticketSearchPath: "/Ticket",
        ticketGetPath: "/Ticket/{TicketID}",
        ticketSearchMethod: "POST",
        ticketGetMethod: "GET"
      },
      requestMode: {
        ticketSearch: "post_json",
        ticketGet: "get_query"
      },
      articlePolicy: {
        importAllArticles: true,
        preservePrivateFlag: true
      },
      attachmentPolicy: {
        mode: "external_links_only"
      },
      limits: {
        searchLimit: 50,
        manualTicketIdLimit: 20,
        batchSize: 25,
        requestTimeoutMs: 15000,
        maxResponseBytes: 5000000
      },
      tls: {
        caBundleSecretId: null,
        caFingerprint: null
      },
      advanced: {
        routeOverridesEnabled: false
      }
    });
  });

  it("uses the current profile WebService name by default", () => {
    const config = buildDefaultOtrsConnectorConfig("otrs_ce_6");

    expect(config.webServiceName).toBe(otrsFamilyProfiles.otrs_ce_6.webServiceName);
    expect(config.webServiceName).toBe("GenericTicketConnectorREST");
  });

  it("accepts route overrides only when advanced route overrides are enabled", () => {
    expect(() =>
      parseOtrsConnectorConfig({
        product: "otrs_ce_6",
        routes: {
          ticketSearchPath: "/CustomSearch"
        }
      })
    ).toThrow(/route overrides/i);

    expect(
      parseOtrsConnectorConfig({
        product: "otrs_ce_6",
        advanced: {
          routeOverridesEnabled: true
        },
        routes: {
          ticketSearchPath: "/CustomSearch",
          ticketGetPath: "/CustomGet/{TicketID}",
          ticketSearchMethod: "GET",
          ticketGetMethod: "POST"
        }
      }).routes
    ).toEqual({
      ticketSearchPath: "/CustomSearch",
      ticketGetPath: "/CustomGet/{TicketID}",
      ticketSearchMethod: "GET",
      ticketGetMethod: "POST"
    });
  });

  it.each(["password", "Password", "sessionId", "SessionID", "token", "caBundle"])(
    "rejects secret key %s anywhere inside config JSON",
    (secretKey) => {
      expect(() =>
        parseOtrsConnectorConfig(
          JSON.stringify({
            product: "otrs_ce_6",
            nested: {
              [secretKey]: "secret-value"
            }
          })
        )
      ).toThrow(/must not contain secrets/i);
    }
  );

  it.each([
    "UserLogin=qa_api&Password=secret",
    "?SessionID=abc123",
    "/Ticket?token=abc123",
    "https://support.example.com/otrs?Password=secret"
  ])("rejects raw auth query strings inside config JSON: %s", (value) => {
    expect(() =>
      parseOtrsConnectorConfig({
        product: "otrs_ce_6",
        metadata: {
          example: value
        }
      })
    ).toThrow(/must not contain secrets/i);
  });

  it("builds the final GenericInterface WebService base URL", () => {
    expect(
      buildOtrsWebServiceBaseUrl({
        origin: "https://support.example.com",
        basePath: "/otrs",
        webServiceName: "GenericTicketConnectorREST"
      })
    ).toBe("https://support.example.com/otrs/nph-genericinterface.pl/Webservice/GenericTicketConnectorREST");
  });

  it("clamps limits to safe maximums", () => {
    const config = parseOtrsConnectorConfig({
      product: "otrs_ce_6",
      limits: {
        searchLimit: 500,
        manualTicketIdLimit: 500,
        batchSize: 500,
        maxResponseBytes: 50000000
      }
    });

    expect(config.limits).toMatchObject({
      searchLimit: 100,
      manualTicketIdLimit: 50,
      batchSize: 50,
      maxResponseBytes: 10000000
    });
  });

  it("redacts UI config fields that must never expose secret references", () => {
    const config = parseOtrsConnectorConfig({
      product: "otrs_ce_6",
      tls: {
        caBundleSecretId: "secret_123",
        caFingerprint: "AA:BB"
      }
    });

    expect(redactOtrsConfigForUi(config).tls).toEqual({
      caBundleSecretId: null,
      caFingerprint: "AA:BB"
    });
  });
});
