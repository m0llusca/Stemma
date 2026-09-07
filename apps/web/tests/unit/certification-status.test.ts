import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  certificationDisplayTone,
  certificationGateNameLabels,
  certificationStatusLabels,
  certificationStatusTone,
  isLiveCertified,
  summarizeCertification
} from "@/lib/certification/status";

const integrationDetailPage = readFileSync(
  join(process.cwd(), "src/app/admin/integrations/[integrationId]/page.tsx"),
  "utf8"
);

describe("certification status registry", () => {
  it("exposes Russian labels for certification statuses", () => {
    expect(certificationStatusLabels.live_certified).toBe("Живая сертификация пройдена");
    expect(certificationStatusLabels.waiting_for_access).toBe("Ожидает доступы");
    expect(certificationStatusLabels.not_production_ready).toBe("Не готово к промышленной эксплуатации");
  });

  it("uses Russian primary names for detail certification gates", () => {
    expect(certificationGateNameLabels).toEqual({
      docs: "Документация",
      contract: "Контракт",
      stub: "Заглушка",
      live: "Live / Боевая"
    });
    expect(certificationGateNameLabels.stub).not.toBe("Stub");
    expect(certificationGateNameLabels.live).not.toBe("Live");
    expect(integrationDetailPage).toContain("certificationGateNameLabels");
    expect(integrationDetailPage).not.toContain('{ label: "Stub"');
    expect(integrationDetailPage).not.toContain('{ label: "Live"');
  });

  it("summarizes gates that are ready for live certification", () => {
    expect(
      summarizeCertification({
        docs: "docs_checked",
        contract: "contract_certified",
        stub: "stub_certified",
        live: "waiting_for_access"
      })
    ).toEqual({
      status: "ready_for_live_certification",
      label: "Готово к живой сертификации",
      productionReady: false
    });
  });

  it("summarizes fully live-certified gates as production-ready", () => {
    expect(
      summarizeCertification({
        docs: "docs_checked",
        contract: "contract_certified",
        stub: "stub_certified",
        live: "live_certified"
      })
    ).toEqual({
      status: "live_certified",
      label: "Живая сертификация пройдена",
      productionReady: true
    });
  });

  it("does not mark live certification production-ready when prerequisites are incomplete", () => {
    const summary = summarizeCertification({
      docs: "waiting_for_access",
      contract: "contract_certified",
      stub: "stub_certified",
      live: "live_certified"
    });

    expect(summary.status).not.toBe("live_certified");
    expect(summary.productionReady).toBe(false);
  });

  it("keeps live blockers visible when prerequisites are certified", () => {
    expect(
      summarizeCertification({
        docs: "docs_checked",
        contract: "contract_certified",
        stub: "stub_certified",
        live: "secret_required"
      })
    ).toEqual({
      status: "secret_required",
      label: "Ожидает секрет",
      productionReady: false
    });
  });

  it("keeps waiting for access when prerequisites are incomplete", () => {
    expect(
      summarizeCertification({
        docs: "docs_checked",
        contract: "waiting_for_access",
        stub: "stub_certified",
        live: "waiting_for_access"
      })
    ).toEqual({
      status: "waiting_for_access",
      label: "Ожидает доступы",
      productionReady: false
    });
  });

  it("maps certification statuses to honesty-gated pill tones", () => {
    expect(certificationStatusTone("live_certified")).toBe("pill--ok");
    expect(certificationStatusTone("stub_certified")).toBe("pill--neutral");
    expect(certificationStatusTone("docs_checked")).toBe("pill--neutral");
    expect(certificationStatusTone("contract_certified")).toBe("pill--neutral");
    expect(certificationStatusTone("waiting_for_access")).toBe("pill--warn");
    expect(certificationStatusTone("not_production_ready")).toBe("pill--warn");
    expect(certificationStatusTone("configuration_required")).toBe("pill--warn");
    expect(certificationStatusTone("limited")).toBe("pill--warn");
  });

  it("keeps green display tone only for live certification", () => {
    expect(certificationDisplayTone("live_certified")).toBe("positive");
    expect(certificationDisplayTone("stub_certified")).toBe("info");
    expect(certificationDisplayTone("ready_for_live_certification")).toBe("warning");
    expect(isLiveCertified("live_certified")).toBe(true);
    expect(isLiveCertified("stub_certified")).toBe(false);
    expect(isLiveCertified("docs_checked")).toBe(false);
    expect(isLiveCertified("contract_certified")).toBe(false);
  });
});
