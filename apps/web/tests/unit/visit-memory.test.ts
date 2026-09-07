import { describe, expect, it } from "vitest";
import {
  WELCOME_BACK_ABSENCE_DAYS,
  canonicalizeQueueViewHref,
  findForeignWorkspaceQueueView,
  isDay1TourDismissed,
  isForeignWorkspaceQueueView,
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

  it("canonicalizes queue hrefs without page/empty/saved noise", () => {
    expect(canonicalizeQueueViewHref("/reviews?process=critical&empty=1&page=2")).toBe(
      "/reviews?process=critical"
    );
    expect(canonicalizeQueueViewHref("/reviews?saved=1")).toBe("/reviews");
    expect(canonicalizeQueueViewHref("/reviews?due=overdue&qaAssignee=Анна")).toBe(
      "/reviews?due=overdue&qaAssignee=%D0%90%D0%BD%D0%BD%D0%B0"
    );
  });

  it("flags a workspace saved view that is not the role-home reset", () => {
    const resetHref = "/reviews?qaAssignee=%D0%90%D0%BD%D0%BD%D0%B0%20QA&due=overdue";
    const savedViews = [
      { name: "Мои просроченные", href: resetHref, scope: "private" },
      { name: "Критические за период", href: "/reviews?process=critical", scope: "workspace" }
    ];

    expect(isForeignWorkspaceQueueView("/reviews?process=critical", resetHref, savedViews)).toBe(true);
    expect(
      findForeignWorkspaceQueueView("/reviews?process=critical&empty=1", resetHref, savedViews)?.name
    ).toBe("Критические за период");
    expect(isForeignWorkspaceQueueView(resetHref, resetHref, savedViews)).toBe(false);
    expect(isForeignWorkspaceQueueView("/reviews", resetHref, savedViews)).toBe(false);
    expect(isForeignWorkspaceQueueView("/reviews?process=critical", "/reviews", [])).toBe(false);
  });
});
