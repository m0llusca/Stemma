import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { certificationDisplayTone, isLiveCertified } from "@/lib/certification/status";
import { getIntegrationCapability } from "@/lib/integrations/capabilities";
import {
  catalogReadinessTone,
  integrationConnectionTone,
  messagingChannelTone
} from "@/lib/integrations/connection-tone";

const integrationsPage = readFileSync(join(process.cwd(), "src/app/admin/integrations/page.tsx"), "utf8");
const systemPage = readFileSync(join(process.cwd(), "src/app/admin/system/page.tsx"), "utf8");
const channelsPage = readFileSync(join(process.cwd(), "src/app/admin/channels/page.tsx"), "utf8");

describe("integration connection tone", () => {
  it("does not paint ready or active as success without live cert", () => {
    expect(integrationConnectionTone("ready")).not.toBe("positive");
    expect(integrationConnectionTone("active")).not.toBe("positive");
    expect(integrationConnectionTone("ready", "ready_for_live_certification")).toBe("warning");
    expect(integrationConnectionTone("active", "ready_for_live_certification")).toBe("warning");
    expect(integrationConnectionTone("active", "stub_certified")).not.toBe("positive");
    expect(integrationConnectionTone("ready", "docs_checked")).not.toBe("positive");
    expect(integrationConnectionTone("active", "contract_certified")).not.toBe("positive");
  });

  it("uses the same green bar as the cert chip", () => {
    expect(certificationDisplayTone("live_certified")).toBe("positive");
    expect(integrationConnectionTone("ready", "live_certified")).toBe("positive");
    expect(integrationConnectionTone("active", "live_certified")).toBe("positive");
    expect(integrationConnectionTone("ready", "live_certified")).toBe(certificationDisplayTone("live_certified"));
  });

  it("keeps operational error and queue tones even when live-certified", () => {
    expect(integrationConnectionTone("error", "live_certified")).toBe("negative");
    expect(integrationConnectionTone("disabled", "live_certified")).toBe("warning");
    expect(integrationConnectionTone("queued", "live_certified")).toBe("info");
    expect(integrationConnectionTone("paused", "live_certified")).toBe("neutral");
  });
});

describe("messaging channel tone", () => {
  it("does not paint active as success without live cert", () => {
    expect(messagingChannelTone("active")).not.toBe("positive");
    expect(messagingChannelTone("active")).toBe("warning");
    expect(messagingChannelTone("active", "ready_for_live_certification")).toBe("warning");
    expect(messagingChannelTone("active", "stub_certified")).not.toBe("positive");
    expect(messagingChannelTone("draft")).toBe("neutral");
  });

  it("uses the same green bar as connection chips and the cert chip", () => {
    expect(messagingChannelTone("active", "live_certified")).toBe("positive");
    expect(messagingChannelTone("active", "live_certified")).toBe(integrationConnectionTone("active", "live_certified"));
    expect(messagingChannelTone("active", "live_certified")).toBe(certificationDisplayTone("live_certified"));
    expect(messagingChannelTone("error", "live_certified")).toBe("negative");
    expect(messagingChannelTone("disabled", "live_certified")).toBe("warning");
  });
});

describe("admin connection chip wiring", () => {
  it("does not green connection chips from ready|active alone", () => {
    expect(integrationsPage).not.toContain('if (status === "active" || status === "ready") return "positive"');
    expect(systemPage).not.toContain('if (status === "active" || status === "ready") return "positive"');
    expect(integrationsPage).toContain('import { integrationConnectionTone } from "@/lib/integrations/connection-tone"');
    expect(systemPage).toContain('import { integrationConnectionTone } from "@/lib/integrations/connection-tone"');
    expect(integrationsPage).toContain("integrationConnectionTone(");
    expect(systemPage).toContain("integrationConnectionTone(");
    expect(integrationsPage).toContain("capability.certification.summary.status");
    expect(systemPage).toContain("capability.certification.summary.status");
  });

  it("does not green channel chips from active alone", () => {
    expect(channelsPage).not.toContain('if (status === "active") return "success"');
    expect(channelsPage).not.toContain('activeActionChannels > 0 ? "success"');
    expect(channelsPage).toContain('import { messagingChannelTone } from "@/lib/integrations/connection-tone"');
    expect(channelsPage).toContain("messagingChannelTone(channelStatus)");
    expect(channelsPage).toContain('activeActionChannels > 0 ? messagingChannelTone("active")');
  });
});

describe("catalog readiness tone", () => {
  it("does not paint production_slice as success without live cert", () => {
    expect(catalogReadinessTone("production_slice")).not.toBe("positive");
    expect(catalogReadinessTone("production_slice")).toBe("warning");
    expect(catalogReadinessTone("production_slice", "ready_for_live_certification")).toBe("warning");
    expect(catalogReadinessTone("production_slice", "stub_certified")).not.toBe("positive");
    expect(catalogReadinessTone("production_slice", "docs_checked")).not.toBe("positive");
    expect(catalogReadinessTone("production_slice", "contract_certified")).not.toBe("positive");
  });

  it("uses the same green bar as connection chips and the cert chip", () => {
    expect(catalogReadinessTone("production_slice", "live_certified")).toBe("positive");
    expect(catalogReadinessTone("production_slice", "live_certified")).toBe(
      integrationConnectionTone("ready", "live_certified")
    );
    expect(catalogReadinessTone("production_slice", "live_certified")).toBe(
      certificationDisplayTone("live_certified")
    );
  });

  it("keeps adapter_ready and roadmap off the success tone even when live-certified", () => {
    expect(catalogReadinessTone("adapter_ready")).toBe("info");
    expect(catalogReadinessTone("adapter_ready", "live_certified")).toBe("info");
    expect(catalogReadinessTone("roadmap")).toBe("warning");
    expect(catalogReadinessTone("roadmap", "live_certified")).toBe("warning");
    expect(catalogReadinessTone("unknown")).toBe("neutral");
  });

  it("does not green the real OTRS catalog path without live cert", () => {
    const otrs = getIntegrationCapability("otrs");

    expect(otrs.readiness).toBe("production_slice");
    expect(otrs.certification.summary.status).not.toBe("live_certified");
    expect(isLiveCertified(otrs.certification.summary.status)).toBe(false);
    expect(catalogReadinessTone(otrs.readiness, otrs.certification.summary.status)).not.toBe("positive");
  });
});

describe("certifiedSources live-cert truth", () => {
  it("counts only live_certified toward catalog certification", () => {
    expect(isLiveCertified("live_certified")).toBe(true);
    expect(isLiveCertified("docs_checked")).toBe(false);
    expect(isLiveCertified("contract_certified")).toBe(false);
    expect(isLiveCertified("stub_certified")).toBe(false);
    expect(isLiveCertified("ready_for_live_certification")).toBe(false);
    expect(isLiveCertified(null)).toBe(false);
  });
});

describe("admin catalog chip wiring", () => {
  it("does not green catalog readiness from production_slice alone", () => {
    expect(integrationsPage).not.toContain('if (readiness === "production_slice") return "positive"');
    expect(integrationsPage).not.toContain("function readinessTone(");
    expect(integrationsPage).toContain("catalogReadinessTone(");
    expect(integrationsPage).toContain("capability.certification.summary.status");
  });

  it("does not count docs/contract/stub as certifiedSources", () => {
    expect(integrationsPage).not.toContain(
      '["live_certified", "docs_checked", "contract_certified", "stub_certified"]'
    );
    expect(integrationsPage).toContain("isLiveCertified(capability.certification.summary.status)");
  });
});
