import { describe, expect, it } from "vitest";
import {
  certificationStatusLabels,
  certificationStatusTone,
  summarizeCertification
} from "@/lib/certification/status";

describe("certification status registry", () => {
  it("exposes Russian labels for certification statuses", () => {
    expect(certificationStatusLabels.live_certified).toBe("Живая сертификация пройдена");
    expect(certificationStatusLabels.waiting_for_access).toBe("Ожидает доступы");
    expect(certificationStatusLabels.not_production_ready).toBe("Не готово к промышленной эксплуатации");
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

  it("maps certification statuses to pill tones", () => {
    expect(certificationStatusTone("live_certified")).toBe("pill--ok");
    expect(certificationStatusTone("waiting_for_access")).toBe("pill--warning");
  });
});
