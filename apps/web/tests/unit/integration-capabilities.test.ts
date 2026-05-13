import { describe, expect, it } from "vitest";
import { getIntegrationCapability, listIntegrationCapabilities } from "@/lib/integrations/capabilities";
import {
  buildIntegrationSyncState,
  integrationRunCursorPayload,
  parseIntegrationSyncState,
  serializeIntegrationSyncState
} from "@/lib/integrations/sync-state";

describe("integration capabilities and sync state", () => {
  it("exposes roadmap connector capabilities without secrets", () => {
    const capabilities = listIntegrationCapabilities();

    expect(getIntegrationCapability("zendesk")).toMatchObject({
      source: "zendesk",
      type: "native_helpdesk",
      supportsCursor: true,
      supportsInboundWebhooks: true,
      supportsOutboundWebhooks: false,
      supportedEvents: ["conversation.upsert"],
      setupStatus: "preview",
      readiness: "adapter_ready"
    });
    expect(getIntegrationCapability("servicenow")).toMatchObject({
      type: "enterprise",
      readiness: "roadmap"
    });
    expect(getIntegrationCapability("otrs").certification.summary).toEqual({
      status: "ready_for_live_certification",
      label: "Готово к живой сертификации",
      productionReady: false
    });
    expect(getIntegrationCapability("custom_api").certification.summary).toEqual({
      status: "live_certified",
      label: "Живая сертификация пройдена",
      productionReady: true
    });
    expect(getIntegrationCapability("servicenow").certification.summary.label).toBe(
      "Не готово к промышленной эксплуатации"
    );
    expect(capabilities.map((capability) => capability.source)).toContain("generic_webhook");
    expect(getIntegrationCapability("generic_webhook")).toMatchObject({
      authModes: ["hmac_sha256"],
      requiredSecrets: ["webhook_secret"],
      setupStatus: "available",
      readiness: "adapter_ready"
    });
  });

  it("keeps unknown native helpdesk fallbacks uncertified and isolated from Zendesk metadata", () => {
    const zendesk = getIntegrationCapability("zendesk");
    const fallback = getIntegrationCapability("unknown_vendor", "native_helpdesk");

    expect(fallback).toMatchObject({
      source: "unknown_vendor",
      displayName: "unknown_vendor",
      type: "native_helpdesk",
      docsHref: "/api/v1/openapi",
      setupStatus: "planned",
      readiness: "roadmap"
    });
    expect(fallback.docsHref).not.toBe(zendesk.docsHref);
    expect(fallback.certification.summary).toEqual({
      status: "not_production_ready",
      label: "Не готово к промышленной эксплуатации",
      productionReady: false
    });
    expect(fallback.certification.docs).not.toBe(zendesk.certification.docs);
    expect(fallback.certification.limitations).not.toBe(zendesk.certification.limitations);
    expect(fallback.certification.docs.map((doc) => doc.label).join(" ")).not.toContain("Zendesk");
    expect(fallback.certification.limitations).toContain(
      "Источник unknown_vendor использует fallback capability и требует отдельной сертификации."
    );
  });

  it("keeps OTRS-family alias fallback identity and certification conservative", () => {
    const otrs = getIntegrationCapability("otrs");
    const fallback = getIntegrationCapability("otrs_family", "otrs_family");

    expect(fallback).toMatchObject({
      source: "otrs_family",
      type: "otrs_family",
      docsHref: "/api/v1/openapi",
      setupStatus: "planned",
      readiness: "roadmap",
      supportsPaging: true,
      supportsCursor: true,
      supportsDiagnostics: true
    });
    expect(fallback.docsHref).not.toBe(otrs.docsHref);
    expect(fallback.displayName).not.toBe("OTRS CE 6");
    expect(fallback.certification.summary).toEqual({
      status: "not_production_ready",
      label: "Не готово к промышленной эксплуатации",
      productionReady: false
    });
    expect(fallback.certification.summary.status).not.toBe("live_certified");
    expect(fallback.certification.summary.status).not.toBe("ready_for_live_certification");
    expect(fallback.certification.docs).not.toBe(otrs.certification.docs);
    expect(fallback.certification.docs.map((doc) => doc.label).join(" ")).not.toContain(
      "GenericInterface TicketSearch/TicketGet"
    );
  });

  it("keeps unknown custom/default fallbacks uncertified and isolated from Custom API metadata", () => {
    const customApi = getIntegrationCapability("custom_api");
    const fallback = getIntegrationCapability("some_vendor");

    expect(fallback).toMatchObject({
      source: "some_vendor",
      displayName: "some_vendor",
      type: "custom_api",
      docsHref: "/api/v1/openapi",
      setupStatus: "planned",
      readiness: "roadmap"
    });
    expect(fallback.docsHref).not.toBe(customApi.docsHref);
    expect(fallback.certification.summary.productionReady).toBe(false);
    expect(fallback.certification.summary.status).not.toBe("live_certified");
    expect(fallback.certification.docs).not.toBe(customApi.certification.docs);
    expect(fallback.certification.limitations).not.toBe(customApi.certification.limitations);
    expect(fallback.certification.docs).toEqual([
      {
        label: "Fallback capability requires separate certification",
        href: "/api/v1/openapi",
        status: "configuration_required"
      }
    ]);
  });

  it("aligns generic webhook readiness with its live certification status", () => {
    const genericWebhook = getIntegrationCapability("generic_webhook");

    expect(genericWebhook.readiness).toBe("adapter_ready");
    expect(genericWebhook.certification.summary).toEqual({
      status: "ready_for_live_certification",
      label: "Готово к живой сертификации",
      productionReady: false
    });
  });

  it("serializes structured cursor checkpoints for integration runs", () => {
    const state = buildIntegrationSyncState({
      source: "otrs",
      mode: "otrs_family",
      cursor: "12345",
      checkedCount: 3,
      importedCount: 2,
      skippedCount: 1,
      errorCount: 0,
      checkpoint: {
        ticketIds: ["12343", "12344", "12345"]
      },
      updatedAt: new Date("2026-05-09T09:00:00.000Z")
    });

    expect(parseIntegrationSyncState(serializeIntegrationSyncState(state))).toEqual(state);
    expect(integrationRunCursorPayload(state)).toEqual({
      cursor: "12345",
      cursorKind: "external_id"
    });
  });

  it("falls back to an empty v1 state for corrupt persisted JSON", () => {
    expect(parseIntegrationSyncState("{nope")).toMatchObject({
      version: 1,
      source: "unknown",
      cursor: null,
      progress: {
        checkedCount: 0,
        importedCount: 0,
        skippedCount: 0,
        errorCount: 0
      }
    });
  });
});
