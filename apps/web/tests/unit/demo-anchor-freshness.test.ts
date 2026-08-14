import { describe, expect, it } from "vitest";
import {
  assertDemoAnchorIsFresh,
  checkDemoAnchorFreshness
} from "../e2e/helpers/demo-anchor-freshness";

// Moscow-offset aware fixtures: 09:00Z is 12:00 in Europe/Moscow, so these
// instants never straddle a Moscow day boundary.
const at = (isoDay: string) => new Date(`${isoDay}T09:00:00.000Z`);

describe("demo seed anchor freshness", () => {
  it("accepts an anchor from the same day", () => {
    expect(checkDemoAnchorFreshness(at("2026-08-14"), at("2026-08-14"))).toEqual({
      fresh: true
    });
  });

  it("accepts an anchor inside today's rolling seven-day window and 22-21 period", () => {
    // Both days sit in the 22.07-21.08 period; the anchor is 5 days back.
    expect(checkDemoAnchorFreshness(at("2026-08-09"), at("2026-08-14"))).toEqual({
      fresh: true
    });
  });

  it("rejects an anchor that fell out of the rolling seven-day window", () => {
    const result = checkDemoAnchorFreshness(at("2026-08-01"), at("2026-08-14"));

    expect(result.fresh).toBe(false);
    expect(result.fresh === false && result.reason).toMatch(
      /rolling seven-day window/
    );
  });

  it("rejects an anchor that belongs to the previous 22-21 period", () => {
    // 21.08 closes the current period; 22.08 opens the next one, so a run on
    // 22.08 against a 21.08 anchor renders the wrong vk-current heading even
    // though the anchor is only one day old.
    const result = checkDemoAnchorFreshness(at("2026-08-21"), at("2026-08-22"));

    expect(result.fresh).toBe(false);
    expect(result.fresh === false && result.reason).toMatch(/22-21 period/);
  });

  it("rejects an anchor more than a day ahead of the wall clock", () => {
    const result = checkDemoAnchorFreshness(at("2026-08-17"), at("2026-08-14"));

    expect(result.fresh).toBe(false);
    expect(result.fresh === false && result.reason).toMatch(/in the future/);
  });

  it("tolerates an anchor that leads the clock by less than a day", () => {
    // Pinning "today 09:00Z" and running at 08:00Z must not fail the suite.
    expect(
      checkDemoAnchorFreshness(
        new Date("2026-08-14T09:00:00.000Z"),
        new Date("2026-08-14T08:00:00.000Z")
      )
    ).toEqual({ fresh: true });
  });

  it("throws an actionable re-anchoring instruction when stale", () => {
    expect(() => assertDemoAnchorIsFresh(at("2026-08-01"), at("2026-08-14"))).toThrow(
      /Stale DEMO_SEED_NOW anchor[\s\S]*playwright\.config\.ts[\s\S]*--update-snapshots/
    );
  });

  it("stays silent when the anchor is fresh", () => {
    expect(() => assertDemoAnchorIsFresh(at("2026-08-14"), at("2026-08-14"))).not.toThrow();
  });
});
