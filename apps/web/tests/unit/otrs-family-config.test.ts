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
        ticketSearchMethod: "GET",
        ticketGetMethod: "GET"
      },
      requestMode: {
        ticketSearch: "get_query",
        ticketGet: "get_query"
      },
      auth: {
        ticketSearch: "credentials",
        ticketGet: "credentials",
        sessionCreatePath: "/Session",
        sessionCreateMethod: "POST"
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
      },
      timeZone: "UTC"
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

  it("supports SessionCreate based auth per operation without storing a SessionID", () => {
    expect(
      parseOtrsConnectorConfig({
        product: "otrs_ce_6",
        auth: {
          ticketSearch: "session",
          ticketGet: "credentials",
          sessionCreatePath: "/Session"
        }
      }).auth
    ).toEqual({
      ticketSearch: "session",
      ticketGet: "credentials",
      sessionCreatePath: "/Session",
      sessionCreateMethod: "POST"
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

  it.each(["Token", "accessToken", "apiToken", "bearerToken", "clientSecret", "secret", "passwordHash", "authorization"])(
    "rejects secret-looking key %s anywhere inside config JSON",
    (secretKey) => {
      expect(() =>
        parseOtrsConnectorConfig({
          product: "otrs_ce_6",
          nested: {
            [secretKey]: "secret-value"
          }
        })
      ).toThrow(/must not contain secrets/i);
    }
  );

  it("allows safe secret references in typed config", () => {
    expect(
      parseOtrsConnectorConfig({
        product: "otrs_ce_6",
        tls: {
          caBundleSecretId: "secret_ca_bundle",
          caFingerprint: "AA:BB"
        }
      }).tls
    ).toEqual({
      caBundleSecretId: "secret_ca_bundle",
      caFingerprint: "AA:BB"
    });
  });

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

  it.each([
    "?Token=abc123",
    "?TOKEN=abc123",
    "?Authorization=Bearer%20x",
    "?authorization=Bearer%20x",
    "?userLogin=qa_api",
    "?password=secret",
    "?sessionId=abc123",
    "?bearerToken=abc123",
    "?accessToken=abc123",
    "?apiToken=abc123",
    "?clientSecret=abc123",
    "Token=abc123",
    "Authorization=Bearer%20x"
  ])("rejects raw auth query fragments inside config JSON: %s", (value) => {
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

  it("builds the WebService base URL from full app baseUrl without appending basePath", () => {
    expect(
      buildOtrsWebServiceBaseUrl({
        baseUrl: "https://support.example.com/otrs/",
        basePath: "/otrs",
        webServiceName: "GenericTicketConnectorREST"
      })
    ).toBe("https://support.example.com/otrs/nph-genericinterface.pl/Webservice/GenericTicketConnectorREST");
  });

  it("normalizes trailing slashes for origin and baseUrl contracts", () => {
    expect(
      buildOtrsWebServiceBaseUrl({
        origin: "https://support.example.com/",
        basePath: "/otrs/",
        webServiceName: "GenericTicketConnectorREST"
      })
    ).toBe("https://support.example.com/otrs/nph-genericinterface.pl/Webservice/GenericTicketConnectorREST");
    expect(
      buildOtrsWebServiceBaseUrl({
        baseUrl: "https://support.example.com/otrs/",
        webServiceName: "GenericTicketConnectorREST"
      })
    ).toBe("https://support.example.com/otrs/nph-genericinterface.pl/Webservice/GenericTicketConnectorREST");
  });

  it("derives request modes from final route methods", () => {
    expect(buildDefaultOtrsConnectorConfig("otobo").requestMode.ticketSearch).toBe("get_query");
    expect(
      parseOtrsConnectorConfig({
        product: "otrs_ce_6",
        advanced: {
          routeOverridesEnabled: true
        },
        routes: {
          ticketSearchMethod: "GET",
          ticketGetMethod: "POST"
        }
      }).requestMode
    ).toEqual({
      ticketSearch: "get_query",
      ticketGet: "post_json"
    });
  });

  it("resolves otrs_ce_6 default TicketSearch to GET /Ticket with get_query mode (regression: was POST)", () => {
    const config = buildDefaultOtrsConnectorConfig("otrs_ce_6");

    expect(config.routes.ticketSearchMethod).toBe("GET");
    expect(config.routes.ticketSearchPath).toBe("/Ticket");
    expect(config.requestMode.ticketSearch).toBe("get_query");
  });

  it("aligns OTOBO default routes to the stock GenericTicketConnectorREST.yml /Ticket mapping", () => {
    const config = buildDefaultOtrsConnectorConfig("otobo");

    expect(config.routes).toEqual({
      ticketSearchPath: "/Ticket",
      ticketGetPath: "/Ticket/{TicketID}",
      ticketSearchMethod: "GET",
      ticketGetMethod: "GET"
    });
    expect(config.requestMode).toEqual({
      ticketSearch: "get_query",
      ticketGet: "get_query"
    });
  });

  it("preserves explicit request modes over derived route method defaults", () => {
    expect(
      parseOtrsConnectorConfig({
        product: "otobo",
        requestMode: {
          ticketSearch: "post_json"
        }
      }).requestMode
    ).toEqual({
      ticketSearch: "post_json",
      ticketGet: "get_query"
    });
  });

  it("strips unknown route keys from parsed config", () => {
    expect(
      parseOtrsConnectorConfig({
        product: "otrs_ce_6",
        routes: {
          ticketSearchPath: "/Ticket",
          customRouteKey: "/Unexpected"
        }
      }).routes
    ).toEqual({
      ticketSearchPath: "/Ticket",
      ticketGetPath: "/Ticket/{TicketID}",
      ticketSearchMethod: "GET",
      ticketGetMethod: "GET"
    });
  });

  it("clamps limits to safe maximums", () => {
    const config = parseOtrsConnectorConfig({
      product: "otrs_ce_6",
      limits: {
        searchLimit: 500,
        manualTicketIdLimit: 500,
        batchSize: 500,
        requestTimeoutMs: 120000,
        maxResponseBytes: 50000000
      }
    });

    expect(config.limits).toMatchObject({
      searchLimit: 100,
      manualTicketIdLimit: 50,
      batchSize: 50,
      requestTimeoutMs: 60000,
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

describe("timeZone config", () => {
  it("defaults timeZone to UTC", () => {
    const config = parseOtrsConnectorConfig({ product: "otrs_ce_6" });
    expect(config.timeZone).toBe("UTC");
  });

  it("accepts a valid IANA timezone", () => {
    const config = parseOtrsConnectorConfig({ product: "otrs_ce_6", timeZone: "Europe/Moscow" });
    expect(config.timeZone).toBe("Europe/Moscow");
  });

  it("rejects an invalid timezone", () => {
    expect(() => parseOtrsConnectorConfig({ product: "otrs_ce_6", timeZone: "Mars/Phobos" })).toThrow();
  });
});
