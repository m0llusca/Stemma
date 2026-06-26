import { describe, expect, it } from "vitest";
import { integrationRunStatusView } from "@/lib/operational-status";

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
