import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { certificationDisplayTone, isLiveCertified } from "@/lib/certification/status";
import { getIntegrationCapability } from "@/lib/integrations/capabilities";
import {
  accessPipelineStageTone,
  adminHubAccessTone,
  adminHubAppearanceTone,
  adminHubChannelsTone,
  adminHubIntegrationsTone,
  adminHubOverviewTone,
  catalogReadinessTone,
  certificationPipelineStageTone,
  diagnosticsPipelineStageTone,
  importPipelineStageTone,
  integrationConnectionTone,
  integrationPriorityTone,
  messagingChannelTone,
  monitoringPipelineStageTone
} from "@/lib/integrations/connection-tone";

const integrationsPage = readFileSync(join(process.cwd(), "src/app/admin/integrations/page.tsx"), "utf8");
const systemPage = readFileSync(join(process.cwd(), "src/app/admin/system/page.tsx"), "utf8");
const channelsPage = readFileSync(join(process.cwd(), "src/app/admin/channels/page.tsx"), "utf8");
const adminHubPage = readFileSync(join(process.cwd(), "src/app/admin/page.tsx"), "utf8");
const messagingChannelForm = readFileSync(
  join(process.cwd(), "src/components/admin/messaging-channel-form.tsx"),
  "utf8"
);
const messagingActions = readFileSync(join(process.cwd(), "src/lib/messaging-actions.ts"), "utf8");
const integrationActions = readFileSync(join(process.cwd(), "src/lib/integration-actions.ts"), "utf8");
const connectWizard = readFileSync(
  join(process.cwd(), "src/components/integrations/connect-source-form.tsx"),
  "utf8"
);

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
    expect(integrationsPage).toContain('from "@/lib/integrations/connection-tone"');
    expect(integrationsPage).toContain("catalogReadinessTone");
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
    expect(channelsPage).toContain("Включены {activeActionChannels}");
    expect(channelsPage).not.toContain("Активны {activeActionChannels}");
    expect(channelsPage).toContain("channelsEnabledWarningTitle");
    expect(channelsPage).toContain("channelsSectionCardTitle");
    expect(channelsPage).toContain("channelsPageDescription");
    expect(channelsPage).toContain("channelsIaDistinction");
    expect(channelsPage).not.toContain("готовность каналов");
    expect(channelsPage).not.toContain("Исходящие каналы");
    expect(adminHubPage).not.toContain("активный канал");
    expect(adminHubPage).toContain("включённое уведомление");
  });
});

