import { describe, expect, it } from "vitest";
import { integrationRunOperationalStepState, integrationRunStatusView } from "@/lib/operational-status";

describe("integrationRunStatusView", () => {
  it("maps in-flight and warning diagnostic statuses to warning tone", () => {
    expect(integrationRunStatusView("running")).toMatchObject({
      label: "Выполняется",
      tone: "warn",
      pillClass: "pill--warn"
    });

    expect(integrationRunStatusView("warning")).toMatchObject({
      label: "Требует внимания",
      tone: "warn",
      pillClass: "pill--warn"
    });
  });
});

describe("integrationRunOperationalStepState", () => {
  it("does not mark failed preview or import runs as ready", () => {
    expect(integrationRunOperationalStepState("dry_run_ok", "active")).toBe("ready");
    expect(integrationRunOperationalStepState("succeeded", "active")).toBe("ready");
    expect(integrationRunOperationalStepState("failed", "active")).toBe("blocked");
    expect(integrationRunOperationalStepState("error", "active")).toBe("blocked");
    expect(integrationRunOperationalStepState("running", "waiting")).toBe("active");
    expect(integrationRunOperationalStepState(undefined, "waiting")).toBe("waiting");
  });
});
