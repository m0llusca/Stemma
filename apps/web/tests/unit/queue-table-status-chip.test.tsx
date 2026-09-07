import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QueueTable } from "@/components/review/queue-table";
import type { ReviewQueueConversationDto } from "@/lib/contracts/review-queue";
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