describe("probe-before-save action wiring", () => {
  it("gates messaging and integration saves through probeBeforeSaveGate", () => {
    expect(messagingActions).toContain("probeBeforeSaveGate");
    expect(messagingActions).toContain('status === "active" ? "activate" : "config_only"');
    expect(messagingActions).not.toContain("Канал сохранен и активирован.");
    expect(integrationActions).toContain("probeBeforeSaveGate");
    expect(integrationActions).not.toContain("Источник появился в списке подключений.");
    expect(connectWizard).toContain("probeBeforePersistCopy");
    expect(connectWizard).toContain("connectPersistedNotLiveCopy");
  });

  it("does not paint channel save success emerald without live cert", () => {
    expect(messagingChannelForm).not.toContain("text-emerald-700");
    expect(messagingChannelForm).not.toContain("text-emerald-300");
    expect(messagingChannelForm).toContain("statusToneClass");
    expect(messagingChannelForm).toContain('state.tone ?? "warning"');
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

describe("integration priority tone", () => {
  it("does not default to positive when sources exist without live-cert coverage", () => {
    expect(
      integrationPriorityTone({
        failedDiagnostics: 0,
        activeSourceCount: 3,
        activeJobCount: 0,
        certifiedCount: 0,
        integrationCount: 3
      })
    ).toBe("warning");
    expect(
      integrationPriorityTone({
        failedDiagnostics: 0,
        activeSourceCount: 3,
        activeJobCount: 0,
        certifiedCount: 2,
        integrationCount: 3
      })
    ).not.toBe("positive");
  });

  it("stays info while jobs run and negative when diagnostics failed", () => {
    expect(
      integrationPriorityTone({
        failedDiagnostics: 0,
        activeSourceCount: 2,
        activeJobCount: 1,
        certifiedCount: 2,
        integrationCount: 2
      })
    ).toBe("info");
    expect(
      integrationPriorityTone({
        failedDiagnostics: 1,
        activeSourceCount: 2,
        activeJobCount: 0,
        certifiedCount: 2,
        integrationCount: 2
      })
    ).toBe("negative");
  });

  it("is positive only after honest live-cert coverage", () => {
    expect(
      integrationPriorityTone({
        failedDiagnostics: 0,
        activeSourceCount: 2,
        activeJobCount: 0,
        certifiedCount: 2,
        integrationCount: 2
      })
    ).toBe("positive");
  });
});

describe("integration pipeline stage tones", () => {
  it("does not green Доступы when only a configured subset is credentialed", () => {
    expect(accessPipelineStageTone({ integrationCount: 3, accessReadyCount: 2 })).toBe("warn");
    expect(accessPipelineStageTone({ integrationCount: 2, accessReadyCount: 2 })).toBe("ok");
    expect(accessPipelineStageTone({ integrationCount: 0, accessReadyCount: 0 })).toBe("warn");
  });

  it("does not green Диагностика on a partial last slice without failures", () => {
    expect(
      diagnosticsPipelineStageTone({
        integrationCount: 3,
        successfulDiagnostics: 1,
        failedDiagnostics: 0
      })
    ).toBe("warn");
    expect(
      diagnosticsPipelineStageTone({
        integrationCount: 3,
        successfulDiagnostics: 3,
        failedDiagnostics: 0
      })
    ).toBe("ok");
    expect(
      diagnosticsPipelineStageTone({
        integrationCount: 3,
        successfulDiagnostics: 2,
        failedDiagnostics: 1
      })
    ).toBe("error");
    expect(
      diagnosticsPipelineStageTone({
        integrationCount: 0,
        successfulDiagnostics: 0,
        failedDiagnostics: 0
      })
    ).toBe("neutral");
  });

  it("does not green Мониторинг just because active sources exist", () => {
    expect(
      monitoringPipelineStageTone({
        activeSourceCount: 2,
        monitoredSourceCount: 0,
        activeJobCount: 0
      })
    ).toBe("warn");
    expect(
      monitoringPipelineStageTone({
        activeSourceCount: 2,
        monitoredSourceCount: 2,
        activeJobCount: 1
      })
    ).toBe("warn");
    expect(
      monitoringPipelineStageTone({
        activeSourceCount: 2,
        monitoredSourceCount: 2,
        activeJobCount: 0
      })
    ).toBe("ok");
  });

  it("greens Сертификация only for full live-cert coverage", () => {
    expect(certificationPipelineStageTone({ integrationCount: 2, certifiedCount: 0 })).toBe("warn");
    expect(certificationPipelineStageTone({ integrationCount: 2, certifiedCount: 2 })).toBe("ok");
  });

  it("greens Импорт only after a real import", () => {
    expect(importPipelineStageTone({ hasImport: false, activeSourceCount: 2 })).toBe("warn");
    expect(importPipelineStageTone({ hasImport: true, activeSourceCount: 2 })).toBe("ok");
  });
});

describe("admin hub honesty tones", () => {
  it("does not paint integrations ok from source count alone", () => {
    expect(adminHubIntegrationsTone({ integrationCount: 3, liveCertifiedCount: 0 })).toBe("warn");
    expect(adminHubIntegrationsTone({ integrationCount: 3, liveCertifiedCount: 2 })).toBe("warn");
    expect(adminHubIntegrationsTone({ integrationCount: 0, liveCertifiedCount: 0 })).toBe("neutral");
    expect(adminHubIntegrationsTone({ integrationCount: 2, liveCertifiedCount: 2 })).toBe("ok");
  });

  it("keeps access on warning until live SSO evidence exists", () => {
    expect(adminHubAccessTone({ liveSsoCount: 0, providerWarningCount: 0 })).toBe("warn");
    expect(adminHubAccessTone({ liveSsoCount: 1, providerWarningCount: 1 })).toBe("warn");
    expect(adminHubAccessTone({ liveSsoCount: 1, providerWarningCount: 0 })).toBe("ok");
  });

  it("does not paint channels ok from active count without live cert", () => {
    expect(adminHubChannelsTone(2)).toBe("warn");
    expect(adminHubChannelsTone(2, "stub_certified")).toBe("warn");
    expect(adminHubChannelsTone(2, "live_certified")).toBe("ok");
    expect(adminHubChannelsTone(0)).toBe("neutral");
  });

  it("treats appearance as a setting, not health", () => {
    expect(adminHubAppearanceTone()).toBe("neutral");
  });

  it("does not paint the hub overview success for roles that cannot open cert-health sections", () => {
    expect(adminHubOverviewTone({ hasSetupGap: false, canSeeCertHealth: false })).toBe("accent");
    expect(adminHubOverviewTone({ hasSetupGap: false, canSeeCertHealth: false })).not.toBe("success");
    expect(adminHubOverviewTone({ hasSetupGap: true, canSeeCertHealth: false })).toBe("warning");
    expect(adminHubOverviewTone({ hasSetupGap: false, canSeeCertHealth: true })).toBe("success");
  });
});

describe("admin hub and pipeline wiring", () => {
  it("does not default the integrations priority panel to positive", () => {
    expect(integrationsPage).not.toContain('tone: "positive" as const');
    expect(integrationsPage).toContain("integrationPriorityTone(");
    expect(integrationsPage).toContain("certifiedSources < integrations.length");
  });

  it("wires pipeline stages through coverage helpers instead of last-slice greens", () => {
    expect(integrationsPage).not.toContain("configuredSources > 0 && configuredSources === credentialedSources ? \"ok\"");
    expect(integrationsPage).not.toContain("diagnosticRuns.length > 0 ? \"ok\"");
    expect(integrationsPage).not.toContain("activeSources.length > 0 ? \"ok\"");
    expect(integrationsPage).toContain("accessPipelineStageTone(");
    expect(integrationsPage).toContain("diagnosticsPipelineStageTone(");
    expect(integrationsPage).toContain("monitoringPipelineStageTone(");
    expect(integrationsPage).toContain("certificationPipelineStageTone(");
  });

  it("does not green hub integrations, access, channels, or appearance without honest evidence", () => {
    expect(adminHubPage).not.toContain('tone: integrations > 0 ? "ok" : "neutral"');
    expect(adminHubPage).not.toContain('tone: providerWarnings > 0 ? "warn" : "ok"');
    expect(adminHubPage).not.toContain('tone: messagingActiveChannels > 0 ? "ok" : "neutral"');
    expect(adminHubPage).not.toContain('metric: providerWarnings > 0 ? `${providerWarnings} требуют настройки` : "Готово"');
    expect(adminHubPage).toContain("adminHubIntegrationsTone(");
    expect(adminHubPage).toContain("adminHubAccessTone(");
    expect(adminHubPage).toContain("adminHubChannelsTone(");
    expect(adminHubPage).toContain("adminHubAppearanceTone()");
    expect(adminHubPage).toContain("adminHubOverviewTone(");
    expect(adminHubPage).not.toContain("tone={primarySetupCoachmark || attentionCount > 0 ? \"warning\" : \"success\"}");
    expect(adminHubPage).toContain("isLiveCertified(");
    expect(adminHubPage).toContain("getPhaseDReadinessReport(");
    expect(adminHubPage).toContain("Нет live SSO");
  });
});
