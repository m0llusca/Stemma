import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { hasPermission, type AuthUser } from "@/lib/auth/permissions";
import { externalSourceLabel } from "@/lib/labels";
import { resolveReportPeriod } from "@/lib/report-period";
import type {
  ReportAnalysisState,
  ReportEvidenceType,
  ReportFilterCatalog,
  ReportRisk,
} from "@/lib/reports/report-analysis-state";
import {
  serializeReportAnalysisState,
  reportFilterValue,
} from "@/lib/reports/report-analysis-state";
import { buildReportFilterCatalog } from "@/lib/reports/report-filter-catalog";
import { qualityScorePointWord } from "@/lib/score-display";

export type ReportEvidenceMetric =
  | "quality-score"
  | "review-volume"
  | "ai-confidence"
  | "ai-reserve"
  | "reason-trend"
  | "source-score"
  | "operator-score"
  | "team-score"
  | "block-score"
  | "reason"
  | "agreement"
  | "operator-block"
  | "high-risk"
  | "quota"
  | "ai-drift"
  | "feedback-sla";

export type ReportEvidenceFacet = {
  source?: string;
  operator?: string;
  team?: string;
  block?: string;
  risk?: ReportRisk;
  reason?: string;
  criterion?: string;
};

export type ReportEvidenceDescriptorSelection = {
  evidenceType: ReportEvidenceType;
  metric: ReportEvidenceMetric;
  facet?: ReportEvidenceFacet;
  bucketStart?: string;
};

export type ReportEvidenceDescriptor = {
  evidenceType: ReportEvidenceType;
  metric: ReportEvidenceMetric;
  facet?: ReportEvidenceFacet;
  bucketStart?: string;
  canonicalDescriptor: string;
  key: `ev1_${string}`;
};

export type ReportEvidenceRow = {
  id: string;
  conversationId: string;
  href: string;
  scoreLabel: string;
  sourceLabel: string;
  teamLabel: string;
  finalizedAt: string;
  riskLabel: string;
  relationLabel: string;
};

export type ReportEvidenceResult =
  | {
      status: "ready";
      title: string;
      description: string;
      comparison: string;
      sample: string;
      rows: ReportEvidenceRow[];
    }
  | {
      status: "unavailable";
      title: string;
      description: string;
      rows: [];
    };

export const unavailableReportEvidence = {
  status: "unavailable",
  title: "Данные больше недоступны",
  description:
    "Выбранный фрагмент нельзя открыть. Обновите отчёт и попробуйте снова.",
  rows: [],
} as const satisfies ReportEvidenceResult;

const metricsByType = {
  trend: [
    "quality-score",
    "review-volume",
    "ai-confidence",
    "ai-reserve",
    "reason-trend",
  ],
  driver: [
    "source-score",
    "operator-score",
    "team-score",
    "block-score",
    "reason",
    "agreement",
  ],
  matrix: ["operator-block"],
  kpi: [
    "quality-score",
    "review-volume",
    "high-risk",
    "quota",
    "ai-drift",
    "feedback-sla",
  ],
} as const satisfies Record<
  ReportEvidenceType,
  readonly ReportEvidenceMetric[]
>;

const oneDay = 86_400_000;
const maximumDescriptors = 20_000;

type CatalogInput = {
  workspaceId: string;
  state: ReportAnalysisState;
  catalog: ReportFilterCatalog;
  operators?: readonly string[];
  reasons?: readonly string[];
  criteria?: readonly string[];
  selection?: ReportEvidenceDescriptorSelection;
  now?: Date;
};

type TrustedFacet = ReportEvidenceFacet & {
  operatorName?: string;
  teamName?: string;
  blockName?: string;
};

type EvidenceQueryRow = {
  id: string;
  conversationId: string;
  totalScore: number;
  finalizedAt: Date;
  externalSource: string;
  teamName: string | null;
  risk: string | null;
  riskRank: number;
  aiConfidence: number | null;
  aiModelVersion: string | null;
};

type ResolveReportEvidenceDependencies = {
  database?: PrismaClient;
  now?: Date;
};

function exactDay(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const day = new Date(`${value}T00:00:00.000Z`);
  return day.toISOString().slice(0, 10) === value ? day : undefined;
}

function canonicalRange(state: ReportAnalysisState, now = new Date()) {
  const period = resolveReportPeriod(
    {
      period: state.period,
      start: state.start,
      end: state.end,
    },
    now,
  );
  return {
    start: new Date(period.start),
    end: new Date(period.end),
    startKey: period.start.toISOString().slice(0, 10),
    endKey: period.end.toISOString().slice(0, 10),
  };
}

