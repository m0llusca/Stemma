import type { ConversationChannel, QaStatus, RiskLevel } from "@prisma/client";
import type {
  ReviewQueueFilters,
  ReviewQueueSearchParams,
  ReviewQueueStatus,
  ReviewQueueRiskFilter,
  ReviewQueueCoachingFilter,
  ReviewQueueProcessFilter,
  ReviewQueueDueFilter
} from "@/lib/contracts/review-queue";

// Shared URL parsing must stay independent of the database repository.
export const reviewQueueStatuses = ["all", "unreviewed", "reviewed"] as const;
export const qaQueueStatuses = ["all", "QUEUED", "ASSIGNED", "IN_PROGRESS", "FINALIZED", "REOPENED"] as const;
export const queueSamplingTypes = ["RANDOM", "DSAT", "LEAD_SIGNAL", "NEW_HIRE", "LOW_SCORE", "MANUAL"] as const;
export const queueCsatBuckets = ["NEGATIVE", "POSITIVE", "NO_SCORE"] as const;
export const queueQaScoreBands = ["LOW", "MID", "HIGH"] as const;
export const queueProcessFilters = ["critical", "reanswer", "appeal", "ai_exception"] as const;
export const queueDueFilters = ["overdue"] as const;

const conversationChannels = ["CHAT", "EMAIL", "TICKET", "MESSENGER"] as const satisfies readonly ConversationChannel[];
const conversationQaStatuses = ["QUEUED", "ASSIGNED", "IN_PROGRESS", "FINALIZED", "REOPENED"] as const satisfies readonly QaStatus[];
const findingRiskLevels = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const satisfies readonly RiskLevel[];
const reviewQueueRiskFilters = [...findingRiskLevels, "HIGH_OR_CRITICAL"] as const satisfies readonly ReviewQueueRiskFilter[];
const reviewQueueCoachingStatuses = ["open"] as const satisfies readonly ReviewQueueCoachingFilter[];

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function cleanParam(value: string | string[] | undefined) {
  const firstValue = firstParam(value)?.trim();
  return firstValue ? firstValue : undefined;
}

function parseDateParam(value: string | undefined, endOfDay = false) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return undefined;
  }

  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);

  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function parseReviewQueueFilters(searchParams: ReviewQueueSearchParams = {}): ReviewQueueFilters {
  const requestedStatus = cleanParam(searchParams.status);
  const requestedChannel = cleanParam(searchParams.channel);
  const requestedQaStatus = cleanParam(searchParams.qaStatus);
  const requestedSamplingType = cleanParam(searchParams.samplingType);
  const requestedCsatBucket = cleanParam(searchParams.csatBucket);
  const requestedQaScoreBand = cleanParam(searchParams.qaScoreBand);
  const requestedProcess = cleanParam(searchParams.process);
  const requestedDue = cleanParam(searchParams.due);
  const requestedRiskLevel = cleanParam(searchParams.riskLevel);
  const requestedCoachingStatus = cleanParam(searchParams.coachingStatus);
  const requestedFinalizedFrom = cleanParam(searchParams.finalizedFrom);
  const requestedFinalizedTo = cleanParam(searchParams.finalizedTo);

  return {
    q: cleanParam(searchParams.q),
    status: reviewQueueStatuses.includes(requestedStatus as ReviewQueueStatus)
      ? (requestedStatus as ReviewQueueStatus)
      : "all",
    channel: conversationChannels.includes(requestedChannel as ConversationChannel)
      ? (requestedChannel as ConversationChannel)
      : undefined,
    qaStatus: conversationQaStatuses.includes(requestedQaStatus as QaStatus) ? (requestedQaStatus as QaStatus) : undefined,
    source: cleanParam(searchParams.source),
    assignee: cleanParam(searchParams.assignee),
    qaAssignee: cleanParam(searchParams.qaAssignee),
    samplingType: queueSamplingTypes.includes(requestedSamplingType as (typeof queueSamplingTypes)[number])
      ? requestedSamplingType
      : undefined,
    csatBucket: queueCsatBuckets.includes(requestedCsatBucket as (typeof queueCsatBuckets)[number])
      ? requestedCsatBucket
      : undefined,
    qaScoreBand: queueQaScoreBands.includes(requestedQaScoreBand as (typeof queueQaScoreBands)[number])
      ? requestedQaScoreBand
      : undefined,
    supportLine: cleanParam(searchParams.supportLine),
    teamName: cleanParam(searchParams.teamName),
    process: queueProcessFilters.includes(requestedProcess as ReviewQueueProcessFilter)
      ? (requestedProcess as ReviewQueueProcessFilter)
      : undefined,
    due: queueDueFilters.includes(requestedDue as ReviewQueueDueFilter) ? (requestedDue as ReviewQueueDueFilter) : undefined,
    riskLevel: reviewQueueRiskFilters.includes(requestedRiskLevel as ReviewQueueRiskFilter)
      ? (requestedRiskLevel as ReviewQueueRiskFilter)
      : undefined,
    coachingStatus: reviewQueueCoachingStatuses.includes(requestedCoachingStatus as ReviewQueueCoachingFilter)
      ? (requestedCoachingStatus as ReviewQueueCoachingFilter)
      : undefined,
    findingCategory: cleanParam(searchParams.findingCategory),
    criticalCategory: cleanParam(searchParams.criticalCategory),
    feedbackStatus: cleanParam(searchParams.feedbackStatus),
    appealStatus: cleanParam(searchParams.appealStatus),
    reanswerStatus: cleanParam(searchParams.reanswerStatus),
    finalizedFrom: parseDateParam(requestedFinalizedFrom),
    finalizedTo: parseDateParam(requestedFinalizedTo, true)
  };
}

