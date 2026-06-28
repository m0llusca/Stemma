import type { ConversationChannel, QaStatus, ReviewSource, ReviewStatus, RiskLevel } from "@prisma/client";

export type ReviewQueueStatus = "all" | "unreviewed" | "reviewed";
export type ReviewQueueProcessFilter = "critical" | "reanswer" | "appeal";
export type ReviewQueueDueFilter = "overdue";
export type ReviewQueueRiskFilter = RiskLevel | "HIGH_OR_CRITICAL";
export type ReviewQueueCoachingFilter = "open";

export type ReviewQueueFilters = {
  q?: string;
  status: ReviewQueueStatus;
  channel?: ConversationChannel;
  qaStatus?: QaStatus;
  source?: string;
  assignee?: string;
  qaAssignee?: string;
  samplingType?: string;
  csatBucket?: string;
  supportLine?: string;
  teamName?: string;
  process?: ReviewQueueProcessFilter;
  due?: ReviewQueueDueFilter;
  riskLevel?: ReviewQueueRiskFilter;
  coachingStatus?: ReviewQueueCoachingFilter;
  findingCategory?: string;
  criticalCategory?: string;
  feedbackStatus?: string;
  appealStatus?: string;
  reanswerStatus?: string;
  finalizedFrom?: Date;
  finalizedTo?: Date;
};

export type ReviewQueueSearchParams = Record<string, string | string[] | undefined>;

export type ReviewQueueSummaryDto = {
  total: number;
  queued: number;
  inWork: number;
  drafts: number;
  reviewed: number;
  overdue: number;
};

export type ReviewQueueFilterOptionsDto = {
  sources: string[];
  assignees: string[];
  qaAssignees: string[];
  supportLines: string[];
  teamNames: string[];
};

export type ReviewQueueReviewDto = {
  id: string;
  status: ReviewStatus;
  reviewSource: ReviewSource;
  totalScore: number;
  criticalError: boolean;
  needsReanswer: boolean;
  appealStatus: string;
  reanswerStatus: string;
};

export type ReviewQueueConversationDto = {
  id: string;
  subject: string;
  customerName: string;
  assigneeName: string | null;
  messageCount: number;
  channel: ConversationChannel;
  externalSource: string;
  supportLine: string | null;
  teamName: string | null;
  reviewDueAt: string | null;
  qaStatus: QaStatus;
  qaAssigneeName: string | null;
  csatBucket: string;
  samplingType: string;
  riskHint: string | null;
  priorityRank: number;
  priorityReason: string;
  reviews: ReviewQueueReviewDto[];
};

export type ReviewQueueAssigneeDto = {
  id: string;
  name: string;
};

export type ReviewQueueSavedViewDto = {
  id: string;
  name: string;
  href: string;
  scope: string;
};

export type ReviewQueuePageData = {
  filters: ReviewQueueFilters;
  currentHref: string;
  currentAssigneeName: string;
  conversations: ReviewQueueConversationDto[];
  summary: ReviewQueueSummaryDto;
  filterOptions: ReviewQueueFilterOptionsDto;
  qaAssignees: ReviewQueueAssigneeDto[];
  savedViews: ReviewQueueSavedViewDto[];
};
