import { describe, expect, it } from "vitest";
import {
  LAST_VISIT_STORAGE_KEY,
  WELCOME_BACK_ABSENCE_DAYS,
  canonicalizeQueueViewHref,
  findForeignWorkspaceQueueView,
  findQueueFilterTrap,
  isDay1TourDismissed,
  isForeignWorkspaceQueueView,
  parseLastVisit,
  shouldShowWelcomeBack,
  welcomeBackTrapCopy,
  welcomeBackWouldShowFromStorage
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

  it("names workspace and private saved views, and flags ad-hoc filters off role-home", () => {
    const resetHref = "/reviews?qaAssignee=%D0%90%D0%BD%D0%BD%D0%B0%20QA&due=overdue";
    const savedViews = [
      { name: "Мои просроченные", href: resetHref, scope: "private" },
      { name: "Мой чат", href: "/reviews?channel=CHAT", scope: "private" },
      { name: "Критические за период", href: "/reviews?process=critical", scope: "workspace" }
    ];

    expect(findQueueFilterTrap(resetHref, resetHref, savedViews)).toBeUndefined();
    expect(findQueueFilterTrap("/reviews?process=critical", resetHref, savedViews)).toEqual({
      kind: "workspace",
      name: "Критические за период"
    });
    expect(findQueueFilterTrap("/reviews?channel=CHAT", resetHref, savedViews)).toEqual({
      kind: "private",
      name: "Мой чат"
    });
    expect(findQueueFilterTrap("/reviews?channel=EMAIL", resetHref, savedViews)).toEqual({
      kind: "adhoc"
    });
    expect(findQueueFilterTrap("/reviews?channel=EMAIL", resetHref, [])).toEqual({ kind: "adhoc" });
  });

  it("writes honest trap copy for named views and unnamed ad-hoc filters", () => {
    expect(welcomeBackTrapCopy({ kind: "workspace", name: "Критические за период" })).toContain(
      "общий вид «Критические за период»"
    );
    expect(welcomeBackTrapCopy({ kind: "private", name: "Мой чат" })).toContain("сохранённый вид «Мой чат»");
    expect(welcomeBackTrapCopy({ kind: "adhoc" })).toContain("текущие фильтры не совпадают с очередью дня");
    expect(welcomeBackTrapCopy({ kind: "workspace" })).toContain("текущие фильтры не совпадают с очередью дня");
    expect(welcomeBackTrapCopy()).toContain("сохранённые фильтры могли устареть");
  });

  it("reads welcome-back eligibility from lastVisit storage", () => {
    const stale = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
    const recent = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

    window.localStorage.setItem(LAST_VISIT_STORAGE_KEY, stale);
    expect(welcomeBackWouldShowFromStorage()).toBe(true);

    window.localStorage.setItem(LAST_VISIT_STORAGE_KEY, recent);
    expect(welcomeBackWouldShowFromStorage()).toBe(false);

    window.localStorage.removeItem(LAST_VISIT_STORAGE_KEY);
    expect(welcomeBackWouldShowFromStorage()).toBe(false);
  });
});
