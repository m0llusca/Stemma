import { describe, expect, it } from "vitest";
import { applySamplingDecision, evaluateSamplingRules, samplingBucket } from "@/lib/sampling-engine";
import type { CustomConversationInput } from "@/lib/validation/custom-api";

function conversation(overrides: Partial<CustomConversationInput> = {}): CustomConversationInput {
  return {
    externalSource: "zendesk",
    externalId: "ticket-1",
    channel: "ticket",
    subject: "Refund issue",
    status: "closed",
    tags: ["refund", "vip"],
    customerName: "Customer",
    assigneeName: "Agent",
    samplingReason: "Caller provided reason",
    samplingType: "random",
    csatScore: 2,
    supportLine: "Billing",
    teamName: "Tier 1",
    riskHint: "refund_policy",
    openedAt: "2026-05-09T08:00:00.000Z",
    messages: [
      {
        externalId: "m1",
        participantType: "customer",
        authorName: "Customer",
        body: "Need refund",
        sentAt: "2026-05-09T08:00:00.000Z",
        isPrivate: false
      }
    ],
    ...overrides
  };
}

describe("sampling engine", () => {
  it("uses a deterministic bucket for a workspace/rule/conversation tuple", () => {
    expect(
      samplingBucket({
        workspaceId: "workspace-1",
        ruleId: "rule-1",
        externalSource: "zendesk",
        externalId: "ticket-1"
      })
    ).toBe(
      samplingBucket({
        workspaceId: "workspace-1",
        ruleId: "rule-1",
        externalSource: "zendesk",
        externalId: "ticket-1"
      })
    );
  });

  it("applies the first matching rule in caller-provided order", () => {
    const decision = evaluateSamplingRules({
      workspaceId: "workspace-1",
      conversation: conversation(),
      rules: [
        {
          id: "rule-low",
          name: "Fallback",
          type: "manual",
          priority: 100,
          targetPercent: 100,
          conditionsJson: "{}"
        },
        {
          id: "rule-dsat",
          name: "Low CSAT refunds",
          type: "dsat",
          priority: 10,
          targetPercent: 100,
          conditionsJson: JSON.stringify({
            externalSource: "zendesk",
            tagsAny: ["refund"],
            supportLine: "Billing",
            csatScoreAtMost: 3
          })
        }
      ]
    });

    expect(decision).toMatchObject({
      matched: true,
      samplingType: "manual",
      ruleId: "rule-low",
      ruleName: "Fallback"
    });
    expect(applySamplingDecision(conversation(), decision).samplingReason).toContain("Fallback");
  });

  it("keeps caller sampling reason but forces random type when no rule matches", () => {
    const decision = evaluateSamplingRules({
      workspaceId: "workspace-1",
      conversation: conversation({ tags: ["general"], csatScore: 5, samplingType: "dsat" }),
      rules: [
        {
          id: "rule-dsat",
          name: "Low CSAT",
          type: "dsat",
          priority: 10,
          targetPercent: 100,
          conditionsJson: JSON.stringify({ csatScoreAtMost: 2 })
        }
      ]
    });

    expect(decision).toEqual(
      expect.objectContaining({
        matched: false,
        samplingType: "random",
        samplingReason: "Caller provided reason"
      })
    );
    expect(applySamplingDecision(conversation({ samplingType: "dsat" }), decision).samplingType).toBe("random");
  });

  it("does not fall through to a catch-all after a percentage exclusion", () => {
    // ticket-1 / rule-dsat bucket is deterministic; pick a targetPercent that excludes it.
    const bucket = samplingBucket({
      workspaceId: "workspace-1",
      ruleId: "rule-dsat",
      externalSource: "zendesk",
      externalId: "ticket-1"
    });
    const decision = evaluateSamplingRules({
      workspaceId: "workspace-1",
      conversation: conversation({ csatScore: 2 }),
      rules: [
        {
          id: "rule-dsat",
          name: "Low CSAT",
          type: "dsat",
          priority: 10,
          targetPercent: bucket, // exclude this exact bucket (>= targetPercent)
          conditionsJson: JSON.stringify({ csatScoreAtMost: 3 })
        },
        {
          id: "rule-catch-all",
          name: "Catch all",
          type: "manual",
          priority: 100,
          targetPercent: 100,
          conditionsJson: "{}"
        }
      ]
    });

    expect(decision).toMatchObject({
      matched: false,
      samplingType: "random",
      samplingReason: expect.stringContaining("Исключено процентом")
    });
  });

  it("honors the legacy conditions written by the sampling rule admin UI", () => {
    const decision = evaluateSamplingRules({
      workspaceId: "workspace-1",
      conversation: conversation({ tags: ["refund"], csatScore: 2 }),
      rules: [
        {
          id: "rule-ui",
          name: "UI CSAT rule",
          type: "csat",
          priority: 10,
          targetPercent: 100,
          conditionsJson: JSON.stringify({
            channel: "ticket",
            csatBucket: "NEGATIVE",
            supportLine: "Billing",
            tag: "refund"
          })
        }
      ]
    });

    expect(decision).toMatchObject({
      matched: true,
      samplingType: "dsat",
      ruleId: "rule-ui"
    });
  });
});
