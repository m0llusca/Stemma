import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReviewQueuePageData } from "@/lib/contracts/review-queue";

const mocks = vi.hoisted(() => ({
  getReviewQueuePageData: vi.fn(),
  takeNextReview: vi.fn()
}));

vi.mock("@/lib/review-queue-page-data", () => ({
  getReviewQueuePageData: mocks.getReviewQueuePageData
}));

vi.mock("@/lib/queue-view-actions", () => ({
  takeNextReview: mocks.takeNextReview
}));

vi.mock("@/components/guidance/welcome-back-banner", () => ({
  WelcomeBackBanner: () => null
}));

vi.mock("@/components/guidance/queue-day1-tour", () => ({
  QueueDay1Tour: () => <div data-testid="queue-day1-tour" />
}));

vi.mock("@/components/review/review-saved-toast", () => ({
  ReviewSavedToast: () => null
}));

vi.mock("@/components/review/queue-filters", () => ({
  QueueFilters: () => <div>Фильтры</div>
}));

vi.mock("@/components/review/queue-saved-views", () => ({
  QueueSavedViews: () => <div>Виды</div>
}));

function pageData(overrides: Partial<ReviewQueuePageData> = {}): ReviewQueuePageData {
  return {
    filters: { status: "all" },
    currentHref: "/reviews",
    currentAssigneeName: "Мария",
    conversations: [
      {
        id: "conversation-1",
        subject: "Возврат по заказу",
        customerName: "Клиент",
        assigneeName: "Оператор",
        messageCount: 3,
        channel: "CHAT",
        externalSource: "custom_api",
        supportLine: "1ЛП",
        teamName: "Поддержка",
        reviewDueAt: null,
        qaStatus: "ASSIGNED",
        qaAssigneeName: "Мария",
        csatBucket: "NO_SCORE",
        samplingType: "RANDOM",
        riskHint: null,
        priorityRank: 10,
        priorityReason: "Ожидает проверки",
        pendingReopen: null,
        reviews: []
      }
    ],
    summary: {
      total: 4,
      queued: 2,
      inWork: 1,
      drafts: 0,
      reviewed: 1,
      overdue: 0
    },
    filterOptions: {
      sources: [],
      assignees: [],
      qaAssignees: [],
      supportLines: [],
      teamNames: []
    },
    qaAssignees: [{ id: "qa-1", name: "Мария" }],
    savedViews: [],
    canWriteReviews: true,
    ...overrides
  };
}

describe("reviews page write gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((query: string) => ({
        matches: true,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn()
      }))
    );
  });

  it("renders take-next and bulk actions when the viewer has reviews:write", async () => {
    mocks.getReviewQueuePageData.mockResolvedValue(pageData({ canWriteReviews: true }));
    const { ReviewsPageContent } = await import("@/app/reviews/page");
    render(await ReviewsPageContent({ searchParams: Promise.resolve({}) }));

    expect(screen.getAllByRole("button", { name: "Взять следующий" }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Массовые действия")).toBeInTheDocument();
    expect(screen.getByTestId("queue-day1-tour")).toBeInTheDocument();
    expect(screen.getByText(/массовые действия/)).toBeInTheDocument();
  });

  it("hides write CTAs for EXEC / SUPPORT_AGENT so take-next cannot hit generic error.tsx", async () => {
    mocks.getReviewQueuePageData.mockResolvedValue(pageData({ canWriteReviews: false }));
    const { ReviewsPageContent } = await import("@/app/reviews/page");
    render(await ReviewsPageContent({ searchParams: Promise.resolve({}) }));

    expect(screen.queryByRole("button", { name: "Взять следующий" })).not.toBeInTheDocument();
    expect(screen.queryByText("Массовые действия")).not.toBeInTheDocument();
    expect(screen.queryByTestId("queue-day1-tour")).not.toBeInTheDocument();
    expect(screen.getByText(/Просмотр очереди: обращения и фильтры/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Открыть" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Очередь проверок" })).toBeInTheDocument();
  });
});
