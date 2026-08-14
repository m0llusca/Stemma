import type { DemoCalendar } from "./demo-calendar";
import type {
  OperationalConversationSeed
} from "./demo-operational-seeds";
import type {
  DemoAnalyticalScenario,
  DemoEvidenceFactor,
  DemoSavedReportViewSeed,
  ReviewedConversationSeed
} from "./demo-review-seeds";
import {
  buildDemoSavedReportViews,
  demoAnalyticalExpectations,
  demoReanswerReviewIds
} from "./demo-review-seeds";

const dayMs = 24 * 60 * 60 * 1000;

const requiredQueueStatuses = [
  "QUEUED",
  "ASSIGNED",
  "IN_PROGRESS",
  "REOPENED"
] as const;
const requiredRiskLevels = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

const requiredStatusPlan = {
  trainingAssignmentStatuses: ["open", "in_progress", "done"],
  calibrationSessionStatuses: ["draft", "active", "completed", "archived"],
  integrationStatuses: ["active", "ready", "queued", "paused", "error"],
  integrationRunStatuses: [
    "dry_run_ok",
    "imported",
    "queued",
    "dry_run_queued",
    "retry_scheduled",
    "failed"
  ],
  backendJobStatuses: [
    "QUEUED",
    "RUNNING",
    "SUCCEEDED",
    "FAILED",
    "CANCELLED"
  ],
  reportSnapshotStatuses: ["QUEUED", "READY", "FAILED"]
} as const;

export type DemoOperationalStatusPlanInput = {
  readonly trainingAssignmentStatuses: readonly string[];
  readonly calibrationSessionStatuses: readonly string[];
  readonly integrationStatuses: readonly string[];
  readonly integrationRunStatuses: readonly string[];
  readonly backendJobStatuses: readonly string[];
  readonly reportSnapshotStatuses: readonly string[];
};

export type DemoScenarioInput = {
  calendar: DemoCalendar;
  reviewedSeeds: readonly ReviewedConversationSeed[];
  analyticalScenario?: DemoAnalyticalScenario;
  operationalSeeds: readonly OperationalConversationSeed[];
  statusPlan: DemoOperationalStatusPlanInput;
};

export class DemoSeedInvariantError extends Error {
  constructor(
    readonly scenarioId: string,
    readonly invariant: string
  ) {
    super(`Demo seed ${scenarioId}: ${invariant}`);
    this.name = "DemoSeedInvariantError";
  }
}

function fail(scenarioId: string, invariant: string): never {
  throw new DemoSeedInvariantError(scenarioId, invariant);
}

function timestamp(value: Date, scenarioId: string, field: string) {
  const result = value.getTime();

  if (!Number.isFinite(result)) {
    fail(scenarioId, `${field} must be a valid Date`);
  }

  return result;
}

function isInPeriod(value: Date, period: DemoCalendar["currentVkPeriod"]) {
  const valueTime = value.getTime();

  return valueTime >= period.start.getTime() && valueTime <= period.end.getTime();
}

function requireReviewCoverage(
  seeds: readonly ReviewedConversationSeed[],
  calendar: DemoCalendar
) {
  if (!seeds.some((seed) => isInPeriod(seed.finalizedAt, calendar.currentVkPeriod))) {
    fail(
      "review-coverage",
      "current 22-21 report period must contain a finalized review"
    );
  }

  if (!seeds.some((seed) => isInPeriod(seed.finalizedAt, calendar.previousVkPeriod))) {
    fail(
      "review-coverage",
      "previous 22-21 report period must contain a finalized review"
    );
  }

  if (
    !seeds.some(
      (seed) =>
        seed.finalizedAt >= calendar.rollingSevenDaysStart &&
        seed.finalizedAt <= calendar.now
    )
  ) {
    fail(
      "review-coverage",
      "current rolling seven-day window must contain a finalized review"
    );
  }

  if (
    !seeds.some(
      (seed) =>
        seed.finalizedAt >= calendar.previousSevenDaysStart &&
        seed.finalizedAt < calendar.rollingSevenDaysStart
    )
  ) {
    fail(
      "review-coverage",
      "previous rolling seven-day window must contain a finalized review"
    );
  }
}

