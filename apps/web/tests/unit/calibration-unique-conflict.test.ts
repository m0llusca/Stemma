import { describe, expect, it } from "vitest";
import { isCalibrationReviewUniqueConflict } from "@/lib/review/calibration-unique-conflict";

describe("isCalibrationReviewUniqueConflict", () => {
  it("matches the calibration review unique fields", () => {
    expect(
      isCalibrationReviewUniqueConflict({
        code: "P2002",
        meta: { target: ["calibrationSessionId", "conversationId", "reviewerId"] }
      })
    ).toBe(true);
  });

  it("matches the named Postgres constraint", () => {
    expect(
      isCalibrationReviewUniqueConflict({
        code: "P2002",
        meta: { target: "Review_calibrationSessionId_conversationId_reviewerId_key" }
      })
    ).toBe(true);
  });

  it("ignores a different unique and a P2002 without a target", () => {
    expect(
      isCalibrationReviewUniqueConflict({
        code: "P2002",
        meta: { target: ["reviewId", "criterionId"] }
      })
    ).toBe(false);
    expect(isCalibrationReviewUniqueConflict({ code: "P2002" })).toBe(false);
    expect(isCalibrationReviewUniqueConflict({ code: "P2003", meta: { target: ["calibrationSessionId"] } })).toBe(false);
  });
});
