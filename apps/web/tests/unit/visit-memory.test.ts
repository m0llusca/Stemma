import { describe, expect, it } from "vitest";
import {
  WELCOME_BACK_ABSENCE_DAYS,
  isDay1TourDismissed,
  parseLastVisit,
  shouldShowWelcomeBack
} from "@/lib/guidance/visit-memory";

describe("visit-memory", () => {
  it("parses ISO lastVisit and rejects junk", () => {
    expect(parseLastVisit("2026-01-01T00:00:00.000Z")?.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(parseLastVisit(null)).toBeNull();
    expect(parseLastVisit("not-a-date")).toBeNull();
    expect(parseLastVisit("   ")).toBeNull();
  });

  it("shows welcome-back only after the absence threshold", () => {
    const now = new Date("2026-09-04T12:00:00.000Z");
    const recent = new Date("2026-08-20T12:00:00.000Z");
    const stale = new Date("2026-08-04T12:00:00.000Z");

    expect(shouldShowWelcomeBack(now, null)).toBe(false);
    expect(shouldShowWelcomeBack(now, recent, WELCOME_BACK_ABSENCE_DAYS)).toBe(false);
    expect(shouldShowWelcomeBack(now, stale, WELCOME_BACK_ABSENCE_DAYS)).toBe(true);
  });

  it("treats day-1 tour dismiss flag as binary", () => {
    expect(isDay1TourDismissed("1")).toBe(true);
    expect(isDay1TourDismissed(null)).toBe(false);
    expect(isDay1TourDismissed("0")).toBe(false);
  });
});