function requireAllValues(
  scenarioId: string,
  field: string,
  actual: Iterable<string>,
  required: readonly string[]
) {
  const actualValues = new Set(actual);
  const missing = required.filter((value) => !actualValues.has(value));

  if (missing.length > 0) {
    fail(scenarioId, `${field} coverage is missing: ${missing.join(", ")}`);
  }
}

function requireMinimumDistinct(
  seeds: readonly ReviewedConversationSeed[],
  field: "externalSource" | "assigneeName" | "teamName" | "category",
  label: string,
  minimum: number
) {
  const count = new Set(seeds.map((seed) => seed[field])).size;

  if (count < minimum) {
    fail(
      "review-coverage",
      `minimum ${label} coverage is ${minimum}; received ${count}`
    );
  }
}

export function validateDemoReviewSeeds(
  seeds: readonly ReviewedConversationSeed[],
  calendar: DemoCalendar
): void {
  const nowTime = timestamp(calendar.now, "demo-calendar", "now");

  for (const seed of seeds) {
    const scenarioId = seed.externalId;
    const openedAt = timestamp(seed.openedAt, scenarioId, "openedAt");
    const closedAt = timestamp(seed.closedAt, scenarioId, "closedAt");
    const finalizedAt = timestamp(seed.finalizedAt, scenarioId, "finalizedAt");

    if (finalizedAt > nowTime) {
      fail(
        scenarioId,
        `externalId=${seed.externalId} finalizedAt must not be in the future`
      );
    }

    if (!(openedAt <= closedAt && closedAt <= finalizedAt)) {
      fail(
        scenarioId,
        `externalId=${seed.externalId} must satisfy openedAt <= closedAt <= finalizedAt`
      );
    }
  }

  requireReviewCoverage(seeds, calendar);
  requireAllValues(
    "risk-coverage",
    "riskLevel",
    seeds.map((seed) => seed.riskLevel),
    requiredRiskLevels
  );
  requireMinimumDistinct(seeds, "externalSource", "sources", 6);
  requireMinimumDistinct(seeds, "assigneeName", "agents", 4);
  requireMinimumDistinct(seeds, "teamName", "teams", 3);
  requireMinimumDistinct(seeds, "category", "categories", 8);
}

function averageScore(seeds: readonly ReviewedConversationSeed[]) {
  return seeds.reduce((total, seed) => total + seed.totalScore, 0) / seeds.length;
}

function sourceWindow(
  scenario: DemoAnalyticalScenario,
  source: string,
  window: "previous" | "current"
) {
  return scenario.reviews.filter(
    (review) => review.externalSource === source && review.window === window
  );
}

function requireExact(
  scenarioId: string,
  label: string,
  actual: number,
  expected: number
) {
  if (actual !== expected) {
    fail(scenarioId, `${label} must equal ${expected}; received ${actual}`);
  }
}

