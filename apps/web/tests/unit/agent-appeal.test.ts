import { describe, expect, it } from "vitest";
import {
  agentAppealDisabledReason,
  agentAppealNextSteps,
  agentAppealPhaseLabels,
  agentAppealTriggerLabel,
  canAgentOpenAppeal,
  toAgentAppealPhase
} from "@/lib/feedback/agent-appeal";

describe("agent appeal phases", () => {
  it("maps backend statuses to RU phases without English enums", () => {
    expect(toAgentAppealPhase("none")).toBe("none");
    expect(toAgentAppealPhase("open")).toBe("submitted");
    expect(toAgentAppealPhase("calibration")).toBe("in_review");
    expect(toAgentAppealPhase("confirmed")).toBe("resolved");
    expect(toAgentAppealPhase("corrected")).toBe("resolved");

    expect(agentAppealPhaseLabels.none).toBe("Не подана");
    expect(agentAppealPhaseLabels.submitted).toBe("Подана");
    expect(agentAppealPhaseLabels.in_review).toBe("На рассмотрении");
    expect(agentAppealPhaseLabels.resolved).toBe("Решена");
    expect(Object.values(agentAppealPhaseLabels).join(" ")).not.toMatch(/\b(none|open|submitted|resolved)\b/);
  });

  it("allows an appeal only before ack and before any appeal exists", () => {
    expect(canAgentOpenAppeal({ appealStatus: "none", feedbackStatus: "feedback_sent" })).toBe(true);
    expect(canAgentOpenAppeal({ appealStatus: "none", feedbackStatus: "acknowledged" })).toBe(false);
    expect(canAgentOpenAppeal({ appealStatus: "open", feedbackStatus: "appeal" })).toBe(false);
  });

  it("explains why the CTA is disabled", () => {
    expect(agentAppealDisabledReason({ appealStatus: "none", feedbackStatus: "feedback_sent" })).toBeNull();
    expect(agentAppealDisabledReason({ appealStatus: "open", feedbackStatus: "appeal" })).toContain("уже подана");
    expect(agentAppealDisabledReason({ appealStatus: "confirmed", feedbackStatus: "acknowledged" })).toContain("закрыта");
    expect(agentAppealDisabledReason({ appealStatus: "none", feedbackStatus: "acknowledged" })).toContain("принята");
  });

  it("uses the phase label instead of repeating «Открыть апелляцию» after submit", () => {
    expect(
      agentAppealTriggerLabel({ allowed: true, phase: "none", openLabel: "Оспорить оценку" })
    ).toBe("Оспорить оценку");
    expect(
      agentAppealTriggerLabel({ allowed: false, phase: "submitted", openLabel: "Оспорить оценку" })
    ).toBe("Подана");
    expect(
      agentAppealTriggerLabel({ allowed: false, phase: "in_review", openLabel: "Апелляция" })
    ).toBe("На рассмотрении");
  });

  it("states next steps after submit including SLA", () => {
    const dueAt = new Date("2026-09-09T12:00:00.000Z");
    expect(agentAppealNextSteps({ phase: "submitted", dueAt })).toContain("рассмотрит");
    expect(agentAppealNextSteps({ phase: "submitted", dueAt })).toContain("Статус сотрудника не меняется");
    expect(agentAppealNextSteps({ phase: "in_review" })).toContain("на рассмотрении");
    expect(agentAppealNextSteps({ phase: "resolved" })).toContain("зафиксировано");
  });
});
