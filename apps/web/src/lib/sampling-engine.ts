import { createHash } from "node:crypto";
import { z } from "zod";
import type { CustomConversationInput } from "@/lib/validation/custom-api";
import { customSamplingTypeSchema } from "@/lib/validation/custom-api";

/** Persisted when no sampling rule matched — excluded from take-next (QaStatus has no OUT_OF_SAMPLE). */
export const outOfSampleSamplingType = "OUT_OF_SAMPLE";

export type SamplingRuleRecord = {
  id: string;
  name: string;
  type: string;
  conditionsJson: string;
  targetPercent: number;
  priority: number;
};

export type SamplingDecision =
  | {
      matched: true;
      samplingType: CustomConversationInput["samplingType"];
      samplingReason: string;
      ruleId: string;
      ruleName: string;
      bucket: number;
    }
  | {
      matched: false;
      samplingType?: CustomConversationInput["samplingType"];
      samplingReason: string;
      bucket: number;
    };

const stringOrArraySchema = z.union([z.string().trim().min(1), z.array(z.string().trim().min(1)).min(1)]).optional();
const conditionsSchema = z
  .object({
    externalSource: stringOrArraySchema,
    channel: stringOrArraySchema,
    status: stringOrArraySchema,
    tag: stringOrArraySchema,
    csatBucket: stringOrArraySchema,
    tagsAny: z.array(z.string().trim().min(1)).min(1).optional(),
    tagsAll: z.array(z.string().trim().min(1)).min(1).optional(),
    supportLine: stringOrArraySchema,
    teamName: stringOrArraySchema,
    riskHint: stringOrArraySchema,
    csatScoreAtMost: z.number().int().min(1).max(5).optional(),
    csatScoreAtLeast: z.number().int().min(1).max(5).optional()
  })
  .passthrough();

function normalizeList(value: string | string[] | undefined) {
  return Array.isArray(value) ? value.map((item) => item.trim().toLowerCase()) : value ? [value.trim().toLowerCase()] : [];
}

function parseConditions(value: string) {
  try {
    const parsed = JSON.parse(value);
    return conditionsSchema.parse(parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {});
  } catch {
    return conditionsSchema.parse({});
  }
}

function textMatches(value: string | null | undefined, expected: string | string[] | undefined) {
  const candidates = normalizeList(expected);

  if (candidates.length === 0) {
    return true;
  }

  return value ? candidates.includes(value.trim().toLowerCase()) : false;
}

function tagsMatch(conversationTags: string[], expected: string[] | undefined, mode: "any" | "all") {
  if (!expected || expected.length === 0) {
    return true;
  }

  const actual = new Set(conversationTags.map((tag) => tag.trim().toLowerCase()));
  const normalizedExpected = expected.map((tag) => tag.trim().toLowerCase());

  return mode === "any" ? normalizedExpected.some((tag) => actual.has(tag)) : normalizedExpected.every((tag) => actual.has(tag));
}

function csatBucket(score: number | null | undefined) {
  if (score == null) {
    return "NO_SCORE";
  }

  return score <= 2 ? "NEGATIVE" : "POSITIVE";
}

function samplingTypeForRule(ruleType: string): CustomConversationInput["samplingType"] {
  const normalized = ruleType.trim().toLowerCase();
  const mapped = normalized === "csat" ? "dsat" : normalized;

  return customSamplingTypeSchema.catch("manual").parse(mapped);
}

export function samplingBucket(input: { workspaceId: string; ruleId: string; externalSource: string; externalId: string }) {
  const hash = createHash("sha256")
    .update(`${input.workspaceId}:${input.ruleId}:${input.externalSource}:${input.externalId}`, "utf8")
    .digest("hex");

  return Number.parseInt(hash.slice(0, 8), 16) % 100;
}

type RuleMatchResult =
  | { kind: "selected"; bucket: number }
  | { kind: "conditions_miss"; bucket: number }
  | { kind: "sampled_out"; bucket: number };

