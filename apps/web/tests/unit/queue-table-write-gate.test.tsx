import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QueueTable } from "@/components/review/queue-table";
import type { ReviewQueueConversationDto } from "@/lib/contracts/review-queue";

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

describe("QueueTable write gate", () => {
  it("keeps bulk actions and row selection for reviewers with reviews:write", () => {
    render(
      <QueueTable
        conversations={[conversation()]}
        qaAssignees={[{ id: "qa-1", name: "Мария" }]}
        returnTo="/reviews"
        canWriteReviews
      />
    );

    expect(screen.getByText("Массовые действия")).toBeInTheDocument();
    expect(screen.getByLabelText("Выбрать Возврат по заказу")).toBeInTheDocument();
    expect(screen.getByText("Обновить")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Открыть" })).toBeInTheDocument();
  });

  it("hides ops chrome for readers so EXEC / SUPPORT_AGENT cannot submit bulk updates", () => {
    const { container } = render(
      <QueueTable
        conversations={[conversation()]}
        qaAssignees={[{ id: "qa-1", name: "Мария" }]}
        returnTo="/reviews"
        canWriteReviews={false}
      />
    );

    expect(screen.queryByText("Массовые действия")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Выбрать Возврат по заказу")).not.toBeInTheDocument();
    expect(screen.queryByText("Обновить")).not.toBeInTheDocument();
    expect(container.querySelector("form")).toBeNull();
    expect(screen.getByRole("link", { name: "Возврат по заказу" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Открыть" })).toBeInTheDocument();
  });
});
