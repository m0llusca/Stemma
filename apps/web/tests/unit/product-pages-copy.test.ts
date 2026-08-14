import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const dashboardPage = readFileSync(join(process.cwd(), "src/app/dashboard/page.tsx"), "utf8");
const calibrationPage = readFileSync(join(process.cwd(), "src/app/calibration/page.tsx"), "utf8");
const selfReviewPage = readFileSync(join(process.cwd(), "src/app/self-review/page.tsx"), "utf8");
const coachingPage = readFileSync(join(process.cwd(), "src/app/coaching/page.tsx"), "utf8");
const coachingViewNavLink = readFileSync(join(process.cwd(), "src/app/coaching/coaching-view-nav-link.tsx"), "utf8");

describe("dashboard page copy", () => {
  it("pluralizes the average score unit instead of a static «баллов»", () => {
    expect(dashboardPage).toContain("qualityScorePointWord(currentAverage)");
    expect(dashboardPage).not.toContain('unit={currentAverage == null ? undefined : "баллов"}');
  });

  it("uses the full «insufficient data» comparison hint", () => {
    expect(dashboardPage).toContain('"Недостаточно данных для сравнения"');
    expect(dashboardPage).not.toContain('"Недостаточно сравнения"');
  });

  it("structures the triage headline as «label: value» with the item hint as description", () => {
    expect(dashboardPage).toContain("`${primaryFocus.label}: ${primaryFocus.value}`");
    expect(dashboardPage).not.toContain("primaryFocus.hint.toLocaleLowerCase");
  });

  it("renders the triage icon from the focus item instead of a hardcoded alert", () => {
    expect(dashboardPage).toContain("PrimaryFocusIcon");
    expect(dashboardPage).not.toContain("icon={focusItems.length ? <TriangleAlert");
  });

  it("pluralizes the leaderboard review count", () => {
    expect(dashboardPage).toContain("formatReviewCount(agent.count)");
    expect(dashboardPage).not.toContain("{agent.count} проверок");
  });

  it("exposes a machine-readable dateTime on activity timestamps", () => {
    expect(dashboardPage).toContain("dateTime={event.createdAt.toISOString()}");
  });
});

describe("calibration page copy", () => {
  it("pluralizes disagreement and waiting titles for 1 / 2-4 / 5+", () => {
    expect(calibrationPage).toContain(
      'const disagreementLabel = russianPlural(selectedDisagreementCount, ["расхождение требует", "расхождения требуют", "расхождений требуют"]);'
    );
    expect(calibrationPage).toContain(
      'const waitingScoresLabel = russianPlural(selectedWaitingCount, ["оценка ещё ждёт", "оценки ещё ждут", "оценок ещё ждут"]);'
    );
    expect(calibrationPage).toContain("`${disagreementLabel} разбора`");
    expect(calibrationPage).toContain('waitingScoresLabel : "Все оценки собраны"');
    expect(calibrationPage).not.toContain('selectedDisagreementCount === 1 ? "расхождение требует"');
    expect(calibrationPage).not.toContain('selectedWaitingCount === 1 ? "оценка ещё ждёт"');
    expect(calibrationPage).not.toContain("${selectedWaitingCount} оценок ещё ждут");
  });

  it("pluralizes the disagreement next-action and reminds about participants, not scores", () => {
    expect(calibrationPage).toContain(
      '`Разберите ${russianPlural(selectedDisagreementCount, ["расхождение", "расхождения", "расхождений"])} и зафиксируйте общее правило.`'
    );
    expect(calibrationPage).toContain("дождитесь участников или напомните им");
    expect(calibrationPage).not.toContain("Дождитесь или напомните");
  });
});

describe("self-review page copy", () => {
  it("pluralizes the pending-response triage title for 1 / 2-4 / 5+", () => {
    expect(selfReviewPage).toContain(
      '`${russianPlural(pendingResponseCount, ["проверка ждёт", "проверки ждут", "проверок ждут"])} вашего ответа`'
    );
    expect(selfReviewPage).not.toContain('"проверка ждёт" : "проверок ждут"');
  });

  it("pluralizes remaining learning tasks and the review count", () => {
    expect(selfReviewPage).toContain(
      '`Осталось закрыть ${russianPlural(assignments.length, ["учебную задачу", "учебные задачи", "учебных задач"])} после разбора.`'
    );
    expect(selfReviewPage).toContain("`${formatReviewCount(myReviewScores.length)} за период`");
    expect(selfReviewPage).not.toContain("${assignments.length} учебных задач");
    expect(selfReviewPage).not.toContain("{myReviewScores.length} проверок за период");
  });
});

describe("coaching page copy", () => {
  it("keeps the overdue KPI as a hint without a fake trend delta", () => {
    expect(coachingPage).not.toContain('{ value: "в начале очереди", tone: "down" }');
    expect(coachingPage).not.toContain('{ value: "нет", tone: "neutral" }');
    expect(coachingPage).toContain('"Поднимаются в начало очереди"');
  });

  it("uses a navigation landmark with aria-current instead of tab roles for view switching", () => {
    expect(coachingPage).not.toContain('from "@/components/ui/tabs"');
    expect(coachingPage).toContain("<nav");
    expect(coachingPage).toContain("href={viewHref(option.id, { q, assigneeId, category })}");
    // The view links render through a client wrapper that arms the
    // navigation-commit fallback; the aria-current contract lives there.
    expect(coachingViewNavLink).toContain('aria-current={active ? "page" : undefined}');
  });
});