export function validateDemoAnalyticalScenario(
  scenario: DemoAnalyticalScenario,
  calendar: DemoCalendar
): void {
  validateDemoReviewSeeds(scenario.reviews, calendar);

  requireExact(
    "analytical-review-cap",
    "HUMAN/FINALIZED manifest rows",
    scenario.reviews.length,
    demoAnalyticalExpectations.reviewCount
  );
  requireExact(
    "analytical-review-cap",
    "previous rolling-35 rows",
    scenario.reviews.filter((review) => review.window === "previous").length,
    demoAnalyticalExpectations.windowReviewCount
  );
  requireExact(
    "analytical-review-cap",
    "current rolling-35 rows",
    scenario.reviews.filter((review) => review.window === "current").length,
    demoAnalyticalExpectations.windowReviewCount
  );
  requireExact(
    "analytical-review-identities",
    "unique review IDs",
    new Set(scenario.reviews.map((review) => review.reviewId)).size,
    demoAnalyticalExpectations.reviewCount
  );
  requireExact(
    "analytical-review-identities",
    "unique conversation IDs",
    new Set(scenario.reviews.map((review) => review.conversationId)).size,
    demoAnalyticalExpectations.reviewCount
  );
  requireExact(
    "analytical-breadth",
    "operators",
    new Set(scenario.reviews.map((review) => review.operatorId)).size,
    demoAnalyticalExpectations.operatorCount
  );
  requireExact(
    "analytical-breadth",
    "teams",
    new Set(scenario.reviews.map((review) => review.teamSlug)).size,
    demoAnalyticalExpectations.teamCount
  );
  requireExact(
    "analytical-breadth",
    "sources",
    new Set(scenario.reviews.map((review) => review.externalSource)).size,
    demoAnalyticalExpectations.sourceCount
  );
  requireExact(
    "analytical-breadth",
    "criteria",
    scenario.criteria.length,
    demoAnalyticalExpectations.criterionCount
  );
  requireExact(
    "analytical-breadth",
    "criterion blocks",
    new Set(scenario.criteria.map((criterion) => criterion.blockKey)).size,
    demoAnalyticalExpectations.criterionBlockCount
  );

  const criterionIds = new Set(scenario.criteria.map((criterion) => criterion.id));
  for (const review of scenario.reviews) {
    if (
      review.criterionValues.length !== demoAnalyticalExpectations.criterionCount ||
      new Set(review.criterionValues.map((score) => score.criterionId)).size !==
        demoAnalyticalExpectations.criterionCount ||
      review.criterionValues.some((score) => !criterionIds.has(score.criterionId))
    ) {
      fail(
        "criterion-denominator",
        `review ${review.reviewId} must resolve all ${demoAnalyticalExpectations.criterionCount} criteria exactly once`
      );
    }
  }

  const freshdeskPrevious = sourceWindow(scenario, "freshdesk", "previous");
  const freshdeskCurrent = sourceWindow(scenario, "freshdesk", "current");
  if (
    freshdeskPrevious.length < 6 ||
    freshdeskCurrent.length < 6 ||
    averageScore(freshdeskCurrent) - averageScore(freshdeskPrevious) > -8
  ) {
    fail(
      "freshdesk-processes",
      "Freshdesk must have n>=6 in both windows and decline by at least 8 points"
    );
  }

  const processCriterionIds = new Set(
    scenario.criteria
      .filter((criterion) => criterion.blockKey === "processes")
      .map((criterion) => criterion.id)
  );
  if (
    freshdeskPrevious.some(
      (review) =>
        review.criterionValues.filter((score) => processCriterionIds.has(score.criterionId)).length !== 4
    ) ||
    freshdeskCurrent.some(
      (review) =>
        review.criterionValues.filter((score) => processCriterionIds.has(score.criterionId)).length !== 4
    )
  ) {
    fail("freshdesk-processes", "Freshdesk must resolve all four Processes criteria");
  }

  const zendeskPrevious = sourceWindow(scenario, "zendesk", "previous");
  const zendeskCurrent = sourceWindow(scenario, "zendesk", "current");
  if (
    zendeskPrevious.length < 6 ||
    zendeskCurrent.length < 6 ||
    averageScore(zendeskCurrent) - averageScore(zendeskPrevious) < 5
  ) {
    fail(
      "zendesk-improvement",
      "Zendesk must have n>=6 in both windows and improve by at least 5 points"
    );
  }

  const appeals = scenario.reviews.filter((review) => review.appealStatus !== "none");
  const appealsByTeam = new Map<string, number>();
  for (const review of appeals) {
    appealsByTeam.set(review.teamSlug, (appealsByTeam.get(review.teamSlug) ?? 0) + 1);
  }
  const concentratedAppeals = Math.max(0, ...appealsByTeam.values());
  if (concentratedAppeals < 4 || concentratedAppeals / appeals.length < 0.6) {
    fail(
      "appeal-concentration",
      "one named team must own at least four and 60% of appeals"
    );
  }

  const sources = [...new Set(scenario.reviews.map((review) => review.externalSource))];
  const lowSampleSources = sources.filter(
    (source) =>
      sourceWindow(scenario, source, "previous").length < 5 ||
      sourceWindow(scenario, source, "current").length < 5
  );
  if (
    lowSampleSources.length !== 1 ||
    lowSampleSources[0] !== "custom_api"
  ) {
    fail(
      "low-sample-source",
      "custom_api must be the only source below five samples per window"
    );
  }

  requireExact(
    "ai-score-drafts",
    "score drafts",
    scenario.aiDrafts.length,
    demoAnalyticalExpectations.aiDraftCount
  );
  const reviewIds = new Set(scenario.reviews.map((review) => review.reviewId));
  for (const draft of scenario.aiDrafts) {
    if (
      !reviewIds.has(draft.reviewId) ||
      draft.criteria.length !== demoAnalyticalExpectations.criterionCount ||
      draft.criteria.some(
        (criterion) =>
          !criterionIds.has(criterion.criterionId) ||
          !criterion.rationale ||
          criterion.evidenceRef !== draft.evidenceMessageId
      )
    ) {
      fail(
        "ai-score-drafts",
        `draft ${draft.id} must resolve a review, ${demoAnalyticalExpectations.criterionCount} criteria, rationale and evidence`
      );
    }
  }
  const sortedAiDrafts = [...scenario.aiDrafts].sort(
    (left, right) => left.createdAt.getTime() - right.createdAt.getTime()
  );
  const weeklyDrafts = Array.from({ length: 4 }, (_, index) =>
    sortedAiDrafts.slice(index * 3, index * 3 + 3)
  );
  const computedWeeklyAi = weeklyDrafts.map((drafts) => ({
    confidence:
      Math.round(
        (drafts.reduce((total, draft) => total + draft.confidence, 0) /
          drafts.length) *
          1000
      ) / 1000,
    fallbackShare:
      Math.round(
        (drafts.filter((draft) => draft.modelVersion === "deterministic-v1")
          .length /
          drafts.length) *
          1000
      ) / 1000
  }));
  const computedConfidenceDrops = computedWeeklyAi.slice(1).filter(
    (week, index) =>
      computedWeeklyAi[index].confidence - week.confidence >= 0.15
  ).length;
  const computedFallbackSpikes = computedWeeklyAi.slice(1).filter(
    (week, index) =>
      week.fallbackShare - computedWeeklyAi[index].fallbackShare >= 0.25
  ).length;
  requireExact(
    "ai-confidence-drop",
    "confidence regressions",
    computedConfidenceDrops,
    1
  );
  requireExact(
    "ai-fallback-spike",
    "fallback spikes",
    computedFallbackSpikes,
    1
  );
  if (
    scenario.aiStory.confidenceDrops !== computedConfidenceDrops ||
    scenario.aiStory.fallbackSpikes !== computedFallbackSpikes ||
    JSON.stringify(scenario.aiStory.weekly) !== JSON.stringify(computedWeeklyAi)
  ) {
    fail(
      "ai-story-summary",
      "AI story summary must be derived from the persisted score-draft plan"
    );
  }

  const currentActualByOperator = new Map<string, number>();
  for (const review of scenario.reviews.filter((item) => item.window === "current")) {
    currentActualByOperator.set(
      review.operatorId,
      (currentActualByOperator.get(review.operatorId) ?? 0) + 1
    );
  }
  const quotaRows = scenario.quotas.map((quota) => ({
    ...quota,
    actual: currentActualByOperator.get(quota.operatorId) ?? 0
  }));
  if (
    !quotaRows.some((quota) => quota.actual >= 10 && quota.actual >= quota.plannedCount) ||
    !quotaRows.some((quota) => quota.actual >= 10 && quota.actual < quota.plannedCount)
  ) {
    fail(
      "quota-pair",
      "one operator must be at/above plan and one below plan with actual>=10"
    );
  }

  const highPlusReviews = scenario.reviews.filter(
    (review) => review.riskLevel === "HIGH" || review.riskLevel === "CRITICAL"
  );
  if (
    highPlusReviews.some(
      (review) =>
        !review.coachingActionId ||
        !review.coachingDueAt
    ) ||
    !highPlusReviews.some(
      (review) =>
        review.coachingDueAt !== null &&
        review.coachingDueAt < calendar.now
    ) ||
    !highPlusReviews.some(
      (review) =>
        review.coachingDueAt !== null &&
        review.coachingDueAt > calendar.now
    )
  ) {
    fail(
      "coaching-states",
      "every HIGH/CRITICAL review needs an open action, including overdue and non-overdue examples"
    );
  }

  const currentReviews = scenario.reviews.filter(
    (review) => review.window === "current"
  );
  const acknowledgedReviewIds = currentReviews
    .filter(
      (review) =>
        review.feedbackStatus === "acknowledged" &&
        review.feedbackAckAt !== null
    )
    .map((review) => review.reviewId);
  const pendingFeedbackReviewIds = currentReviews
    .filter((review) => review.feedbackStatus === "feedback_sent")
    .map((review) => review.reviewId);
  if (
    acknowledgedReviewIds.length !== 4 ||
    pendingFeedbackReviewIds.length !== 4
  ) {
    fail(
      "feedback-states",
      "current window must contain four acknowledged and four pending feedback rows"
    );
  }

  const reanswerReviewIds = currentReviews
    .filter(
      (review) =>
        review.needsReanswer && review.reanswerStatus !== "not_needed"
    )
    .map((review) => review.reviewId);
  if (
    JSON.stringify(reanswerReviewIds) !==
    JSON.stringify(demoReanswerReviewIds)
  ) {
    fail(
      "reanswer-states",
      "current reanswers must resolve the four stable scenario reviews"
    );
  }

  for (const [factor, factorReviewIds] of Object.entries(scenario.evidence) as Array<
    [DemoEvidenceFactor, string[]]
  >) {
    if (
      factorReviewIds.length < 5 ||
      new Set(factorReviewIds).size < 5 ||
      factorReviewIds.some((reviewId) => !reviewIds.has(reviewId))
    ) {
      fail(
        `evidence.${factor}`,
        `${factor} must resolve five unique review IDs inside the demo workspace`
      );
    }
  }

  const expectedSavedViews = buildDemoSavedReportViews(calendar);
  for (const expected of expectedSavedViews) {
    const actual = scenario.savedViews.find((view) => view.id === expected.id);
    const scenarioId = expected.id.replace("demo-saved-report-", "");
    if (!actual) {
      fail(
        `saved-view.${scenarioId}`,
        `${expected.name} must use the canonical serialized report href; ${expected.id} is missing from the scenario`
      );
    }
    const differingFields = (Object.keys(expected) as Array<keyof DemoSavedReportViewSeed>)
      .filter((field) => JSON.stringify(actual[field]) !== JSON.stringify(expected[field]))
      .map(
        (field) =>
          `${field}: expected ${JSON.stringify(expected[field])}, received ${JSON.stringify(actual[field])}`
      );
    if (differingFields.length > 0) {
      fail(
        `saved-view.${scenarioId}`,
        `${expected.name} must use the canonical serialized report href; ${expected.id} differs (${differingFields.join("; ")})`
      );
    }
  }
  requireExact(
    "saved-views",
    "saved report views",
    scenario.savedViews.length,
    expectedSavedViews.length
  );

  const currentDistinctDays = new Set(
    scenario.reviews
      .filter((review) => review.window === "current")
      .map((review) => review.finalizedAt.toISOString().slice(0, 10))
  ).size;
  const previousDistinctDays = new Set(
    scenario.reviews
      .filter((review) => review.window === "previous")
      .map((review) => review.finalizedAt.toISOString().slice(0, 10))
  ).size;
  if (currentDistinctDays !== 7 || previousDistinctDays !== 7) {
    fail("missing-day-gaps", "each 35-day window must use exactly seven non-contiguous days");
  }

  if (!scenario.reviews.every((review) => review.sentiment === null)) {
    fail("empty-sentiment", "all analytical sentiment fields must remain null");
  }
  if (!scenario.reviews.some((review) => review.assigneeName.length > 32)) {
    fail("long-content", "one Russian operator name must exceed 32 characters");
  }
  if (!scenario.reviews.some((review) => review.subject.length > 60)) {
    fail("long-content", "one Russian subject must exceed 60 characters");
  }
}

