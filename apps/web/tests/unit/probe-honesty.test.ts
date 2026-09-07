import { describe, expect, it } from "vitest";
import {
  activateWithoutProbeCopy,
  adapterOperationalProfileTitle,
  adapterOperationalStepsLabel,
  adapterProfileStep,
  certificationBadgeLabel,
  certificationEvidenceEmptyText,
  certificationEvidenceEnvGateLabel,
  certificationEvidenceRunLabel,
  channelsIaDistinction,
  channelsPageDescription,
  channelsSectionCardTitle,
  claimLiveWithoutCertCopy,
  connectPersistedNotLiveCopy,
  diagnosticStatusLabel,
  diagnosticStatusTone,
  diagnosticStepLabel,
  diagnosticsNotLiveCertificationFooter,
  probeBeforePersistCopy,
  probeBeforeSaveGate,
  probeStepStatusView,
  saveActionSuccessTone,
  saveDoesNotCertifyCopy,
  stepBadgeLabel
} from "@/lib/integrations/probe-honesty";

describe("probe honesty copy", () => {
  it("splits certification and step badge labels", () => {
    expect(certificationBadgeLabel).toBe("Сертификация");
    expect(stepBadgeLabel).toBe("Шаг");
    expect(certificationBadgeLabel).not.toBe(stepBadgeLabel);
  });

  it("titles the adapter panel as operational profile/steps, not readiness", () => {
    expect(adapterOperationalProfileTitle).toBe("Операционный профиль");
    expect(adapterOperationalStepsLabel).toBe("Операционные шаги");
    expect(adapterOperationalProfileTitle).not.toMatch(/Готовность/);
    expect(adapterOperationalStepsLabel).not.toMatch(/Готовность/);
  });

  it("marks an incomplete profile as waiting with «Нужен адрес», not «Активно»", () => {
    expect(adapterProfileStep(false)).toEqual({ state: "waiting", statusLabel: "Нужен адрес" });
    expect(adapterProfileStep(true)).toEqual({ state: "ready", statusLabel: "Готово" });
    expect(probeStepStatusView("active").label).toBe("Активно");
    expect(adapterProfileStep(false).statusLabel).not.toBe("Активно");
  });

  it("keeps operational ready informational, never production-green", () => {
    expect(probeStepStatusView("ready").tone).toBe("info");
    expect(probeStepStatusView("waiting").tone).toBe("neutral");
  });
});

describe("OTRS diagnostic labels", () => {
  it("translates statuses to Russian and uses info/neutral for a step pass", () => {
    expect(diagnosticStatusLabel("succeeded")).toBe("Пройден");
    expect(diagnosticStatusLabel("ok")).toBe("Пройден");
    expect(diagnosticStatusLabel("failed")).toBe("Ошибка");
    expect(diagnosticStatusTone("succeeded")).toBe("info");
    expect(diagnosticStatusTone("ok")).toBe("info");
    expect(diagnosticStatusTone("succeeded")).not.toBe("positive");
    expect(diagnosticStatusTone("failed")).toBe("negative");
  });

  it("translates diagnostic step keys to Russian", () => {
    expect(diagnosticStepLabel("config")).toBe("Конфигурация");
    expect(diagnosticStepLabel("auth")).toBe("Авторизация");
    expect(diagnosticStepLabel("db_dry_run")).toBe("Пробная запись");
  });

  it("states that diagnostics are not live certification", () => {
    expect(diagnosticsNotLiveCertificationFooter).toBe("Диагностика ≠ живая сертификация");
  });
});

describe("certification evidence copy", () => {
  it("uses full Russian empty copy without Evidence/run/E/envGate leftovers", () => {
    expect(certificationEvidenceEmptyText).toMatch(/свидетельств/i);
    expect(certificationEvidenceEmptyText).not.toMatch(/Evidence|envGate|\brun\b/);
    expect(certificationEvidenceRunLabel("abcdefghijklmnop")).toBe("запуск abcdefgh");
    expect(certificationEvidenceRunLabel("abcdefghijklmnop")).not.toMatch(/\brun\b/);
  });

  it("labels env gates in Russian instead of raw flag strings", () => {
    expect(
      certificationEvidenceEnvGateLabel("HELPDESK_LIVE_SMOKE=1;protected:live-smoke")
    ).toBe("Защищённый live-контур");
    expect(
      certificationEvidenceEnvGateLabel("IDENTITY_LIVE_SMOKE=1;github-environment:identity-live")
    ).toBe("Защищённый live-контур");
    expect(certificationEvidenceEnvGateLabel("VITEST_INCLUDE_LIVE=1")).toBe("Флаг окружения");
    expect(certificationEvidenceEnvGateLabel("HELPDESK_LIVE_SMOKE=1")).toBe("Флаг live-проверки");
  });
});

describe("probe-before-save gate", () => {
  it("blocks a live-ready claim without live cert", () => {
    expect(probeBeforeSaveGate("claim_live")).toEqual({
      action: "block",
      tone: "negative",
      message: claimLiveWithoutCertCopy
    });
    expect(probeBeforeSaveGate("claim_live", { probeSucceeded: true })).toMatchObject({
      action: "block",
      tone: "negative"
    });
    expect(probeBeforeSaveGate("claim_live", { liveCertified: true }).action).toBe("allow");
    expect(probeBeforeSaveGate("claim_live", { liveCertified: true }).tone).toBe("positive");
  });

  it("warns fail-closed when activate or config save implies readiness without cert", () => {
    expect(probeBeforeSaveGate("activate")).toEqual({
      action: "warn",
      tone: "warning",
      message: activateWithoutProbeCopy
    });
    expect(probeBeforeSaveGate("activate", { probeSucceeded: true }).action).toBe("warn");
    expect(probeBeforeSaveGate("activate", { probeSucceeded: true }).tone).not.toBe("positive");
    expect(probeBeforeSaveGate("config_only")).toEqual({
      action: "warn",
      tone: "warning",
      message: saveDoesNotCertifyCopy
    });
    expect(probeBeforeSaveGate("activate", { liveCertified: true }).tone).toBe("positive");
  });

  it("never paints save success green without live cert", () => {
    expect(saveActionSuccessTone(false)).toBe("warning");
    expect(saveActionSuccessTone(false)).not.toBe("positive");
    expect(saveActionSuccessTone(true)).toBe("positive");
    expect(probeBeforeSaveGate("config_only").tone).not.toBe("positive");
    expect(probeBeforePersistCopy).toMatch(/probe/i);
    expect(connectPersistedNotLiveCopy).toMatch(/не production-ready/i);
  });
});

describe("channels IA vs integrations/SSO", () => {
  it("names the page outgoing notifications, not a generic Channels/SSO surface", () => {
    expect(channelsSectionCardTitle).toBe("Исходящие уведомления");
    expect(channelsPageDescription).toMatch(/не интеграции/i);
    expect(channelsPageDescription).toMatch(/не SSO/i);
    expect(channelsIaDistinction).toMatch(/Интеграции — входящие источники/);
    expect(channelsIaDistinction).toMatch(/Доступ — SSO/);
  });
});