function descriptorContext(state: ReportAnalysisState, now?: Date) {
  const range = canonicalRange(state, now);
  return {
    view: state.view,
    period: state.period,
    range: [range.startKey, range.endKey],
    compare: state.compare,
    grain: state.grain,
    filters: {
      ...(state.team ? { team: state.team } : {}),
      ...(state.source ? { source: state.source } : {}),
      ...(state.risk ? { risk: state.risk } : {}),
      ...(state.block ? { block: state.block } : {}),
    },
    ...(state.section ? { section: state.section } : {}),
  };
}

function canonicalDescriptor(
  state: ReportAnalysisState,
  selection: ReportEvidenceDescriptorSelection,
  now?: Date,
) {
  return JSON.stringify({
    v: 1,
    context: descriptorContext(state, now),
    metric: selection.metric,
    ...(selection.facet && Object.keys(selection.facet).length > 0
      ? {
          facet: {
            ...(selection.facet.source
              ? { source: selection.facet.source }
              : {}),
            ...(selection.facet.operator
              ? { operator: selection.facet.operator.normalize("NFKC") }
              : {}),
            ...(selection.facet.team ? { team: selection.facet.team } : {}),
            ...(selection.facet.block ? { block: selection.facet.block } : {}),
            ...(selection.facet.risk ? { risk: selection.facet.risk } : {}),
            ...(selection.facet.reason
              ? { reason: selection.facet.reason.normalize("NFKC") }
              : {}),
            ...(selection.facet.criterion
              ? { criterion: selection.facet.criterion }
              : {}),
          },
        }
      : {}),
    ...(selection.bucketStart ? { bucketStart: selection.bucketStart } : {}),
  });
}

export function buildReportEvidenceKey(
  workspaceId: string,
  evidenceType: ReportEvidenceType,
  descriptor: string,
): `ev1_${string}` {
  const digest = createHash("sha256")
    .update(workspaceId)
    .update("\0")
    .update(evidenceType)
    .update("\0")
    .update(descriptor)
    .digest("base64url");
  return `ev1_${digest}`;
}

function allowedMetric(
  evidenceType: ReportEvidenceType,
  metric: ReportEvidenceMetric,
) {
  return (
    metricsByType[evidenceType] as readonly ReportEvidenceMetric[]
  ).includes(metric);
}

function periodBucketStarts(
  state: ReportAnalysisState,
  metric: ReportEvidenceMetric,
  now?: Date,
) {
  const range = canonicalRange(state, now);
  const bucketDays =
    metric === "reason-trend"
      ? 1
      : metric === "ai-confidence" ||
          metric === "ai-reserve" ||
          state.grain === "week"
        ? 7
        : 1;
  const startsOnUtcMonday =
    metric === "ai-confidence" || metric === "ai-reserve";
  const firstBucketStart = startsOnUtcMonday
    ? new Date(
        range.start.getTime() - ((range.start.getUTCDay() + 6) % 7) * oneDay,
      )
    : new Date(range.start);
  const starts: string[] = [];
  for (
    let cursor = firstBucketStart;
    cursor.getTime() <= range.end.getTime() && starts.length < 400;
    cursor = new Date(cursor.getTime() + bucketDays * oneDay)
  ) {
    starts.push(cursor.toISOString().slice(0, 10));
  }
  return starts;
}

function stateAllowsFacet(
  state: ReportAnalysisState,
  facet: ReportEvidenceFacet | undefined,
) {
  if (!facet) return true;
  return (
    (!state.source || !facet.source || state.source === facet.source) &&
    (!state.team || !facet.team || state.team === facet.team) &&
    (!state.block || !facet.block || state.block === facet.block) &&
    (!state.risk || !facet.risk || state.risk === facet.risk)
  );
}

function facetExistsInCatalog(
  facet: ReportEvidenceFacet | undefined,
  catalog: ReportFilterCatalog,
  reasons: readonly string[],
  operators: readonly string[],
  criteria: readonly string[],
) {
  if (!facet) return true;
  return (
    (!facet.source || catalog.sources.includes(facet.source)) &&
    (!facet.operator || operators.includes(facet.operator)) &&
    (!facet.team ||
      catalog.teams.some((option) => option.slug === facet.team)) &&
    (!facet.block ||
      catalog.blocks.some((option) => option.slug === facet.block)) &&
    (!facet.reason || reasons.includes(facet.reason)) &&
    (!facet.criterion || criteria.includes(facet.criterion)) &&
    (!facet.risk ||
      ["low", "medium", "high", "critical", "high_plus"].includes(facet.risk))
  );
}

