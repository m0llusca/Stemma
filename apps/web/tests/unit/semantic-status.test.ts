import { describe, expect, it } from "vitest";
import { semanticStatusForMetric } from "@/lib/ui/semantic-status";

describe("semantic operational status", () => {
  it("marks overdue and failed values as negative", () => {
    expect(semanticStatusForMetric({ kind: "overdue_count", value: 8 })).toEqual({
      tone: "negative",
      className: "semantic-status--negative",
      label: "Требует внимания"
    });
  });

  it("marks healthy completed values as positive", () => {
    expect(semanticStatusForMetric({ kind: "completed_count", value: 63 })).toEqual({
      tone: "positive",
      className: "semantic-status--positive",
      label: "В норме"
    });
  });

  it("keeps no-data values neutral", () => {
    expect(semanticStatusForMetric({ kind: "average_score", value: null })).toEqual({
      tone: "neutral",
      className: "semantic-status--neutral",
      label: "Нет данных"
    });
  });
});
