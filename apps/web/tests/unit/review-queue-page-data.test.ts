import type { RoleName } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requirePagePermission: vi.fn(),
  getReviewQueue: vi.fn(),
  getReviewQueueSummary: vi.fn(),
  getReviewQueueFilterOptions: vi.fn(),
  parseReviewQueueFilters: vi.fn(),
  prisma: {
    user: { findMany: vi.fn() },
    savedQueueView: { findMany: vi.fn() }
  }
}));

vi.mock("@/lib/page-permission", () => ({
  requirePagePermission: mocks.requirePagePermission
}));

vi.mock("@/lib/review-repository", () => ({
  getReviewQueue: mocks.getReviewQueue,
  getReviewQueueSummary: mocks.getReviewQueueSummary,
  getReviewQueueFilterOptions: mocks.getReviewQueueFilterOptions,
  parseReviewQueueFilters: mocks.parseReviewQueueFilters
}));

vi.mock("@/lib/db", () => ({
  prisma: mocks.prisma
}));

function user(role: RoleName) {
  return {
    id: `${role.toLowerCase()}-1`,
    workspaceId: "workspace-1",
    name: role,
    role
  };
}

describe("getReviewQueuePageData write gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.parseReviewQueueFilters.mockReturnValue({ status: "all" });
    mocks.getReviewQueue.mockResolvedValue([]);
    mocks.getReviewQueueSummary.mockResolvedValue({
      total: 0,
      queued: 0,
      inWork: 0,
      drafts: 0,
      reviewed: 0,
      overdue: 0
    });
    mocks.getReviewQueueFilterOptions.mockResolvedValue({
      sources: [],
      assignees: [],
      qaAssignees: [],
      supportLines: [],
      teamNames: []
    });
    mocks.prisma.user.findMany.mockResolvedValue([]);
    mocks.prisma.savedQueueView.findMany.mockResolvedValue([]);
  });

  it.each([
    ["QA_ANALYST", true],
    ["TEAM_LEAD", true],
    ["ADMIN", true],
    ["EXEC", false],
    ["SUPPORT_AGENT", false],
    ["VIEWER", false]
  ] as const)("maps %s to canWriteReviews=%s", async (role, canWrite) => {
    mocks.requirePagePermission.mockResolvedValue(user(role));
    const { getReviewQueuePageData } = await import("@/lib/review-queue-page-data");

    const data = await getReviewQueuePageData({});

    expect(mocks.requirePagePermission).toHaveBeenCalledWith("reviews:read");
    expect(data.canWriteReviews).toBe(canWrite);
  });

  it("keeps currentHref on the request URL and does not apply a workspace saved view", async () => {
    mocks.requirePagePermission.mockResolvedValue(user("QA_ANALYST"));
    mocks.prisma.savedQueueView.findMany.mockResolvedValue([
      {
        id: "ws-critical",
        name: "Критические за период",
        href: "/reviews?process=critical",
        scope: "workspace"
      }
    ]);
    const { getReviewQueuePageData } = await import("@/lib/review-queue-page-data");

    const bare = await getReviewQueuePageData({});
    expect(bare.currentHref).toBe("/reviews");
    expect(bare.filterResetHref).toBe("/reviews?qaAssignee=QA_ANALYST&due=overdue");
    expect(bare.savedViews).toEqual([
      {
        id: "ws-critical",
        name: "Критические за период",
        href: "/reviews?process=critical",
        scope: "workspace"
      }
    ]);

    const deep = await getReviewQueuePageData({ process: "critical" });
    expect(deep.currentHref).toBe("/reviews?process=critical");
    expect(deep.filterResetHref).toBe("/reviews?qaAssignee=QA_ANALYST&due=overdue");
  });

  it("scopes SUPPORT_AGENT queue by assigneeId only, never assignee name", async () => {
    mocks.requirePagePermission.mockResolvedValue(user("SUPPORT_AGENT"));
    const { getReviewQueuePageData } = await import("@/lib/review-queue-page-data");

    await getReviewQueuePageData({ status: "queued" });

    expect(mocks.getReviewQueue).toHaveBeenCalledWith(
      "workspace-1",
      { status: "all" },
      { assigneeId: "support_agent-1" }
    );
    const [, filtersArg, scopeArg] = mocks.getReviewQueue.mock.calls[0];
    expect(filtersArg).not.toHaveProperty("assignee");
    expect(scopeArg).toEqual({ assigneeId: "support_agent-1" });
  });
});
