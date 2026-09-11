import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QueueTable } from "@/components/review/queue-table";
import type { ReviewQueueConversationDto } from "@/lib/contracts/review-queue";
import {
  QUEUE_EMPTY_RESET_FILTERS_LABEL,
  QUEUE_TABLE_EMPTY_FILTERED_DESCRIPTION,
  QUEUE_TABLE_EMPTY_FILTERED_TITLE,
  QUEUE_TABLE_EMPTY_GLOBAL_DESCRIPTION,
  QUEUE_TABLE_EMPTY_GLOBAL_TITLE
} from "@/lib/review/queue-empty-copy";
import { pendingReopenLabel, resolveQueueStatusChip, reviewStateLabels } from "@/lib/review-state";

vi.mock("@/lib/review-workflow-actions", () => ({
  bulkUpdateReviewQueue: vi.fn()
}));

function conversation(overrides: Partial<ReviewQueueConversationDto> = {}): ReviewQueueConversationDto {
  return {
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
    reviews: [],
    ...overrides
  };
}

describe("QueueTable status chip", () => {
  it("renders the shared review-state chip, not a second qaStatus wording", () => {
    const row = conversation({ qaStatus: "ASSIGNED" });

    render(<QueueTable conversations={[row]} qaAssignees={[]} returnTo="/reviews" canWriteReviews />);

    const chip = screen.getByText(reviewStateLabels.assigned, { selector: ".chip" });
    expect(chip).toBeInTheDocument();
    expect(chip.textContent).toBe(resolveQueueStatusChip(row).label);
    expect(screen.queryByText("Назначено")).not.toBeInTheDocument();
  });

  it("keeps filtered returnTo on subject and open links like take-next", () => {
    const row = conversation({ id: "conv-filter", subject: "Фильтр SLA" });
    const returnTo = "/reviews?due=overdue&process=ai_exception";

    render(<QueueTable conversations={[row]} qaAssignees={[]} returnTo={returnTo} canWriteReviews />);

    const expected = `/reviews/conv-filter?returnTo=${encodeURIComponent(returnTo)}`;
    expect(screen.getByRole("link", { name: "Фильтр SLA" })).toHaveAttribute("href", expected);
    const openControl =
      screen.queryByRole("link", { name: "Открыть" }) ??
      screen.getByRole("button", { name: "Открыть" }).closest("a");
    expect(openControl).toHaveAttribute("href", expected);
  });

  it("omits returnTo on row links when the queue is the default inbox", () => {
    const row = conversation({ id: "conv-home", subject: "Базовая очередь" });

    render(<QueueTable conversations={[row]} qaAssignees={[]} returnTo="/reviews" canWriteReviews />);

    expect(screen.getByRole("link", { name: "Базовая очередь" })).toHaveAttribute(
      "href",
      "/reviews/conv-home"
    );
    const openControl =
      screen.queryByRole("link", { name: "Открыть" }) ??
      screen.getByRole("button", { name: "Открыть" }).closest("a");
    expect(openControl).toHaveAttribute("href", "/reviews/conv-home");
  });

  it("uses the same pending-reopen chip the preview helper returns", () => {
    const row = conversation({
      qaStatus: "FINALIZED",
      reviews: [
        {
          id: "review-1",
          status: "FINALIZED",
          reviewSource: "HUMAN",
          totalScore: 88,
          criticalError: false,
          needsReanswer: false,
          appealStatus: "none",
          reanswerStatus: "not_needed"
        }
      ],
      pendingReopen: {
        reason: "нужна правка",
        requestedById: "user-2",
        requestedByName: "Анна",
        requestedAt: "2026-09-07T00:00:00.000Z"
      }
    });

    render(<QueueTable conversations={[row]} qaAssignees={[]} returnTo="/reviews" canWriteReviews />);

    const chip = screen.getByText(pendingReopenLabel, { selector: ".chip" });
    expect(chip.textContent).toBe(resolveQueueStatusChip(row).label);
    expect(screen.queryByText("Завершено")).not.toBeInTheDocument();
  });

  it("resets an empty analyst inbox to the mine+overdue role home", () => {
    render(
      <QueueTable
        conversations={[]}
        qaAssignees={[]}
        returnTo="/reviews?qaAssignee=%D0%90%D0%BD%D0%BD%D0%B0%20QA&due=overdue&channel=CHAT"
        resetHref="/reviews?qaAssignee=%D0%90%D0%BD%D0%BD%D0%B0%20QA&due=overdue"
        canWriteReviews
      />
    );

    expect(screen.getByText("Сбросить фильтры").closest("a")).toHaveAttribute(
      "href",
      "/reviews?qaAssignee=%D0%90%D0%BD%D0%BD%D0%B0%20QA&due=overdue"
    );
  });
});

describe("QueueTable empty state", () => {
  it("uses the import story when the workspace queue is truly empty", () => {
    render(
      <QueueTable conversations={[]} qaAssignees={[]} returnTo="/reviews?empty=1" canWriteReviews />
    );

    expect(screen.getByText(QUEUE_TABLE_EMPTY_GLOBAL_TITLE)).toBeInTheDocument();
    expect(screen.getByText(QUEUE_TABLE_EMPTY_GLOBAL_DESCRIPTION)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: QUEUE_EMPTY_RESET_FILTERS_LABEL })).not.toBeInTheDocument();
    expect(screen.queryByText(QUEUE_TABLE_EMPTY_FILTERED_TITLE)).not.toBeInTheDocument();
  });

  it("scopes copy and offers reset when chips emptied the current view", () => {
    render(
      <QueueTable
        conversations={[]}
        qaAssignees={[]}
        returnTo="/reviews?due=overdue&empty=1"
        canWriteReviews
      />
    );

    expect(screen.getByText(QUEUE_TABLE_EMPTY_FILTERED_TITLE)).toBeInTheDocument();
    expect(screen.getByText(QUEUE_TABLE_EMPTY_FILTERED_DESCRIPTION)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: QUEUE_EMPTY_RESET_FILTERS_LABEL }).closest("a")).toHaveAttribute(
      "href",
      "/reviews"
    );
    expect(screen.queryByText(QUEUE_TABLE_EMPTY_GLOBAL_DESCRIPTION)).not.toBeInTheDocument();
  });
});
