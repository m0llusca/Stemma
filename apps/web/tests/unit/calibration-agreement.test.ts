import { describe, expect, it } from "vitest";
import { computeCalibrationItemAgreement } from "@/lib/calibration/agreement";

const criteria = [
  { id: "c1", kind: "SCALE_1_3" as const },
  { id: "c2", kind: "SCALE_1_3" as const },
  { id: "c3", kind: "PASS_FAIL" as const },
  { id: "c4", kind: "PASS_FAIL" as const }
];

function scale(criterionId: string, value: number | null) {
  return { criterionId, value, passed: null, isNotApplicable: false };
}

function pass(criterionId: string, passed: boolean | null) {
  return { criterionId, value: null, passed, isNotApplicable: false };
}

function na(criterionId: string) {
  return { criterionId, value: null, passed: null, isNotApplicable: true };
}

describe("computeCalibrationItemAgreement", () => {
  it("reports full agreement when participants score a scale criterion identically", () => {
    const result = computeCalibrationItemAgreement({
      criteria: [{ id: "c1", kind: "SCALE_1_3" }],
      participants: [{ scores: [scale("c1", 3)] }, { scores: [scale("c1", 3)] }, { scores: [scale("c1", 3)] }]
    });

    const c1 = result.criteria.find((entry) => entry.criterionId === "c1");
    expect(c1).toMatchObject({ participantCount: 3, agreementRate: 1, scaleSpread: 0, matchesBaseline: null });
    expect(result.overallAgreementRate).toBe(1);
    expect(result.misalignedCriteria).toBe(0);
  });

  it("reports a split with the modal rate and the numeric spread", () => {
    const result = computeCalibrationItemAgreement({
      criteria: [{ id: "c1", kind: "SCALE_1_3" }],
      participants: [{ scores: [scale("c1", 1)] }, { scores: [scale("c1", 3)] }]
    });

    const c1 = result.criteria.find((entry) => entry.criterionId === "c1");
    expect(c1?.participantCount).toBe(2);
    expect(c1?.agreementRate).toBeCloseTo(0.5, 5);
    expect(c1?.scaleSpread).toBe(2);
    expect(result.misalignedCriteria).toBe(1);
  });

  it("computes agreement for pass/fail criteria", () => {
    const result = computeCalibrationItemAgreement({
      criteria: [{ id: "c3", kind: "PASS_FAIL" }],
      participants: [{ scores: [pass("c3", true)] }, { scores: [pass("c3", true)] }, { scores: [pass("c3", false)] }]
    });

    const c3 = result.criteria.find((entry) => entry.criterionId === "c3");
    expect(c3?.participantCount).toBe(3);
    expect(c3?.agreementRate).toBeCloseTo(2 / 3, 5);
    expect(c3?.scaleSpread).toBeNull();
    expect(result.misalignedCriteria).toBe(1);
  });

  it("treats N/A as its own answer and skips participants with no score row", () => {
    const result = computeCalibrationItemAgreement({
      criteria: [{ id: "c3", kind: "PASS_FAIL" }],
      // p1 answered N/A, p2 answered N/A, p3 answered passed, p4 has no row for c3.
      participants: [
        { scores: [na("c3")] },
        { scores: [na("c3")] },
        { scores: [pass("c3", true)] },
        { scores: [scale("cX", 2)] }
      ]
    });

    const c3 = result.criteria.find((entry) => entry.criterionId === "c3");
    expect(c3?.participantCount).toBe(3); // p4 skipped
    expect(c3?.agreementRate).toBeCloseTo(2 / 3, 5); // modal answer is "NA" (2 of 3)
  });

  it("marks the modal answer as matching the baseline", () => {
    const result = computeCalibrationItemAgreement({
      criteria: [{ id: "c1", kind: "SCALE_1_3" }],
      participants: [{ scores: [scale("c1", 3)] }, { scores: [scale("c1", 3)] }],
      baseline: { scores: [scale("c1", 3)] }
    });

    expect(result.criteria[0].matchesBaseline).toBe(true);
  });

  it("marks the modal answer as not matching a divergent baseline", () => {
    const result = computeCalibrationItemAgreement({
      criteria: [{ id: "c1", kind: "SCALE_1_3" }],
      participants: [{ scores: [scale("c1", 3)] }, { scores: [scale("c1", 3)] }],
      baseline: { scores: [scale("c1", 2)] }
    });

    expect(result.criteria[0].matchesBaseline).toBe(false);
  });

  it("matches an N/A baseline against an N/A modal answer", () => {
    const result = computeCalibrationItemAgreement({
      criteria: [{ id: "c3", kind: "PASS_FAIL" }],
      participants: [{ scores: [na("c3")] }, { scores: [na("c3")] }],
      baseline: { scores: [na("c3")] }
    });

    expect(result.criteria[0].matchesBaseline).toBe(true);
  });

  it("returns a null rate and null baseline match for a single participant", () => {
    const result = computeCalibrationItemAgreement({
      criteria: [{ id: "c1", kind: "SCALE_1_3" }],
      participants: [{ scores: [scale("c1", 3)] }],
      baseline: { scores: [scale("c1", 3)] }
    });

    const c1 = result.criteria[0];
    expect(c1.participantCount).toBe(1);
    expect(c1.agreementRate).toBeNull();
    expect(c1.scaleSpread).toBeNull(); // needs >= 2 numeric answers
    expect(c1.matchesBaseline).toBeNull(); // no modal without a rate
    expect(result.overallAgreementRate).toBeNull();
    expect(result.misalignedCriteria).toBe(0);
  });

  it("has no baseline match when no baseline is supplied", () => {
    const result = computeCalibrationItemAgreement({
      criteria: [{ id: "c1", kind: "SCALE_1_3" }],
      participants: [{ scores: [scale("c1", 3)] }, { scores: [scale("c1", 3)] }],
      baseline: null
    });

    expect(result.criteria[0].matchesBaseline).toBeNull();
  });

  it("aggregates overall agreement and counts misaligned criteria across a mixed item", () => {
    const result = computeCalibrationItemAgreement({
      criteria,
      participants: [
        // c1 unanimous (rate 1), c2 split (rate 0.5), c3 unanimous pass (rate 1),
        // c4 majority fail (rate 2/3 ≈ 0.667 -> misaligned).
        { scores: [scale("c1", 3), scale("c2", 1), pass("c3", true), pass("c4", false)] },
        { scores: [scale("c1", 3), scale("c2", 3), pass("c3", true), pass("c4", false)] },
        { scores: [scale("c1", 3), scale("c2", 3), pass("c3", true), pass("c4", true)] }
      ],
      baseline: { scores: [scale("c1", 3), scale("c2", 2), pass("c3", true), pass("c4", false)] }
    });

    const byId = new Map(result.criteria.map((entry) => [entry.criterionId, entry]));
    expect(byId.get("c1")).toMatchObject({ agreementRate: 1, matchesBaseline: true });
    expect(byId.get("c2")).toMatchObject({ scaleSpread: 2, matchesBaseline: false });
    expect(byId.get("c2")?.agreementRate).toBeCloseTo(2 / 3, 5); // modal answer 3 (2 of 3)
    expect(byId.get("c3")).toMatchObject({ agreementRate: 1, matchesBaseline: true });
    expect(byId.get("c4")?.agreementRate).toBeCloseTo(2 / 3, 5);

    // overall = mean(1, 2/3, 1, 2/3)
    expect(result.overallAgreementRate).toBeCloseTo((1 + 2 / 3 + 1 + 2 / 3) / 4, 5);
    // misaligned: c2 (2/3) and c4 (2/3) both < 0.75.
    expect(result.misalignedCriteria).toBe(2);
  });

  it("returns null overall agreement when nothing has enough participants", () => {
    const result = computeCalibrationItemAgreement({
      criteria,
      participants: [{ scores: [scale("c1", 3), pass("c3", true)] }]
    });

    expect(result.overallAgreementRate).toBeNull();
    expect(result.misalignedCriteria).toBe(0);
  });
});
