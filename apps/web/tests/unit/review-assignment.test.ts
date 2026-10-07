import { describe, expect, it, vi } from "vitest";
import { accumulateOpenAssignmentLoad, assignReviewerForConversation, selectLeastLoadedReviewer } from "@/lib/review-assignment";

describe("selectLeastLoadedReviewer", () => {
  it("returns null when there are no candidates", () => {
    expect(selectLeastLoadedReviewer([], {})).toBeNull();
  });

  it("picks the candidate with the lowest current load", () => {
    const candidates = [
      { id: "u-1", name: "Анна" },
      { id: "u-2", name: "Борис" },
      { id: "u-3", name: "Виктор" }
    ];
    const loadById = { "u-1": 5, "u-2": 2, "u-3": 9 };

    expect(selectLeastLoadedReviewer(candidates, loadById)).toEqual({ id: "u-2", name: "Борис" });
  });

  it("treats missing load entries as zero", () => {
    const candidates = [
      { id: "u-1", name: "Анна" },
      { id: "u-2", name: "Борис" }
    ];
    const loadById = { "u-1": 3 };

    expect(selectLeastLoadedReviewer(candidates, loadById)).toEqual({ id: "u-2", name: "Борис" });
  });

  it("breaks ties deterministically by name", () => {
    const candidates = [
      { id: "u-3", name: "Виктор" },
      { id: "u-1", name: "Анна" },
      { id: "u-2", name: "Борис" }
    ];
    const loadById = { "u-1": 4, "u-2": 4, "u-3": 4 };

    expect(selectLeastLoadedReviewer(candidates, loadById)).toEqual({ id: "u-1", name: "Анна" });
  });

  it("keeps equal display names independent and breaks their ties by id", () => {
    const candidates = [{ id: "u-2", name: "Анна" }, { id: "u-1", name: "Анна" }];
    expect(selectLeastLoadedReviewer(candidates, { "u-1": 5, "u-2": 1 })?.id).toBe("u-2");
    expect(selectLeastLoadedReviewer(candidates, {} )?.id).toBe("u-1");
  });
});

describe("accumulateOpenAssignmentLoad", () => {
  const users = [
    { id: "u-1", name: "Анна" },
    { id: "u-2", name: "Анна" },
    { id: "u-3", name: "Борис" }
  ];

  it("counts a name-only row for every reviewer with that name", () => {
    const loads = accumulateOpenAssignmentLoad(users, [
      { qaAssigneeId: null, qaAssigneeName: "Анна", qaStatus: "QUEUED", _count: { _all: 2 } }
    ]);

    expect(loads.get("u-1")).toMatchObject({ queued: 2, open: 2 });
    expect(loads.get("u-2")).toMatchObject({ queued: 2, open: 2 });
    expect(loads.get("u-3")?.open).toBe(0);
  });

  it("does not add an id-owned row to the name bucket", () => {
    const loads = accumulateOpenAssignmentLoad(users, [
      { qaAssigneeId: "u-1", qaAssigneeName: "Анна", qaStatus: "IN_PROGRESS", _count: { _all: 3 } }
    ]);

    expect(loads.get("u-1")).toMatchObject({ inProgress: 3, open: 3 });
    expect(loads.get("u-2")?.open).toBe(0);
  });
});

describe("assignReviewerForConversation", () => {
  function makeClient(options: {
    users?: { id: string; name: string }[];
    counts?: Record<string, number>;
  }) {
    const users = options.users ?? [];
    const counts = options.counts ?? {};
    const findMany = vi.fn(
      async (_args: { where: { workspaceId: string; lifecycleStatus: string; role: { in: string[] } } }) => users
    );
    const groupBy = vi.fn(async (_args: { where: { workspaceId: string; qaStatus: { in: string[] } } }) => Object.entries(counts).map(([qaAssigneeId, count]) => ({ qaAssigneeId, _count: { _all: count } })));

    return {
      client: { user: { findMany }, conversation: { groupBy } },
      findMany,
      groupBy
    };
  }

  it("loads active reviewer-role users scoped to the workspace", async () => {
    const { client, findMany } = makeClient({
      users: [{ id: "u-1", name: "Анна" }]
    });

    await assignReviewerForConversation("workspace-1", client as never);

    const where = findMany.mock.calls[0][0].where;
    expect(where.workspaceId).toBe("workspace-1");
    expect(where.lifecycleStatus).toBe("ACTIVE");
    expect(where.role.in).toEqual(expect.arrayContaining(["QA_ANALYST", "ADMIN", "TEAM_LEAD"]));
  });

  it("returns null when there are no candidate reviewers", async () => {
    const { client } = makeClient({ users: [] });

    await expect(assignReviewerForConversation("workspace-1", client as never)).resolves.toBeNull();
  });

  it("counts open load (QUEUED + IN_PROGRESS) per reviewer and picks the least loaded", async () => {
    const { client, groupBy } = makeClient({
      users: [
        { id: "u-1", name: "Анна" },
        { id: "u-2", name: "Борис" }
      ],
      counts: { "u-1": 4, "u-2": 1 }
    });

    const chosen = await assignReviewerForConversation("workspace-1", client as never);

    expect(chosen).toEqual({ id: "u-2", name: "Борис" });
    expect(groupBy).toHaveBeenCalledTimes(1);
    const countWhere = groupBy.mock.calls[0][0].where;
    expect(countWhere.workspaceId).toBe("workspace-1");
    expect(countWhere.qaStatus.in).toEqual(expect.arrayContaining(["QUEUED", "IN_PROGRESS"]));
  });
});
