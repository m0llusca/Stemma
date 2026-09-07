import { createDemoCalendar } from "../../../prisma/demo-calendar";

/**
 * The e2e suite seeds the verify database at `DEMO_SEED_NOW` (Moscow noon of
 * today, see `freshDemoSeedAnchor`) so date labels stay stable within a day,
 * while the running app computes rolling windows and 22-21 report periods from
 * the real wall clock. Those two clocks agree only while the anchor stays
 * inside today's windows; a hardcoded date that falls out turns into zero
 * weekly activity and the wrong report heading, minutes into a full run.
 *
 * This guard turns that silent rot into one immediate, actionable failure.
 */

const dayMs = 24 * 60 * 60 * 1000;

/** The anchor may lead the wall clock by at most this much (early-morning runs). */
const maxLeadMs = dayMs;

export type DemoAnchorFreshness =
  | Readonly<{ fresh: true }>
  | Readonly<{ fresh: false; reason: string }>;

function formatDay(value: Date) {
  return value.toISOString().slice(0, 10);
}

/**
 * Checks a pinned demo seed anchor against the real clock the app renders from.
 */
export function checkDemoAnchorFreshness(
  anchor: Date,
  now: Date
): DemoAnchorFreshness {
  const anchorCalendar = createDemoCalendar(anchor);
  const nowCalendar = createDemoCalendar(now);

  if (anchor.getTime() - now.getTime() > maxLeadMs) {
    return {
      fresh: false,
      reason: `anchor ${formatDay(anchor)} is in the future relative to ${formatDay(now)}; seeded "recent" activity would not exist yet`
    };
  }

  if (
    anchorCalendar.currentVkPeriod.start.getTime() !==
    nowCalendar.currentVkPeriod.start.getTime()
  ) {
    return {
      fresh: false,
      reason: `anchor ${formatDay(anchor)} belongs to the 22-21 period starting ${formatDay(anchorCalendar.currentVkPeriod.start)}, but today (${formatDay(now)}) resolves vk-current to the period starting ${formatDay(nowCalendar.currentVkPeriod.start)}`
    };
  }

  if (
    anchorCalendar.startOfToday.getTime() <
    nowCalendar.rollingSevenDaysStart.getTime()
  ) {
    return {
      fresh: false,
      reason: `anchor day ${formatDay(anchorCalendar.startOfToday)} is older than today's rolling seven-day window, which starts ${formatDay(nowCalendar.rollingSevenDaysStart)}; dashboard weekly metrics would seed as zero`
    };
  }

  return { fresh: true };
}

/**
 * Fails the whole Playwright run up front instead of letting a stale anchor
 * surface as a handful of confusing spec failures.
 */
export function assertDemoAnchorIsFresh(anchor: Date, now: Date): void {
  const result = checkDemoAnchorFreshness(anchor, now);
  if (result.fresh) {
    return;
  }

  throw new Error(
    [
      `Stale DEMO_SEED_NOW anchor: ${result.reason}.`,
      "freshDemoSeedAnchor() in apps/web/playwright.config.ts should track today;",
      "if you overrode DEMO_SEED_NOW, pick a same-day 09:00Z instant,",
      "then regenerate the visual baselines (`npx playwright test --project=chromium",
      "tests/e2e/appearance-visual.spec.ts --update-snapshots`) and re-run the suite."
    ].join(" ")
  );
}
