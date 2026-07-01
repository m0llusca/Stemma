import { describe, expect, it } from "vitest";
import { aggregateAiHumanAgreement, computeAiHumanAgreement } from "@/lib/ai-quality/agreement";

const criteria = [
  { id: "c1", kind: "SCALE_1_3" as const },
  { id: "c2", kind: "SCALE_1_3" as const },
  { id: "c3", kind: "PASS_FAIL" as const },
  { id: "c4", kind: "PASS_FAIL" as const },
  { id: "c5", kind: "SCALE_1_3" as const }
];

describe("computeAiHumanAgreement", () => {
  it("compares human review scores against AI predictions per criterion", () => {
    const result = computeAiHumanAgreement({
      criteria,
      human: [
        { criterionId: "c1", value: 3, passed: null, isNotApplicable: false },
        { criterionId: "c2", value: 2, passed: null, isNotApplicable: false },
        { criterionId: "c3", value: null, passed: true, isNotApplicable: false },
        { criterionId: "c4", value: null, passed: null, isNotApplicable: true }
        // c5: no human score -> not comparable
      ],
      ai: [
        { criterionId: "c1", value: 3, confidence: 0.9 },
        { criterionId: "c2", value: 3, confidence: 0.8 },
        { criterionId: "c3", passed: false, confidence: 0.7 },
        { criterionId: "c4", isNotApplicable: true, confidence: 0.6 },
        { criterionId: "c5", value: 1, confidence: 0.5 }
      ]
    });

    expect(result.comparedCount).toBe(4);
    expect(result.agreeCount).toBe(2); // c1 (3==3), c4 (both N/A)
    expect(result.agreementRate).toBeCloseTo(0.5, 5);
    expect(result.meanScaleDelta).toBeCloseTo(0.5, 5); // c1 delta 0, c2 delta 1

    const byId = new Map(result.criteria.map((c) => [c.criterionId, c]));
    expect(byId.get("c1")).toMatchObject({ comparable: true, agree: true, scaleDelta: 0, aiConfidence: 0.9 });
    expect(byId.get("c2")).toMatchObject({ comparable: true, agree: false, scaleDelta: 1 });
    expect(byId.get("c3")).toMatchObject({ comparable: true, agree: false, humanPassed: true, aiPassed: false });
    expect(byId.get("c4")).toMatchObject({ comparable: true, agree: true });
    expect(byId.get("c5")).toMatchObject({ comparable: false, agree: null });
  });

  it("treats a one-sided N/A as disagreement", () => {
    const result = computeAiHumanAgreement({
      criteria: [{ id: "c1", kind: "SCALE_1_3" }],
      human: [{ criterionId: "c1", value: null, passed: null, isNotApplicable: true }],
      ai: [{ criterionId: "c1", value: 3, confidence: 0.9 }]
    });
    expect(result.comparedCount).toBe(1);
    expect(result.agreeCount).toBe(0);
    expect(result.criteria[0].agree).toBe(false);
  });

  it("returns null rates when nothing is comparable", () => {
    const result = computeAiHumanAgreement({
      criteria: [{ id: "c1", kind: "SCALE_1_3" }],
      human: [{ criterionId: "c1", value: 3, passed: null, isNotApplicable: false }],
      ai: [] // no AI prediction
    });
    expect(result.comparedCount).toBe(0);
    expect(result.agreementRate).toBeNull();
    expect(result.meanScaleDelta).toBeNull();
    expect(result.criteria[0].comparable).toBe(false);
  });
});

describe("aggregateAiHumanAgreement", () => {
  const scorecard = [
    { id: "a", kind: "SCALE_1_3" as const },
    { id: "b", kind: "PASS_FAIL" as const }
  ];

  it("rolls up per-conversation agreements by criterion with sample sizes", () => {
    const conv1 = computeAiHumanAgreement({
      criteria: scorecard,
      human: [
        { criterionId: "a", value: 3, passed: null, isNotApplicable: false },
        { criterionId: "b", value: null, passed: true, isNotApplicable: false }
      ],
      ai: [
        { criterionId: "a", value: 3, confidence: 0.9 },
        { criterionId: "b", passed: true, confidence: 0.8 }
      ]
    });
    const conv2 = computeAiHumanAgreement({
      criteria: scorecard,
      human: [
        { criterionId: "a", value: 2, passed: null, isNotApplicable: false },
        { criterionId: "b", value: null, passed: true, isNotApplicable: false }
      ],
      ai: [
        { criterionId: "a", value: 3, confidence: 0.7 },
        { criterionId: "b", passed: false, confidence: 0.6 }
      ]
    });

    const agg = aggregateAiHumanAgreement([conv1, conv2]);

    expect(agg.conversationsCompared).toBe(2);
    expect(agg.comparedCount).toBe(4);
    expect(agg.agreeCount).toBe(2);
    expect(agg.agreementRate).toBeCloseTo(0.5, 5);

    const byId = new Map(agg.byCriterion.map((entry) => [entry.criterionId, entry]));
    expect(byId.get("a")).toMatchObject({ comparedCount: 2, agreeCount: 1, meanScaleDelta: 0.5 });
    expect(byId.get("a")?.agreementRate).toBeCloseTo(0.5, 5);
    expect(byId.get("b")).toMatchObject({ comparedCount: 2, agreeCount: 1, meanScaleDelta: null });
  });

  it("ignores conversations with nothing comparable", () => {
    const empty = computeAiHumanAgreement({
      criteria: scorecard,
      human: [{ criterionId: "a", value: 3, passed: null, isNotApplicable: false }],
      ai: []
    });
    const agg = aggregateAiHumanAgreement([empty]);
    expect(agg.conversationsCompared).toBe(0);
    expect(agg.comparedCount).toBe(0);
    expect(agg.agreementRate).toBeNull();
    expect(agg.byCriterion).toHaveLength(0);
  });
});
