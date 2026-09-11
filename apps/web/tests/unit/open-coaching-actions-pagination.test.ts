import { describe, expect, it } from "vitest";
import {
  openCoachingActionsPageHref,
  openCoachingActionsPageSize,
  paginateOpenCoachingActions,
  parseOpenCoachingActionsPage
} from "@/lib/coaching/open-actions-pagination";

describe("parseOpenCoachingActionsPage", () => {
  it("defaults to page 1 for missing or junk values", () => {
    expect(parseOpenCoachingActionsPage(undefined)).toBe(1);
    expect(parseOpenCoachingActionsPage("")).toBe(1);
    expect(parseOpenCoachingActionsPage("0")).toBe(1);
    expect(parseOpenCoachingActionsPage("-2")).toBe(1);
    expect(parseOpenCoachingActionsPage("abc")).toBe(1);
  });

  it("reads a positive page and the first array entry", () => {
    expect(parseOpenCoachingActionsPage("3")).toBe(3);
    expect(parseOpenCoachingActionsPage(["2", "9"])).toBe(2);
  });
});

describe("paginateOpenCoachingActions", () => {
  const items = Array.from({ length: 12 }, (_, index) => ({ id: String(index + 1) }));

  it("returns the requested slice without reordering", () => {
    const page = paginateOpenCoachingActions(items, 1, 5);

    expect(page.items.map((item) => item.id)).toEqual(["1", "2", "3", "4", "5"]);
    expect(page).toMatchObject({ page: 1, pageSize: 5, pageCount: 3, total: 12, hasMore: true });
  });

  it("slices the middle and last pages", () => {
    expect(paginateOpenCoachingActions(items, 2, 5).items.map((item) => item.id)).toEqual([
      "6",
      "7",
      "8",
      "9",
      "10"
    ]);

    const last = paginateOpenCoachingActions(items, 3, 5);
    expect(last.items.map((item) => item.id)).toEqual(["11", "12"]);
    expect(last.hasMore).toBe(false);
  });

  it("clamps an out-of-range page to the last page", () => {
    const page = paginateOpenCoachingActions(items, 99, 5);
    expect(page.page).toBe(3);
    expect(page.items.map((item) => item.id)).toEqual(["11", "12"]);
  });

  it("treats an empty list as a single empty page", () => {
    expect(paginateOpenCoachingActions([], 1, openCoachingActionsPageSize)).toEqual({
      items: [],
      page: 1,
      pageSize: openCoachingActionsPageSize,
      pageCount: 1,
      total: 0,
      hasMore: false
    });
  });
});

describe("openCoachingActionsPageHref", () => {
  it("omits actionsPage on the first page and preserves filters", () => {
    expect(
      openCoachingActionsPageHref(1, {
        view: "active",
        q: "политика",
        assigneeId: "user-1",
        category: "Маршрутизация"
      })
    ).toBe("/coaching?view=active&q=%D0%BF%D0%BE%D0%BB%D0%B8%D1%82%D0%B8%D0%BA%D0%B0&assigneeId=user-1&category=%D0%9C%D0%B0%D1%80%D1%88%D1%80%D1%83%D1%82%D0%B8%D0%B7%D0%B0%D1%86%D0%B8%D1%8F");
  });

  it("adds actionsPage for later pages", () => {
    expect(
      openCoachingActionsPageHref(2, {
        view: "overdue",
        q: "",
        assigneeId: "",
        category: ""
      })
    ).toBe("/coaching?view=overdue&actionsPage=2");
  });
});