function selectionsForMetric(
  evidenceType: ReportEvidenceType,
  metric: ReportEvidenceMetric,
  input: CatalogInput,
): ReportEvidenceDescriptorSelection[] {
  const bucketed = [
    "quality-score",
    "review-volume",
    "ai-confidence",
    "ai-reserve",
    "reason-trend",
  ].includes(metric);

  if (evidenceType === "driver" && metric === "source-score") {
    return input.catalog.sources.map((source) => ({
      evidenceType: "driver",
      metric,
      facet: { source },
    }));
  }
  if (evidenceType === "driver" && metric === "operator-score") {
    return (input.operators ?? []).map((operator) => ({
      evidenceType: "driver",
      metric,
      facet: { operator },
    }));
  }
  if (evidenceType === "driver" && metric === "team-score") {
    return input.catalog.teams.map((team) => ({
      evidenceType: "driver",
      metric,
      facet: { team: team.slug },
    }));
  }
  if (evidenceType === "driver" && metric === "block-score") {
    return input.catalog.blocks.map((block) => ({
      evidenceType: "driver",
      metric,
      facet: { block: block.slug },
    }));
  }
  if (evidenceType === "driver" && metric === "reason") {
    return (input.reasons ?? []).map((reason) => ({
      evidenceType: "driver",
      metric,
      facet: { reason },
    }));
  }
  if (evidenceType === "driver" && metric === "agreement") {
    return (input.criteria ?? []).map((criterion) => ({
      evidenceType: "driver",
      metric,
      facet: { criterion },
    }));
  }
  if (evidenceType === "matrix" && metric === "operator-block") {
    return (input.operators ?? []).flatMap((operator) =>
      input.catalog.blocks.map((block) => ({
        evidenceType: "matrix" as const,
        metric,
        facet: { operator, block: block.slug },
      })),
    );
  }
  if (evidenceType === "trend" && metric === "reason-trend") {
    return (input.reasons ?? []).flatMap((reason) =>
      periodBucketStarts(input.state, metric, input.now).map((bucketStart) => ({
        evidenceType: "trend" as const,
        metric,
        facet: { reason },
        bucketStart,
      })),
    );
  }
  if (evidenceType === "trend" && bucketed) {
    return periodBucketStarts(input.state, metric, input.now).map(
      (bucketStart) => ({
        evidenceType: "trend" as const,
        metric,
        bucketStart,
      }),
    );
  }

  return [{ evidenceType, metric }];
}

export function buildReportEvidenceDescriptorCatalog(
  input: CatalogInput,
): ReportEvidenceDescriptor[] {
  const selected = input.selection;
  const candidates = selected
    ? [selected]
    : (
        Object.entries(metricsByType) as Array<
          [ReportEvidenceType, readonly ReportEvidenceMetric[]]
        >
      ).flatMap(([evidenceType, metrics]) =>
        metrics.flatMap((metric) =>
          selectionsForMetric(evidenceType, metric, input),
        ),
      );
  if (candidates.length > maximumDescriptors) {
    return [];
  }

  const allowedBuckets = new Map<ReportEvidenceMetric, Set<string>>();
  const result: ReportEvidenceDescriptor[] = [];
  for (const selection of candidates) {
    if (!allowedMetric(selection.evidenceType, selection.metric)) continue;
    if (
      selection.metric === "high-risk" &&
      (input.state.risk === "low" || input.state.risk === "medium")
    ) {
      continue;
    }
    if (
      !facetExistsInCatalog(
        selection.facet,
        input.catalog,
        input.reasons ?? [],
        input.operators ?? [],
        input.criteria ?? [],
      ) ||
      !stateAllowsFacet(input.state, selection.facet)
    ) {
      continue;
    }
    if (selection.metric === "agreement" && !selection.facet?.criterion) {
      continue;
    }
    if (selection.bucketStart) {
      let buckets = allowedBuckets.get(selection.metric);
      if (!buckets) {
        buckets = new Set(
          periodBucketStarts(input.state, selection.metric, input.now),
        );
        allowedBuckets.set(selection.metric, buckets);
      }
      if (!buckets.has(selection.bucketStart)) continue;
    }
    if (
      ["reason-trend", "ai-confidence", "ai-reserve"].includes(
        selection.metric,
      ) &&
      !selection.bucketStart
    ) {
      continue;
    }

    const descriptor = canonicalDescriptor(input.state, selection, input.now);
    result.push({
      evidenceType: selection.evidenceType,
      metric: selection.metric,
      ...(selection.facet ? { facet: selection.facet } : {}),
      ...(selection.bucketStart ? { bucketStart: selection.bucketStart } : {}),
      canonicalDescriptor: descriptor,
      key: buildReportEvidenceKey(
        input.workspaceId,
        selection.evidenceType,
        descriptor,
      ),
    });
  }
  return result;
}

