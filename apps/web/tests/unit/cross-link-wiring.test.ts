import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("cross-link wiring between review, coaching, and calibration", () => {
  const root = process.cwd();

  it("finalize redirects carry a coaching offer for low-score / critical outcomes", () => {
    const source = readFileSync(join(root, "src/lib/review-actions.ts"), "utf8");
    expect(source).toContain("needsCoachingFollowUp");
    expect(source).toContain("appendCoachingOfferParams");
    expect(source).toContain("withSavedMarker(returnTo, \"final\", coachingOffer)");
  });

  it("review detail surfaces linked training/plans and a coaching CTA", () => {
    const source = readFileSync(join(root, "src/app/reviews/[conversationId]/page.tsx"), "utf8");
    expect(source).toContain("Связанное обучение");
    expect(source).toContain("coachingPlanCreateHref");
    expect(source).toContain("coachingPlanFocusHref");
    expect(source).toContain("originLinkedPlans");
    expect(source).toContain("offerCoachingFollowUp");
    expect(source).toContain("из этой проверки");
    expect(source).toContain("Создать задание");
    expect(source).toContain("coachingActionId");
    expect(source).toContain("createTrainingAssignmentFromReview");
  });

  it("calibration links scorecard and related reviews with return context", () => {
    const source = readFileSync(join(root, "src/app/calibration/page.tsx"), "utf8");
    expect(source).toContain('href="/admin/scorecards"');
    expect(source).toContain("Форма оценки");
    expect(source).toContain("reviewSource=CALIBRATION");
    expect(source).toContain("эталон");
  });

  it("calibration surfaces GraderQA-lite low agreement and reviewer volume", () => {
    const source = readFileSync(join(root, "src/app/calibration/page.tsx"), "utf8");
    expect(source).toContain("listLowAgreementCalibrationItems");
    expect(source).toContain("aggregateReviewerVolume");
    expect(source).toContain("Низкая согласованность");
    expect(source).toContain("Объём проверяющих");
    expect(source).toContain("Качество проверяющих");
  });

  it("reports overview wires QA × CSAT matrix drill-downs", () => {
    const source = readFileSync(join(root, "src/app/reports/page.tsx"), "utf8");
    expect(source).toContain("computeQaCsatMatrix");
    expect(source).toContain("QaCsatMatrixPanel");
    expect(source).toContain("qaScoreBand");
  });

  it("calibration lists appeal outcome signals without auto-editing scorecards", () => {
    const source = readFileSync(join(root, "src/app/calibration/page.tsx"), "utf8");
    expect(source).toContain("Сигналы по апелляциям");
    expect(source).toContain("CALIBRATION_APPEAL_SIGNAL_ACTION");
    expect(source).toContain("Критерии");
    expect(source).toContain("не меняются автоматически");
  });

  it("reviews queue exposes an AI exceptions process filter and saved view", () => {
    const filters = readFileSync(join(root, "src/components/review/queue-filters.tsx"), "utf8");
    const savedViews = readFileSync(join(root, "src/components/review/queue-saved-views.tsx"), "utf8");
    const contract = readFileSync(join(root, "src/lib/contracts/review-queue.ts"), "utf8");
    expect(contract).toContain('"ai_exception"');
    expect(filters).toContain("AI-исключения");
    expect(savedViews).toContain("/reviews?process=ai_exception");
  });

  it("self-review loads open coaching pins and finding coaching actions", () => {
    const source = readFileSync(join(root, "src/app/self-review/page.tsx"), "utf8");
    expect(source).toContain("coachingPins");
    expect(source).toContain("coachingAction: true");
    expect(source).toContain("Заметки коучинга");
  });

  it("coaching page prefills plan/task forms from review deep links", () => {
    const source = readFileSync(join(root, "src/app/coaching/page.tsx"), "utf8");
    expect(source).toContain("prefillsAgentName");
    expect(source).toContain("prefillsReviewId");
    expect(source).toContain("prefillsConversationId");
    expect(source).toContain('name="reviewId"');
    expect(source).toContain('name="conversationId"');
    expect(source).toContain("focusPlanId");
    expect(source).toContain("Исходная проверка");
    expect(source).toContain("groupCoachingThemesByAgent");
    expect(source).toContain("CoachingPlanThemeField");
  });

  it("dashboard lead surface shows reviewer open workload with queue drill-downs", () => {
    const source = readFileSync(join(root, "src/app/dashboard/page.tsx"), "utf8");
    expect(source).toContain("loadReviewerWorkload");
    expect(source).toContain("reviewerWorkloadHref");
    expect(source).toContain("Нагрузка проверяющих");
  });

  it("CoachingPlan schema stores optional origin review and conversation FKs", () => {
    const schema = readFileSync(join(root, "prisma/schema.prisma"), "utf8");
    expect(schema).toMatch(/model CoachingPlan[\s\S]*reviewId\s+String\?/);
    expect(schema).toMatch(/model CoachingPlan[\s\S]*conversationId\s+String\?/);
    expect(schema).toContain("onDelete: SetNull");
  });
});