function validateOperationalChronology(
  seed: OperationalConversationSeed,
  calendar: DemoCalendar
) {
  const scenarioId = seed.externalId;
  const openedAt = timestamp(seed.openedAt, scenarioId, "openedAt");
  timestamp(seed.reviewDueAt, scenarioId, "reviewDueAt");

  if (seed.messages.length === 0) {
    fail(
      scenarioId,
      `externalId=${seed.externalId} messages must contain at least one event`
    );
  }

  let previousMessageAt = openedAt;

  for (const [index, message] of seed.messages.entries()) {
    const sentAt = timestamp(message.sentAt, scenarioId, `messages[${index}].sentAt`);

    if (sentAt < previousMessageAt) {
      fail(
        scenarioId,
        `externalId=${seed.externalId} must keep openedAt and messages chronological`
      );
    }

    previousMessageAt = sentAt;
  }

  if (seed.closedAt === null || seed.closedAt === undefined) {
    if (seed.status !== "open" && seed.status !== "pending") {
      fail(
        scenarioId,
        `externalId=${seed.externalId} status=${seed.status} requires closedAt`
      );
    }
  } else {
    const closedAt = timestamp(seed.closedAt, scenarioId, "closedAt");

    if (openedAt > closedAt || previousMessageAt > closedAt) {
      fail(
        scenarioId,
        `externalId=${seed.externalId} must satisfy openedAt <= messages <= closedAt`
      );
    }
  }

  const previousReview = seed.previousFinalizedReview;
  if (previousReview?.finalizedAt !== undefined) {
    const finalizedAt = timestamp(
      previousReview.finalizedAt,
      scenarioId,
      "previousFinalizedReview.finalizedAt"
    );

    if (seed.closedAt === null || seed.closedAt === undefined) {
      fail(
        scenarioId,
        `externalId=${seed.externalId} previous finalized review requires closedAt`
      );
    }

    const closedAt = timestamp(seed.closedAt, scenarioId, "closedAt");
    if (closedAt > finalizedAt) {
      fail(
        scenarioId,
        `externalId=${seed.externalId} must satisfy closedAt <= previousFinalizedReview.finalizedAt`
      );
    }

    if (finalizedAt > calendar.now.getTime()) {
      fail(
        scenarioId,
        `externalId=${seed.externalId} previousFinalizedReview.finalizedAt must not be in the future`
      );
    }
  }
}