export function findReportEvidenceDescriptor(
  input: CatalogInput & { selection: ReportEvidenceDescriptorSelection },
) {
  return buildReportEvidenceDescriptorCatalog(input)[0];
}

async function loadTrustedCatalog(
  database: PrismaClient,
  workspaceId: string,
  state: ReportAnalysisState,
  now?: Date,
) {
  const range = canonicalRange(state, now);
  const [teams, operators, sources, blocks, reasons, criteria] = await Promise.all([
    database.conversation.findMany({
      where: { workspaceId, teamName: { not: null } },
      distinct: ["teamName"],
      select: { teamName: true },
    }),
    database.conversation.findMany({
      where: { workspaceId, assigneeName: { not: null } },
      distinct: ["assigneeName"],
      select: { assigneeName: true },
    }),
    database.conversation.findMany({
      where: { workspaceId },
      distinct: ["externalSource"],
      select: { externalSource: true },
    }),
    database.scorecardCriterion.findMany({
      where: { scorecard: { workspaceId, isActive: true } },
      distinct: ["block"],
      select: { block: true },
    }),
    database.finding.findMany({
      where: {
        review: {
          workspaceId,
          status: "FINALIZED",
          finalizedAt: { gte: range.start, lte: range.end },
        },
      },
      distinct: ["category"],
      select: { category: true },
    }),
    database.scorecardCriterion.findMany({
      where: { scorecard: { workspaceId, isActive: true } },
      distinct: ["id"],
      select: { id: true },
    }),
  ]);

  return {
    catalog: buildReportFilterCatalog({
      teams: teams.map((row) => row.teamName),
      sources: sources.map((row) => row.externalSource),
      blocks: blocks.map((row) => row.block),
    }),
    operators: operators
      .map((row) => row.assigneeName?.trim().normalize("NFKC"))
      .filter((value): value is string => Boolean(value))
      .sort((left, right) => left.localeCompare(right, "ru-RU")),
    reasons: reasons
      .map((row) => row.category.trim().normalize("NFKC"))
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right, "ru-RU")),
    criteria: criteria.map((row) => row.id).sort(),
  };
}

function trustedFacet(
  descriptor: ReportEvidenceDescriptor,
  state: ReportAnalysisState,
  catalog: ReportFilterCatalog,
): TrustedFacet | undefined {
  const facet = descriptor.facet ?? {};
  const teamSlug = facet.team ?? state.team;
  const blockSlug = facet.block ?? state.block;
  const source = facet.source ?? state.source;
  const operatorName = facet.operator?.trim().normalize("NFKC");
  const risk =
    descriptor.metric === "high-risk"
      ? state.risk === "high" || state.risk === "critical"
        ? state.risk
        : "high_plus"
      : facet.risk ?? state.risk;
  const teamName = reportFilterValue(teamSlug, catalog.teams);
  const blockName = reportFilterValue(blockSlug, catalog.blocks);

  if ((teamSlug && !teamName) || (blockSlug && !blockName)) return undefined;
  if (source && !catalog.sources.includes(source)) return undefined;
  return {
    ...(source ? { source } : {}),
    ...(operatorName ? { operator: operatorName, operatorName } : {}),
    ...(teamSlug ? { team: teamSlug } : {}),
    ...(teamName ? { teamName } : {}),
    ...(blockSlug ? { block: blockSlug } : {}),
    ...(blockName ? { blockName } : {}),
    ...(risk ? { risk } : {}),
    ...(facet.reason ? { reason: facet.reason } : {}),
    ...(facet.criterion ? { criterion: facet.criterion } : {}),
  };
}

function riskPredicate(risk: ReportRisk | undefined) {
  if (!risk) return Prisma.empty;
  if (risk === "high_plus") {
    return Prisma.sql`AND EXISTS (
      SELECT 1 FROM "Finding" risk_filter
      WHERE risk_filter."reviewId" = r.id
        AND risk_filter."riskLevel" IN ('HIGH'::"RiskLevel", 'CRITICAL'::"RiskLevel")
    )`;
  }
  const databaseRisk = risk.toUpperCase();
  return Prisma.sql`AND EXISTS (
    SELECT 1 FROM "Finding" risk_filter
    WHERE risk_filter."reviewId" = r.id
      AND risk_filter."riskLevel"::text = ${databaseRisk}
  )`;
}

