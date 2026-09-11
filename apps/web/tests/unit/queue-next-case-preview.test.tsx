import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { QueueNextCasePreview } from "@/components/review/queue-next-case-preview";

vi.mock("@/lib/queue-view-actions", () => ({
  takeNextReview: vi.fn()
}));
import { qaStatusLabels } from "@/lib/labels";
import { TAKE_NEXT_LABEL } from "@/lib/review/take-next-copy";
import { pendingReopenLabel, reviewStateLabels } from "@/lib/review-state";

const assignedConversation = {
  qaStatus: "ASSIGNED" as const,
  pendingReopen: null,
  reviews: []
};

it("collapses next-case context by default while keeping the Take-next CTA", () => {
  render(
    <QueueNextCasePreview
      subject="Просроченный чат"
      description="Клиент · оператор"
      queueHref="/reviews?due=overdue"
      statusConversation={assignedConversation}
      canTakeNext
    >
      <p>Почему первый: SLA</p>
    </QueueNextCasePreview>
  );

  expect(screen.getByText("Следующий кейс")).toBeInTheDocument();
  expect(screen.getByText("Просроченный чат")).toBeInTheDocument();
  const takeNext = screen.getByRole("button", { name: TAKE_NEXT_LABEL });
  expect(takeNext).toHaveAttribute("type", "submit");
  expect(takeNext.closest("form")?.querySelector("input[name='queueHref']")).toHaveValue(
    "/reviews?due=overdue"
  );
  expect(screen.queryByRole("link", { name: TAKE_NEXT_LABEL })).toBeNull();
  expect(screen.queryByRole("button", { name: /Открыть приоритетный кейс/ })).toBeNull();

  const trigger = screen.getByRole("button", { name: /Следующий кейс/ });
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByText("Почему первый: SLA")).not.toBeInTheDocument();
});

it("expands to reveal priority context without removing the Take-next CTA", () => {
  render(
    <QueueNextCasePreview
      subject="Просроченный чат"
      description="Клиент · оператор"
      queueHref="/reviews?due=overdue"
      statusConversation={assignedConversation}
      canTakeNext
    >
      <p>Почему первый: SLA</p>
    </QueueNextCasePreview>
  );

  fireEvent.click(screen.getByRole("button", { name: /Следующий кейс/ }));

  expect(screen.getByRole("button", { name: /Следующий кейс/ })).toHaveAttribute(
    "aria-expanded",
    "true"
  );
  expect(screen.getByText("Почему первый: SLA")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: TAKE_NEXT_LABEL })).toBeInTheDocument();
});

it("shows the queue status chip, not a second qaStatus wording, while collapsed", () => {
  render(
    <QueueNextCasePreview
      subject="Просроченный чат"
      description="Клиент · оператор"
      queueHref="/reviews"
      statusConversation={assignedConversation}
    >
      <p>Почему первый: SLA</p>
    </QueueNextCasePreview>
  );

  expect(screen.getByText(reviewStateLabels.assigned)).toBeInTheDocument();
  expect(screen.queryByText("Назначено")).not.toBeInTheDocument();
  expect(screen.getByText(reviewStateLabels.assigned).className).toMatch(/chip/);
});

it("omits Take-next when the page says the viewer cannot write reviews", () => {
  render(
    <QueueNextCasePreview
      subject="Просроченный чат"
      description="Клиент · оператор"
      queueHref="/reviews"
      statusConversation={assignedConversation}
      canTakeNext={false}
    >
      <p>Почему первый: SLA</p>
    </QueueNextCasePreview>
  );

  expect(screen.queryByRole("button", { name: TAKE_NEXT_LABEL })).toBeNull();
  expect(screen.getByText("Следующий кейс")).toBeInTheDocument();
});

it("omits Take-next by default when eligibility is not passed (fail-closed)", () => {
  render(
    <QueueNextCasePreview
      subject="Просроченный чат"
      description="Клиент · оператор"
      queueHref="/reviews"
      statusConversation={assignedConversation}
    >
      <p>Почему первый: SLA</p>
    </QueueNextCasePreview>
  );

  expect(screen.queryByRole("button", { name: TAKE_NEXT_LABEL })).toBeNull();
});

it("uses the pending-reopen chip instead of finalized qaStatus wording", () => {
  render(
    <QueueNextCasePreview
      subject="Завершенный кейс"
      description="Клиент · оператор"
      queueHref="/reviews"
      statusConversation={{
        qaStatus: "FINALIZED",
        pendingReopen: { reason: "правка" },
        reviews: [{ status: "FINALIZED", reviewSource: "HUMAN" }]
      }}
    >
      <p>Почему первый: SLA</p>
    </QueueNextCasePreview>
  );

  expect(screen.getByText(pendingReopenLabel)).toBeInTheDocument();
  expect(screen.queryByText(qaStatusLabels.FINALIZED)).not.toBeInTheDocument();
  expect(screen.queryByText("Завершено")).not.toBeInTheDocument();
});
