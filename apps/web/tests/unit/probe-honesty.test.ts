import { describe, expect, it } from "vitest";
import {
  adapterOperationalProfileTitle,
  adapterOperationalStepsLabel,
  adapterProfileStep,
  certificationBadgeLabel,
  certificationEvidenceEmptyText,
  certificationEvidenceEnvGateLabel,
  certificationEvidenceRunLabel,
  diagnosticStatusLabel,
  diagnosticStatusTone,
  diagnosticStepLabel,
  diagnosticsNotLiveCertificationFooter,
  probeStepStatusView,
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