function matchedRiskJoinPredicate(risk: ReportRisk | undefined) {
  if (!risk) return Prisma.empty;
  if (risk === "high_plus") {
    return Prisma.sql`AND finding."riskLevel" IN ('HIGH'::"RiskLevel", 'CRITICAL'::"RiskLevel")`;
  }
  const databaseRisk = risk.toUpperCase();
  return Prisma.sql`AND finding."riskLevel"::text = ${databaseRisk}`;
}

function evidenceScoreExpression(blockName: string | undefined) {
  if (!blockName) return Prisma.sql`r."totalScore"`;
  return Prisma.sql`((
    SELECT
      SUM(
        CASE
          WHEN block_score."isNotApplicable" THEN NULL
          WHEN block_criterion.kind = 'PASS_FAIL'::"CriterionKind"
            THEN (CASE WHEN block_score.passed THEN 100.0 ELSE 0.0 END)
          WHEN block_score.value IS NOT NULL
            THEN block_score.value::double precision / 3.0 * 100.0
          ELSE NULL
        END * block_criterion.weight
      ) / NULLIF(SUM(
        CASE
          WHEN block_score."isNotApplicable" THEN 0
          WHEN block_criterion.kind = 'PASS_FAIL'::"CriterionKind"
            AND block_score.passed IS NULL THEN 0
          WHEN block_criterion.kind = 'SCALE_1_3'::"CriterionKind"
            AND block_score.value IS NULL THEN 0
          ELSE block_criterion.weight
        END
      ), 0)
    FROM "CriterionScore" block_score
    JOIN "ScorecardCriterion" block_criterion
      ON block_criterion.id = block_score."criterionId"
    WHERE block_score."reviewId" = r.id
      AND block_criterion.block = ${blockName}
  ))::double precision`;
}

function bucketRange(
  state: ReportAnalysisState,
  descriptor: ReportEvidenceDescriptor,
  now?: Date,
) {
  const period = canonicalRange(state, now);
  if (!descriptor.bucketStart) return period;
  const start = exactDay(descriptor.bucketStart);
  if (!start) return period;
  const bucketDays =
    descriptor.metric === "reason-trend"
      ? 1
      : descriptor.metric === "ai-confidence" ||
          descriptor.metric === "ai-reserve" ||
          state.grain === "week"
        ? 7
        : 1;
  return {
    ...period,
    start: new Date(Math.max(period.start.getTime(), start.getTime())),
    end: new Date(
      Math.min(period.end.getTime(), start.getTime() + bucketDays * oneDay - 1),
    ),
  };
}

