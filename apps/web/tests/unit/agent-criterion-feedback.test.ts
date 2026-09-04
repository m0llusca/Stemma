import { describe, expect, it } from "vitest";
import {
  formatCriterionResultLabel,
  isCriterionDeduction,
  toAgentCriterionFeedbackItems,
  truncateEvidenceQuote
} from "@/lib/feedback/agent-criterion-feedback";

const baseScore = {
  id: "score-1",
  value: 2 as number | null,
  passed: null as boolean | null,
  isNotApplicable: false,
  comment: "Сначала подтвердите статус, затем предложите срок.",
  evidenceMessageId: "msg-1",
  criterion: { label: "Эмпатия", kind: "SCALE" },
  evidenceMessage: { id: "msg-1", body: "Клиент ждал ответа два дня без статуса." }
};

describe("agent criterion feedback mapping", () => {
  it("treats incomplete scale scores and failed pass/fail as deductions", () => {
    expect(isCriterionDeduction(baseScore)).toBe(true);
    expect(isCriterionDeduction({ ...baseScore, value: 3 })).toBe(false);
    expect(
      isCriterionDeduction({
        ...baseScore,
        value: null,
        passed: false,
        criterion: { label: "Критично", kind: "PASS_FAIL" }
      })
    ).toBe(true);
    expect(isCriterionDeduction({ ...baseScore, isNotApplicable: true })).toBe(false);
  });

  it("uses calm result labels without FAIL spectacle wording", () => {
    expect(formatCriterionResultLabel(baseScore)).toBe("2/3");
    expect(
      formatCriterionResultLabel({
        ...baseScore,
        value: null,
        passed: false,
        criterion: { label: "Критично", kind: "PASS_FAIL" }
      })
    ).toBe("не зачтено");
    expect(formatCriterionResultLabel({ ...baseScore, value: null })).toBe("без оценки");
  });

  it("wires quote and how-to-improve only from existing fields", () => {
    const [item] = toAgentCriterionFeedbackItems([baseScore]);
    expect(item.howToImprove).toBe("Сначала подтвердите статус, затем предложите срок.");
    expect(item.evidenceQuote).toContain("Клиент ждал ответа");
    expect(item.evidenceMessageId).toBe("msg-1");

    const [empty] = toAgentCriterionFeedbackItems([
      { ...baseScore, comment: "  ", evidenceMessage: null, evidenceMessageId: null }
    ]);
    expect(empty.howToImprove).toBeNull();
    expect(empty.evidenceQuote).toBeNull();
  });

  it("truncates long evidence quotes", () => {
    const quote = truncateEvidenceQuote("а".repeat(300), 40);
    expect(quote.endsWith("…")).toBe(true);
    expect(quote.length).toBeLessThanOrEqual(40);
  });
});
