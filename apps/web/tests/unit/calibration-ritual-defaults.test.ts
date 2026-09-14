import { describe, expect, it } from "vitest";
import {
  CALIBRATION_ALIGNMENT_BAND,
  CALIBRATION_RITUAL_DEFAULT_NAME,
  calibrationRitualHints,
  defaultCalibrationDueDate
} from "@/lib/calibration/ritual-defaults";

describe("calibration ritual defaults", () => {
  it("defaults due date one week ahead", () => {
    expect(defaultCalibrationDueDate(new Date("2026-09-14T12:00:00.000Z"))).toBe("2026-09-21");
  });

  it("flags undersized weekly rituals", () => {
    expect(
      calibrationRitualHints({ conversationCount: 1, participantCount: 1 }).ready
    ).toBe(false);
    expect(
      calibrationRitualHints({ conversationCount: 3, participantCount: 2 }).ready
    ).toBe(true);
    expect(CALIBRATION_ALIGNMENT_BAND).toBe(10);
    expect(CALIBRATION_RITUAL_DEFAULT_NAME).toContain("Калибровка");
  });
});
