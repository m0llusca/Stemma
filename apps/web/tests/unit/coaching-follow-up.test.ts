import { describe, expect, it } from "vitest";
import {
  appendCoachingOfferParams,
  coachingAgentFocusHref,
  coachingOfferFromSearchParams,
  coachingPlanCreateHref,
  coachingPlanFocusHref,
  COACHING_LOW_SCORE_THRESHOLD,
  needsCoachingFollowUp,
  trainingAssignmentDefaultsFromFinding
} from "@/lib/coaching-follow-up";

describe("coaching follow-up signals", () => {
  it("flags critical errors and high/critical findings", () => {
    expect(
      needsCoachingFollowUp({
        totalScore: 95,
        criticalError: true,
        findings: []
      })
    ).toBe(true);

    expect(
      needsCoachingFollowUp({
        totalScore: 95,
        criticalError: false,
        findings: [{ riskLevel: "CRITICAL" }]
      })
    ).toBe(true);

    expect(
      needsCoachingFollowUp({
        totalScore: 95,
        criticalError: false,
        findings: [{ riskLevel: "HIGH" }]
      })
    ).toBe(true);
  });

  it("flags scores below the shared low-score threshold", () => {
    expect(
      needsCoachingFollowUp({
        totalScore: COACHING_LOW_SCORE_THRESHOLD - 1,
        criticalError: false,
        findings: [{ riskLevel: "LOW" }]
      })
    ).toBe(true);

    expect(
      needsCoachingFollowUp({
        totalScore: COACHING_LOW_SCORE_THRESHOLD,
        criticalError: false,
        findings: [{ riskLevel: "MEDIUM" }]
      })
    ).toBe(false);
  });

  it("builds training defaults from finding / coaching action text", () => {
    expect(
      trainingAssignmentDefaultsFromFinding({
        category: "Эмпатия",
        coachingAction: "Разобрать тон ответа",
        evidenceSummary: "Цитата"
      })
    ).toEqual({
      title: "Разбор: Эмпатия",
      description: "Разобрать тон ответа"
    });
  });

  it("builds coaching deep links with optional review context", () => {
    expect(coachingPlanCreateHref({ agentName: "Иван" })).toBe("/coaching?plan=1&agentName=%D0%98%D0%B2%D0%B0%D0%BD");
    expect(
      coachingPlanCreateHref({
        agentName: "Иван",
        reviewId: "rev-1",
        conversationId: "conv-1"
      })
    ).toContain("reviewId=rev-1");
    expect(coachingAgentFocusHref("Иван")).toBe("/coaching?q=%D0%98%D0%B2%D0%B0%D0%BD");
    expect(coachingPlanFocusHref({ planId: "plan-1", agentName: "Иван" })).toBe(
      "/coaching?planId=plan-1&q=%D0%98%D0%B2%D0%B0%D0%BD"
    );
  });

  it("round-trips coaching offer params on redirect URLs", () => {
    const href = appendCoachingOfferParams("/reviews?saved=final", {
      agentName: "Иван",
      reviewId: "rev-1",
      conversationId: "conv-1"
    });
    const params = new URL(href, "https://example.test").searchParams;
    expect(coachingOfferFromSearchParams(params)).toEqual({
      agentName: "Иван",
      reviewId: "rev-1",
      conversationId: "conv-1"
    });
    expect(coachingOfferFromSearchParams({ saved: "final" })).toBeNull();
  });
});