async function queryEvidenceRows(
  database: PrismaClient,
  input: {
    workspaceId: string;
    state: ReportAnalysisState;
    descriptor: ReportEvidenceDescriptor;
    facet: TrustedFacet;
    now?: Date;
  },
) {
  const range = bucketRange(input.state, input.descriptor, input.now);
  const source = input.facet.source;
  const operatorName = input.facet.operatorName;
  const teamName = input.facet.teamName;
  const blockName = input.facet.blockName;
  const reason = input.facet.reason;
  const agreementCriterion = input.facet.criterion ?? "";
  const isAiDrift =
    input.descriptor.metric === "ai-confidence" ||
    input.descriptor.metric === "ai-reserve";
  const sourcePredicate = source
    ? Prisma.sql`AND c."externalSource" = ${source}`
    : Prisma.empty;
  const operatorPredicate = operatorName
    ? Prisma.sql`AND c."assigneeName" = ${operatorName}`
    : Prisma.empty;
  const teamPredicate = teamName
    ? Prisma.sql`AND c."teamName" = ${teamName}`
    : Prisma.empty;
  const blockPredicate = blockName
    ? Prisma.sql`AND EXISTS (
        SELECT 1
        FROM "CriterionScore" score_filter
        JOIN "ScorecardCriterion" criterion_filter
          ON criterion_filter.id = score_filter."criterionId"
        WHERE score_filter."reviewId" = r.id
          AND criterion_filter.block = ${blockName}
      )`
    : Prisma.empty;
  const blockMetricPredicate = blockName
    ? Prisma.sql`AND EXISTS (
        SELECT 1
        FROM "CriterionScore" block_metric_score
        JOIN "ScorecardCriterion" block_metric_criterion
          ON block_metric_criterion.id = block_metric_score."criterionId"
        WHERE block_metric_score."reviewId" = r.id
          AND block_metric_criterion.block = ${blockName}
          AND block_metric_criterion.weight > 0
          AND NOT block_metric_score."isNotApplicable"
          AND (
            (
              block_metric_criterion.kind = 'PASS_FAIL'::"CriterionKind"
              AND block_metric_score.passed IS NOT NULL
            )
            OR (
              block_metric_criterion.kind = 'SCALE_1_3'::"CriterionKind"
              AND block_metric_score.value IS NOT NULL
            )
          )
      )`
    : Prisma.empty;
  const reasonRiskPredicate =
    input.facet.risk === "high_plus"
      ? Prisma.sql`AND reason_filter."riskLevel" IN ('HIGH'::"RiskLevel", 'CRITICAL'::"RiskLevel")`
      : input.facet.risk
        ? Prisma.sql`AND reason_filter."riskLevel"::text = ${input.facet.risk.toUpperCase()}`
        : Prisma.empty;
  const reasonPredicate = reason
    ? Prisma.sql`AND EXISTS (
        SELECT 1 FROM "Finding" reason_filter
        WHERE reason_filter."reviewId" = r.id
          AND reason_filter.category = ${reason}
          ${reasonRiskPredicate}
      )`
    : Prisma.empty;
  const agreementJoin =
    input.descriptor.metric === "agreement"
      ? Prisma.sql`JOIN LATERAL (
          SELECT
            agreement_candidate."suggestedValueJson"
          FROM "AiQualityDraft" agreement_candidate
          WHERE agreement_candidate."workspaceId" = r."workspaceId"
            AND agreement_candidate."conversationId" = r."conversationId"
            AND agreement_candidate.kind = 'score'
            AND lower(trim(agreement_candidate."modelVersion"))
              NOT LIKE 'deterministic%'
          ORDER BY agreement_candidate."createdAt" DESC, agreement_candidate.id ASC
          LIMIT 1
        ) agreement_draft ON TRUE`
      : Prisma.empty;
  const agreementPredicate =
    input.descriptor.metric === "agreement"
      ? Prisma.sql`AND r."reviewSource" = 'HUMAN'::"ReviewSource"
        AND EXISTS (
          SELECT 1
          FROM "CriterionScore" agreement_score
          CROSS JOIN LATERAL jsonb_array_elements(
            CASE
              WHEN jsonb_typeof(
                agreement_draft."suggestedValueJson"::jsonb -> 'criteria'
              ) = 'array'
                THEN agreement_draft."suggestedValueJson"::jsonb -> 'criteria'
              ELSE '[]'::jsonb
            END
          ) agreement_prediction
          WHERE agreement_score."reviewId" = r.id
            AND agreement_score."criterionId" = ${agreementCriterion}
            AND agreement_prediction ->> 'criterionId'
              = ${agreementCriterion}
            AND (
              agreement_score."isNotApplicable"
              OR agreement_score.value IS NOT NULL
              OR agreement_score.passed IS NOT NULL
            )
            AND (
              agreement_prediction -> 'isNotApplicable' = 'true'::jsonb
              OR jsonb_typeof(agreement_prediction -> 'value') = 'number'
              OR jsonb_typeof(agreement_prediction -> 'passed') = 'boolean'
            )
        )`
      : Prisma.empty;
  const driftJoin = isAiDrift
    ? Prisma.sql`JOIN LATERAL (
        SELECT
          drift_candidate."createdAt",
          drift_candidate.confidence,
          drift_candidate."modelVersion"
        FROM "AiQualityDraft" drift_candidate
        WHERE drift_candidate."workspaceId" = r."workspaceId"
          AND drift_candidate."conversationId" = r."conversationId"
          AND drift_candidate.kind = 'score'
          AND drift_candidate."createdAt" >= ${range.start}
          AND drift_candidate."createdAt" <= ${range.end}
        ORDER BY
          drift_candidate.confidence ASC NULLS LAST,
          drift_candidate."createdAt" DESC,
          drift_candidate.id ASC
        LIMIT 1
      ) drift_draft ON TRUE`
    : Prisma.empty;
  const evidenceDate = isAiDrift
    ? Prisma.sql`drift_draft."createdAt"`
    : Prisma.sql`r."finalizedAt"`;
  const periodPredicate = isAiDrift
    ? Prisma.empty
    : Prisma.sql`AND r."finalizedAt" >= ${range.start}
      AND r."finalizedAt" <= ${range.end}`;
  const scoreExpression = evidenceScoreExpression(blockName);
  const aiConfidenceExpression = isAiDrift
    ? Prisma.sql`drift_draft.confidence`
    : Prisma.sql`NULL::double precision`;
  const aiModelVersionExpression = isAiDrift
    ? Prisma.sql`drift_draft."modelVersion"`
    : Prisma.sql`NULL::text`;

  return database.$queryRaw<EvidenceQueryRow[]>(Prisma.sql`
    SELECT
      r.id,
      r."conversationId",
      ${scoreExpression} AS "totalScore",
      ${evidenceDate} AS "finalizedAt",
      c."externalSource",
      c."teamName",
      ${aiConfidenceExpression} AS "aiConfidence",
      ${aiModelVersionExpression} AS "aiModelVersion",
      CASE
        WHEN MAX(
          CASE finding."riskLevel"
            WHEN 'CRITICAL'::"RiskLevel" THEN 4
            WHEN 'HIGH'::"RiskLevel" THEN 3
            WHEN 'MEDIUM'::"RiskLevel" THEN 2
            WHEN 'LOW'::"RiskLevel" THEN 1
            ELSE 0
          END
        ) = 4 THEN 'CRITICAL'
        WHEN MAX(
          CASE finding."riskLevel"
            WHEN 'CRITICAL'::"RiskLevel" THEN 4
            WHEN 'HIGH'::"RiskLevel" THEN 3
            WHEN 'MEDIUM'::"RiskLevel" THEN 2
            WHEN 'LOW'::"RiskLevel" THEN 1
            ELSE 0
          END
        ) = 3 THEN 'HIGH'
        WHEN MAX(
          CASE finding."riskLevel"
            WHEN 'CRITICAL'::"RiskLevel" THEN 4
            WHEN 'HIGH'::"RiskLevel" THEN 3
            WHEN 'MEDIUM'::"RiskLevel" THEN 2
            WHEN 'LOW'::"RiskLevel" THEN 1
            ELSE 0
          END
        ) = 2 THEN 'MEDIUM'
        WHEN MAX(
          CASE finding."riskLevel"
            WHEN 'CRITICAL'::"RiskLevel" THEN 4
            WHEN 'HIGH'::"RiskLevel" THEN 3
            WHEN 'MEDIUM'::"RiskLevel" THEN 2
            WHEN 'LOW'::"RiskLevel" THEN 1
            ELSE 0
          END
        ) = 1 THEN 'LOW'
        ELSE NULL
      END AS risk,
      MAX(
        CASE finding."riskLevel"
          WHEN 'CRITICAL'::"RiskLevel" THEN 4
          WHEN 'HIGH'::"RiskLevel" THEN 3
          WHEN 'MEDIUM'::"RiskLevel" THEN 2
          WHEN 'LOW'::"RiskLevel" THEN 1
          ELSE 0
        END
      )::int AS "riskRank"
    FROM "Review" r
    JOIN "Conversation" c
      ON c.id = r."conversationId"
      AND c."workspaceId" = r."workspaceId"
    ${agreementJoin}
    ${driftJoin}
    LEFT JOIN "Finding" finding
      ON finding."reviewId" = r.id
      ${matchedRiskJoinPredicate(input.facet.risk)}
    WHERE r."workspaceId" = ${input.workspaceId}
      AND r.status = 'FINALIZED'::"ReviewStatus"
      ${periodPredicate}
      ${agreementPredicate}
      ${sourcePredicate}
      ${operatorPredicate}
      ${teamPredicate}
      ${blockPredicate}
      ${blockMetricPredicate}
      ${reasonPredicate}
      ${riskPredicate(input.facet.risk)}
    GROUP BY
      r.id,
      r."conversationId",
      ${evidenceDate},
      c."externalSource",
      c."teamName",
      ${aiConfidenceExpression},
      ${aiModelVersionExpression}
    ORDER BY "riskRank" DESC, ${evidenceDate} DESC, r.id ASC
    LIMIT 5
  `);
}

