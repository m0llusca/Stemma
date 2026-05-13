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
      setupStatus: "available"
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
