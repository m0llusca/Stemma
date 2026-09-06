import { describe, expect, it, vi } from "vitest";
import {
  buildReviewerWorkloadRows,
  loadReviewerWorkload,
  reviewerWorkloadHref
} from "@/lib/reviewer-workload";

describe("buildReviewerWorkloadRows", () => {
  it("sums QUEUED + IN_PROGRESS and sorts by open load desc", () => {
    const rows = buildReviewerWorkloadRows(
      [
        { id: "u-1", name: "Анна" },
        { id: "u-2", name: "Борис" },
        { id: "u-3", name: "Виктор" }
      ],
      {
        Анна: { queued: 2, inProgress: 1 },
        Борис: { queued: 0, inProgress: 5 },
        Виктор: { queued: 0, inProgress: 0 }
      }
    );

    expect(rows.map((row) => row.name)).toEqual(["Борис", "Анна", "Виктор"]);
    expect(rows[0]).toMatchObject({ openCount: 5, queuedCount: 0, inProgressCount: 5 });
    expect(rows[1]).toMatchObject({ openCount: 3, queuedCount: 2, inProgressCount: 1 });
  });

  it("treats missing load entries as zero", () => {
    const rows = buildReviewerWorkloadRows([{ id: "u-1", name: "Анна" }], {});
    expect(rows[0]).toMatchObject({ openCount: 0, queuedCount: 0, inProgressCount: 0 });
  });
});

describe("reviewerWorkloadHref", () => {
  it("links open load via qaAssignee + unreviewed, or a single qaStatus", () => {
    expect(reviewerWorkloadHref("Мария")).toBe(
      "/reviews?qaAssignee=%D0%9C%D0%B0%D1%80%D0%B8%D1%8F&status=unreviewed"
    );
    expect(reviewerWorkloadHref("Мария", "QUEUED")).toBe(
      "/reviews?qaAssignee=%D0%9C%D0%B0%D1%80%D0%B8%D1%8F&qaStatus=QUEUED"
    );
    expect(reviewerWorkloadHref("Мария", "IN_PROGRESS")).toBe(
      "/reviews?qaAssignee=%D0%9C%D0%B0%D1%80%D0%B8%D1%8F&qaStatus=IN_PROGRESS"
    );
  });
});

describe("loadReviewerWorkload", () => {
  it("loads active reviewer-role users and groups open assignment counts", async () => {
    const findMany = vi.fn(async () => [
      { id: "u-1", name: "Анна" },
      { id: "u-2", name: "Борис" }
    ]);
    const groupBy = vi.fn(async () => [
      { qaAssigneeName: "Анна", qaStatus: "QUEUED", _count: { _all: 2 } },
      { qaAssigneeName: "Анна", qaStatus: "IN_PROGRESS", _count: { _all: 1 } },
      { qaAssigneeName: "Борис", qaStatus: "QUEUED", _count: { _all: 0 } },
      { qaAssigneeName: "Борис", qaStatus: "IN_PROGRESS", _count: { _all: 4 } }
    ]);

    const rows = await loadReviewerWorkload("ws-1", {
      user: { findMany },
      conversation: { groupBy }
    } as never);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: "ws-1",
          role: { in: expect.arrayContaining(["QA_ANALYST", "ADMIN", "TEAM_LEAD"]) }
        })
      })
    );
    expect(groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          qaStatus: { in: expect.arrayContaining(["QUEUED", "IN_PROGRESS"]) }
        })
      })
    );
    expect(rows[0]).toMatchObject({ name: "Борис", openCount: 4, inProgressCount: 4 });
    expect(rows[1]).toMatchObject({ name: "Анна", openCount: 3, queuedCount: 2 });
  });

  it("returns an empty list when there are no eligible reviewers", async () => {
    const rows = await loadReviewerWorkload("ws-1", {
      user: { findMany: vi.fn(async () => []) },
      conversation: { groupBy: vi.fn() }
    } as never);

    expect(rows).toEqual([]);
  });
});
