import { describe, expect, it } from "vitest";
import {
  AGENT_QUOTE_UNAVAILABLE,
  buildHowToFixSteps,
  criterionDeductionImpactPoints,
  formatCriterionResultLabel,
  isCriterionDeduction,
  isGenericHowToFixAdvice,
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
  criterion: { label: "Эмпатия", kind: "SCALE", weight: 30 },
  evidenceMessage: { id: "msg-1", body: "Клиент ждал ответа два дня без статуса." }
};

const passFailFail = {
  ...baseScore,
  id: "score-2",
  value: null,
  passed: false,
  comment: "Назовите компенсацию по правилам.",
  criterion: { label: "Критично", kind: "PASS_FAIL", weight: 70 }
};

describe("agent criterion feedback mapping", () => {
  it("treats incomplete scale scores and failed pass/fail as deductions", () => {
    expect(isCriterionDeduction(baseScore)).toBe(true);
    expect(isCriterionDeduction({ ...baseScore, value: 3 })).toBe(false);
    expect(isCriterionDeduction(passFailFail)).toBe(true);
    expect(isCriterionDeduction({ ...baseScore, isNotApplicable: true })).toBe(false);
  });

  it("uses calm result labels without FAIL spectacle wording", () => {
    expect(formatCriterionResultLabel(baseScore)).toBe("2/3");
    expect(formatCriterionResultLabel(passFailFail)).toBe("не зачтено");
    expect(formatCriterionResultLabel({ ...baseScore, value: null })).toBe("без оценки");
    expect(formatCriterionResultLabel(passFailFail)).not.toMatch(/FAIL|провалил/i);
  });

  it("computes honest score impact from existing weighted math", () => {
    const scores = [baseScore, passFailFail];
    // maxWeight 100; scale 2/3 loses 10; pass/fail fail loses 70
    expect(criterionDeductionImpactPoints(scores, baseScore.id)).toBe(-10);
    expect(criterionDeductionImpactPoints(scores, passFailFail.id)).toBe(-70);
  });

  it("wires quote and how-to-fix only from existing fields", () => {
    const [item] = toAgentCriterionFeedbackItems([baseScore]);
    expect(item.howToImprove).toBe("Сначала подтвердите статус, затем предложите срок.");
    expect(item.evidenceQuote).toContain("Клиент ждал ответа");
    expect(item.evidenceMessageId).toBe("msg-1");
    expect(item.hasQuote).toBe(true);
    expect(item.howToFixSteps[0]?.text).toContain("подтвердите статус");
    expect(item.impactLabel).toBe("-33 балла");

    const [empty] = toAgentCriterionFeedbackItems([
      { ...baseScore, comment: "  ", evidenceMessage: null, evidenceMessageId: null }
    ]);
    expect(empty.howToImprove).toBeNull();
    expect(empty.evidenceQuote).toBeNull();
    expect(empty.hasQuote).toBe(false);
    expect(empty.howToFixSteps.length).toBeGreaterThan(0);
    expect(empty.howToFixSteps[0]?.text).toContain("Эмпатия");
  });

  it("never invents a quote when evidence is missing", () => {
    const [item] = toAgentCriterionFeedbackItems([
      { ...baseScore, evidenceMessage: null, evidenceMessageId: null }
    ]);
    expect(item.evidenceQuote).toBeNull();
    expect(item.hasQuote).toBe(false);
    expect(AGENT_QUOTE_UNAVAILABLE).toBe("цитата недоступна");
  });

  it("replaces generic be-careful advice with concrete steps and training links", () => {
    expect(isGenericHowToFixAdvice("Будьте внимательнее")).toBe(true);

    const steps = buildHowToFixSteps(
      { ...baseScore, comment: "Будьте внимательнее." },
      {
        trainingAssignments: [{ title: "Разбор компенсаций", coachingPlanId: "plan-1" }]
      },
      true
    );

    expect(steps.some((step) => /внимательн/i.test(step.text))).toBe(false);
    expect(steps[0]?.text).toContain("Разбор компенсаций");
    expect(steps[0]?.href).toContain("/coaching?planId=plan-1");
    expect(steps.length).toBeGreaterThan(0);
    expect(steps.length).toBeLessThanOrEqual(3);
  });

  it("truncates long evidence quotes", () => {
    const quote = truncateEvidenceQuote("а".repeat(300), 40);
    expect(quote.endsWith("…")).toBe(true);
    expect(quote.length).toBeLessThanOrEqual(40);
  });
});
