import { describe, expect, it, vi } from "vitest";
import { assignReviewerForConversation, selectLeastLoadedReviewer } from "@/lib/review-assignment";

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
    const loadByName = { Анна: 5, Борис: 2, Виктор: 9 };

    expect(selectLeastLoadedReviewer(candidates, loadByName)).toEqual({ id: "u-2", name: "Борис" });
  });

  it("treats missing load entries as zero", () => {
    const candidates = [
      { id: "u-1", name: "Анна" },
      { id: "u-2", name: "Борис" }
    ];
    const loadByName = { Анна: 3 };

    expect(selectLeastLoadedReviewer(candidates, loadByName)).toEqual({ id: "u-2", name: "Борис" });
  });

  it("breaks ties deterministically by name", () => {
    const candidates = [
      { id: "u-3", name: "Виктор" },
      { id: "u-1", name: "Анна" },
      { id: "u-2", name: "Борис" }
    ];
    const loadByName = { Анна: 4, Борис: 4, Виктор: 4 };

    expect(selectLeastLoadedReviewer(candidates, loadByName)).toEqual({ id: "u-1", name: "Анна" });
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
    const count = vi.fn(
      async ({ where }: { where: { workspaceId: string; qaAssigneeName?: string; qaStatus: { in: string[] } } }) =>
        counts[where.qaAssigneeName ?? ""] ?? 0
    );

    return {
      client: { user: { findMany }, conversation: { count } },
      findMany,
      count
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
    const { client, count } = makeClient({
      users: [
        { id: "u-1", name: "Анна" },
        { id: "u-2", name: "Борис" }
      ],
      counts: { Анна: 4, Борис: 1 }
    });

    const chosen = await assignReviewerForConversation("workspace-1", client as never);

    expect(chosen).toEqual({ id: "u-2", name: "Борис" });
    const countWhere = count.mock.calls[0][0].where;
    expect(countWhere.workspaceId).toBe("workspace-1");
    expect(countWhere.qaStatus.in).toEqual(expect.arrayContaining(["QUEUED", "IN_PROGRESS"]));
  });
});