function qualityScoreLabel(value: number) {
  const formatted = value.toLocaleString("ru-RU", {
    maximumFractionDigits: 1,
  });
  // Plural agrees with the truncated integer shown in the reports UI.
  const noun = qualityScorePointWord(Math.abs(Math.trunc(value)));
  return `${formatted} ${noun}`;
}

function riskLabel(value: string | null) {
  const labels: Record<string, string> = {
    CRITICAL: "Критический риск",
    HIGH: "Высокий риск",
    MEDIUM: "Средний риск",
    LOW: "Низкий риск",
  };
  return value ? (labels[value] ?? "Риск не отмечен") : "Риск не отмечен";
}

function reviewHref(conversationId: string, state: ReportAnalysisState) {
  const returnTo = serializeReportAnalysisState(state);
  const search = new URLSearchParams({ returnTo });
  return `/reviews/${encodeURIComponent(conversationId)}?${search.toString()}`;
}

function relationLabel(
  descriptor: ReportEvidenceDescriptor,
  facet: TrustedFacet
) {
  if (facet.blockName) {
    return `Оценка блока «${facet.blockName}»`;
  }
  if (facet.risk) {
    return "Риск соответствует выбранному уровню";
  }
  if (descriptor.metric === "agreement") {
    return "Есть сопоставимая AI-оценка";
  }
  if (
    descriptor.metric === "ai-confidence" ||
    descriptor.metric === "ai-reserve"
  ) {
    return "AI-оценка из выбранного интервала";
  }
  return "Связано с выбранной выборкой";
}

