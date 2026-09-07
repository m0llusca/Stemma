import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const dashboardPage = readFileSync(join(process.cwd(), "src/app/dashboard/page.tsx"), "utf8");
const reviewsPage = readFileSync(join(process.cwd(), "src/app/reviews/page.tsx"), "utf8");
const calibrationPage = readFileSync(join(process.cwd(), "src/app/calibration/page.tsx"), "utf8");
const selfReviewPage = readFileSync(join(process.cwd(), "src/app/self-review/page.tsx"), "utf8");
const coachingPage = readFileSync(join(process.cwd(), "src/app/coaching/page.tsx"), "utf8");
const coachingViewNavLink = readFileSync(join(process.cwd(), "src/app/coaching/coaching-view-nav-link.tsx"), "utf8");

describe("dashboard page copy", () => {
  it("gates peer leaderboard and avg score surfaces behind canViewPeerQuality", () => {
    expect(dashboardPage).toContain("canViewPeerQuality(user.role)");
    expect(dashboardPage).toContain("canViewPeerQualityMetrics");
    expect(dashboardPage).toContain("computeAgentLeaderboard(agentReviews, 5)");
    expect(dashboardPage).not.toContain('label="Средний балл"');
    expect(dashboardPage).not.toContain("qualityScorePointWord");
    expect(dashboardPage).not.toContain("ScoreSparkline");
  });

  it("structures the triage headline as «label: value» with the item hint as description", () => {
    expect(dashboardPage).toContain("`${primaryFocus.label}: ${primaryFocus.value}`");
    expect(dashboardPage).toContain("buildOpsEmptyTriage");
    expect(dashboardPage).not.toContain("primaryFocus.hint.toLocaleLowerCase");
    expect(dashboardPage).not.toContain("Критичных отклонений нет");
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

  it("surfaces overdue SLA as the lead triage drill-down when present", () => {
    expect(dashboardPage).toContain('href: "/reviews?due=overdue"');
    expect(dashboardPage).toContain('"Просрочено SLA"');
    expect(dashboardPage).toContain("overdueReviewCount");
  });

  it("scopes lead KPIs and leaderboard rows to reviewed-queue filters", () => {
    expect(dashboardPage).toContain("reportReviewRangeHref(thisWeekStart, now)");
    expect(dashboardPage).toContain('riskLevel: "HIGH_OR_CRITICAL"');
    expect(dashboardPage).toContain("reportReviewRangeHref(thirtyDaysStart, now");
    expect(dashboardPage).toContain("appealStatus: \"open\"");
    expect(dashboardPage).toContain("reportReviewRangeHref(item.date, new Date(item.date.getTime() + dayMs - 1))");
  });

  it("tones lead/admin dashboard toward risk/SLA and hides activity ops chrome", () => {
    expect(dashboardPage).toContain('user.role === "TEAM_LEAD" || user.role === "ADMIN"');
    expect(dashboardPage).toContain("Риск и просроченный SLA за 30 секунд");
    expect(dashboardPage).not.toContain("Ops-лента и суета фильтров скрыты");
    expect(dashboardPage).toContain("Нагрузка проверяющих, обучение и фокус остаются на экране");
    expect(dashboardPage).toContain("isLeadDashboard ? null : (");
    expect(dashboardPage).toContain("EvidenceDrawer");
    expect(dashboardPage).toContain('"Высокий риск"');
    expect(dashboardPage).toContain('"Риск и апелляции"');
  });

  it("does not use #22's SUPPORT_AGENT-only peer-row hide (QA must not see ranks)", () => {
    expect(dashboardPage).toContain("canViewPeerQuality(user.role)");
    expect(dashboardPage).not.toContain("showPeerScoreRows");
    expect(dashboardPage).not.toContain('user.role !== "SUPPORT_AGENT"');
  });

  it("does not use the unreviewed impostor as empty-triage primary or KPI fallback", () => {
    expect(dashboardPage).toContain("emptyTriagePrimary");
    expect(dashboardPage).toContain("takeNextReview");
    expect(dashboardPage).toContain("opsQueueKpiHref");
    expect(dashboardPage).not.toContain("/reviews?status=unreviewed");
    expect(dashboardPage).not.toContain('?? "/reviews?status=unreviewed"');
    expect(dashboardPage).not.toContain('focusItems.length ? "Разобрать" : "Открыть очередь"');
  });

  it("surfaces reviewer assignment workload for lead/admin", () => {
    expect(dashboardPage).toContain("loadReviewerWorkload");
    expect(dashboardPage).toContain("reviewerWorkloadHref");
    expect(dashboardPage).toContain("Нагрузка проверяющих");
    expect(dashboardPage).toContain('reviewerWorkloadHref(row.name, "QUEUED")');
    expect(dashboardPage).toContain('reviewerWorkloadHref(row.name, "IN_PROGRESS")');
  });
});

describe("reviews page take-next copy", () => {
  it("uses the shared Take-next verb and wires preview through queueHref, not a peek link", () => {
    expect(reviewsPage).toContain("TAKE_NEXT_LABEL");
    expect(reviewsPage).toContain("queueHref={data.currentHref}");
    expect(reviewsPage).not.toContain("openHref=");
    expect(reviewsPage).not.toContain("Открыть приоритетный кейс");
  });

  it("names or honestly describes filters that are not the role-home reset", () => {
    expect(reviewsPage).toContain(
      "findQueueFilterTrap(data.currentHref, data.filterResetHref, data.savedViews)"
    );
    expect(reviewsPage).toContain("resetHref={data.filterResetHref}");
    expect(reviewsPage).not.toContain("foreignViewName");
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

  it("surfaces appeal calibration signals with Russian copy", () => {
    expect(calibrationPage).toContain("Сигналы по апелляциям");
    expect(calibrationPage).toContain("Пока нет сигналов");
    expect(calibrationPage).toContain("Все апелляции в очереди");
  });

  it("exposes GraderQA-lite disagreement and volume copy in Russian", () => {
    expect(calibrationPage).toContain("Низкая согласованность");
    expect(calibrationPage).toContain("Объём проверяющих");
    expect(calibrationPage).toContain("Это покрытие, не слепая переоценка");
  });
});

describe("self-review page copy", () => {
  const selfReviewHonesty = readFileSync(join(process.cwd(), "src/lib/self-review/empty-honesty.ts"), "utf8");

  it("pluralizes the pending-response triage title for 1 / 2-4 / 5+", () => {
    expect(selfReviewHonesty).toContain(
      '`${russianPlural(input.pendingInboxCount, ["проверка ждёт", "проверки ждут", "проверок ждут"])} вашего ответа`'
    );
    expect(selfReviewHonesty).not.toContain('"проверка ждёт" : "проверок ждут"');
    expect(selfReviewPage).toContain("buildSelfReviewTriage");
  });

  it("pluralizes remaining learning tasks and the review count", () => {
    expect(selfReviewHonesty).toContain(
      '`Осталось закрыть ${russianPlural(openTrainingCount, ["учебную задачу", "учебные задачи", "учебных задач"])} после разбора.`'
    );
    expect(selfReviewPage).toContain("`${formatReviewCount(myReviewScores.length)} за период");
    expect(selfReviewPage).not.toContain("${assignments.length} учебных задач");
    expect(selfReviewPage).not.toContain("{myReviewScores.length} проверок за период");
  });

  it("keeps personal feedback calm without team-rank chrome", () => {
    expect(selfReviewPage).not.toContain("ниже команды");
    expect(selfReviewPage).not.toContain("выше команды");
    expect(selfReviewPage).not.toContain("на уровне команды");
    expect(selfReviewPage).not.toContain("teamScoreAggregate");
    expect(selfReviewPage).toContain("личная динамика");
    expect(selfReviewPage).toContain("На что обратить внимание");
    expect(selfReviewPage).toContain("AgentCriterionFeedbackList");
    expect(selfReviewPage).toContain("Оспорить оценку");
    expect(selfReviewPage).toContain("canAgentOpenAppeal");
    expect(selfReviewPage).not.toContain("вы провалили");
    expect(selfReviewPage).not.toContain("лидерборд");
  });
});

describe("coaching page copy", () => {
  it("keeps the overdue KPI as a hint without a fake trend delta", () => {
    const coachingHonesty = readFileSync(join(process.cwd(), "src/lib/coaching/empty-honesty.ts"), "utf8");
    expect(coachingPage).not.toContain('{ value: "в начале очереди", tone: "down" }');
    expect(coachingPage).not.toContain('{ value: "нет", tone: "neutral" }');
    expect(coachingPage).toContain("coachingOverdueKpiHint");
    expect(coachingHonesty).toContain('"Поднимаются в начало очереди"');
  });

  it("uses a navigation landmark with aria-current instead of tab roles for view switching", () => {
    expect(coachingPage).not.toContain('from "@/components/ui/tabs"');
    expect(coachingPage).toContain("<nav");
    expect(coachingPage).toContain("href={viewHref(option.id, { q, assigneeId, category })}");
    // The view links render through a client wrapper that arms the
    // navigation-commit fallback; the aria-current contract lives there.
    expect(coachingViewNavLink).toContain('aria-current={active ? "page" : undefined}');
  });

  it("suggests coaching themes from recent failed criteria and findings", () => {
    expect(coachingPage).toContain("groupCoachingThemesByAgent");
    expect(coachingPage).toContain("CoachingPlanThemeField");
    expect(coachingPage).toContain("defaultPlanFocusArea");
  });
});