function slaBucket(dueAt: Date, calendar: DemoCalendar) {
  const dueAtTime = dueAt.getTime();
  const today = calendar.startOfToday.getTime();

  if (dueAtTime < today) return "overdue";
  if (dueAtTime < today + dayMs) return "today";
  if (dueAtTime < today + 3 * dayMs) return "soon";
  return "in-time";
}

export function validateDemoOperationalSeeds(
  seeds: readonly OperationalConversationSeed[],
  calendar: DemoCalendar
): void {
  for (const seed of seeds) {
    validateOperationalChronology(seed, calendar);
  }

  requireAllValues(
    "queue-coverage",
    "qaStatus",
    seeds.map((seed) => seed.qaStatus),
    requiredQueueStatuses
  );
  requireAllValues(
    "sla-coverage",
    "SLA bucket",
    seeds.map((seed) => slaBucket(seed.reviewDueAt, calendar)),
    ["overdue", "today", "soon", "in-time"]
  );
}

export function validateDemoOperationalStatusPlan(
  statusPlan: DemoOperationalStatusPlanInput
): void {
  for (const key of Object.keys(requiredStatusPlan) as Array<
    keyof typeof requiredStatusPlan
  >) {
    requireAllValues(
      `status-plan.${key}`,
      key,
      statusPlan[key],
      requiredStatusPlan[key]
    );
  }
}

export function validateDemoScenario({
  calendar,
  reviewedSeeds,
  analyticalScenario,
  operationalSeeds,
  statusPlan
}: DemoScenarioInput): void {
  validateDemoReviewSeeds(reviewedSeeds, calendar);
  if (analyticalScenario) {
    validateDemoAnalyticalScenario(analyticalScenario, calendar);
  }
  validateDemoOperationalSeeds(operationalSeeds, calendar);
  validateDemoOperationalStatusPlan(statusPlan);
}