function evidenceValueLabel(
  descriptor: ReportEvidenceDescriptor,
  facet: TrustedFacet,
  row: EvidenceQueryRow
) {
  if (facet.blockName) return qualityScoreLabel(row.totalScore);
  if (descriptor.metric === "ai-confidence") {
    return row.aiConfidence == null
      ? "Уверенность не указана"
      : `Уверенность ${Math.round(row.aiConfidence * 100)}%`;
  }
  if (descriptor.metric === "ai-reserve") {
    return row.aiModelVersion?.trim().toLowerCase().startsWith("deterministic")
      ? "Резервная модель"
      : "Основная модель";
  }
  if (descriptor.metric === "agreement") {
    return "AI↔человек: есть сравнение";
  }
  return qualityScoreLabel(row.totalScore);
}

function comparisonLabel(compare: ReportAnalysisState["compare"]) {
  if (compare === "year") return "Сравнение с периодом год назад";
  if (compare === "none") return "Без сравнительного периода";
  return "Сравнение с прошлым периодом";
}

export async function resolveReportEvidence(
  input: {
    user: AuthUser;
    state: ReportAnalysisState;
  },
  dependencies: ResolveReportEvidenceDependencies = {},
): Promise<ReportEvidenceResult> {
  if (
    !hasPermission(input.user.role, "reports:read") ||
    !input.state.evidenceType ||
    !input.state.evidenceKey
  ) {
    return unavailableReportEvidence;
  }

  const database =
    dependencies.database ?? (await import("@/lib/db")).prisma;
  const trusted = await loadTrustedCatalog(
    database,
    input.user.workspaceId,
    input.state,
    dependencies.now,
  );
  const descriptors = buildReportEvidenceDescriptorCatalog({
    workspaceId: input.user.workspaceId,
    state: input.state,
    catalog: trusted.catalog,
    reasons: trusted.reasons,
    operators: trusted.operators,
    criteria: trusted.criteria,
    now: dependencies.now,
  });
  const descriptor = descriptors.find(
    (candidate) =>
      candidate.evidenceType === input.state.evidenceType &&
      candidate.key === input.state.evidenceKey,
  );
  if (!descriptor) return unavailableReportEvidence;

  const facet = trustedFacet(descriptor, input.state, trusted.catalog);
  if (!facet) return unavailableReportEvidence;
  const rows = await queryEvidenceRows(database, {
    workspaceId: input.user.workspaceId,
    state: input.state,
    descriptor,
    facet,
    now: dependencies.now,
  });
  if (rows.length === 0) return unavailableReportEvidence;

  return {
    status: "ready",
    title: "Данные выбранной аналитики",
    description:
      "В этой выборке записи связаны с выбранными параметрами отчёта.",
    comparison: comparisonLabel(input.state.compare),
    sample: `${rows.length} из доступных проверок`,
    rows: rows.map((review) => ({
      id: review.id,
      conversationId: review.conversationId,
      href: reviewHref(review.conversationId, input.state),
      scoreLabel: evidenceValueLabel(descriptor, facet, review),
      sourceLabel: externalSourceLabel(review.externalSource),
      teamLabel: review.teamName ?? "Команда не указана",
      finalizedAt: review.finalizedAt.toISOString(),
      riskLabel: riskLabel(review.risk),
      relationLabel: relationLabel(descriptor, facet),
    })),
  };
}