function matchesRule(workspaceId: string, conversation: CustomConversationInput, rule: SamplingRuleRecord): RuleMatchResult {
  const conditions = parseConditions(rule.conditionsJson);
  const bucket = samplingBucket({
    workspaceId,
    ruleId: rule.id,
    externalSource: conversation.externalSource,
    externalId: conversation.externalId
  });

  // Conditions first: a % miss on a matching rule must stop the cascade.
  // Falling through to a catch-all after targetPercent exclusion inflates sample rates.
  if (!textMatches(conversation.externalSource, conditions.externalSource)) return { kind: "conditions_miss", bucket };
  if (!textMatches(conversation.channel, conditions.channel)) return { kind: "conditions_miss", bucket };
  if (!textMatches(conversation.status, conditions.status)) return { kind: "conditions_miss", bucket };
  if (!textMatches(conversation.supportLine, conditions.supportLine)) return { kind: "conditions_miss", bucket };
  if (!textMatches(conversation.teamName, conditions.teamName)) return { kind: "conditions_miss", bucket };
  if (!textMatches(conversation.riskHint, conditions.riskHint)) return { kind: "conditions_miss", bucket };
  if (!textMatches(csatBucket(conversation.csatScore), conditions.csatBucket)) return { kind: "conditions_miss", bucket };
  if (!textMatches(undefined, conditions.tag) && !tagsMatch(conversation.tags ?? [], normalizeList(conditions.tag), "any")) {
    return { kind: "conditions_miss", bucket };
  }
  if (!tagsMatch(conversation.tags ?? [], conditions.tagsAny, "any")) return { kind: "conditions_miss", bucket };
  if (!tagsMatch(conversation.tags ?? [], conditions.tagsAll, "all")) return { kind: "conditions_miss", bucket };
  if (conditions.csatScoreAtMost !== undefined && (conversation.csatScore ?? 6) > conditions.csatScoreAtMost) {
    return { kind: "conditions_miss", bucket };
  }
  if (conditions.csatScoreAtLeast !== undefined && (conversation.csatScore ?? 0) < conditions.csatScoreAtLeast) {
    return { kind: "conditions_miss", bucket };
  }

  if (bucket >= Math.max(0, Math.min(rule.targetPercent, 100))) {
    return { kind: "sampled_out", bucket };
  }

  return { kind: "selected", bucket };
}

export function evaluateSamplingRules(input: {
  workspaceId: string;
  conversation: CustomConversationInput;
  rules: SamplingRuleRecord[];
}): SamplingDecision {
  for (const rule of input.rules) {
    const match = matchesRule(input.workspaceId, input.conversation, rule);

    if (match.kind === "conditions_miss") {
      continue;
    }

    if (match.kind === "sampled_out") {
      // Explicit exclusion by this rule's percentage — do not let lower-priority rules rescue it.
      return {
        matched: false,
        samplingType: "random",
        samplingReason: `Исключено процентом правила выборки "${rule.name}".`,
        bucket: match.bucket
      };
    }

    const samplingType = samplingTypeForRule(rule.type);
    return {
      matched: true,
      samplingType,
      samplingReason: `Правило выборки "${rule.name}" применено к ${input.conversation.externalSource}:${input.conversation.externalId}.`,
      ruleId: rule.id,
      ruleName: rule.name,
      bucket: match.bucket
    };
  }

  // Fail-closed: inbound payloads cannot self-assign DSAT / lead / low_score without a matching rule.
  return {
    matched: false,
    samplingType: "random",
    samplingReason: input.conversation.samplingReason,
    bucket: samplingBucket({
      workspaceId: input.workspaceId,
      ruleId: "default",
      externalSource: input.conversation.externalSource,
      externalId: input.conversation.externalId
    })
  };
}

export function applySamplingDecision(conversation: CustomConversationInput, decision: SamplingDecision): CustomConversationInput {
  if (!decision.matched) {
    return {
      ...conversation,
      samplingType: decision.samplingType ?? "random",
      samplingReason: decision.samplingReason
    };
  }

  return {
    ...conversation,
    samplingType: decision.samplingType,
    samplingReason: decision.samplingReason
  };
}
