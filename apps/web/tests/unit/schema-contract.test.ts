import { describe, expect, it } from "vitest";
import { schemaContractGaps } from "@/lib/db/schema-contract";

describe("schemaContractGaps", () => {
  it("is empty when the calibration column and OUT_OF_SAMPLE check exist", () => {
    expect(
      schemaContractGaps({
        reviewColumns: ["calibrationSessionId"],
        samplingCheck: "CHECK ((samplingType = ANY (ARRAY['RANDOM'::text, 'OUT_OF_SAMPLE'::text])))"
      })
    ).toEqual([]);
  });

  it("names both gaps when the migrate-first contract is missing", () => {
    expect(
      schemaContractGaps({
        reviewColumns: [],
        samplingCheck: "CHECK (\"samplingType\" IN ('RANDOM', 'MANUAL'))"
      })
    ).toEqual(["review.calibrationSessionId", "conversation.samplingType.OUT_OF_SAMPLE"]);
  });

  it("fails closed when the sampling check row is absent", () => {
    expect(
      schemaContractGaps({
        reviewColumns: ["calibrationSessionId"],
        samplingCheck: null
      })
    ).toEqual(["conversation.samplingType.OUT_OF_SAMPLE"]);
  });
});
