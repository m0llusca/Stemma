import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { QueueNextCasePreview } from "@/components/review/queue-next-case-preview";
import { qaStatusLabels } from "@/lib/labels";
import { pendingReopenLabel, reviewStateLabels } from "@/lib/review-state";

const assignedConversation = {
  qaStatus: "ASSIGNED" as const,
  pendingReopen: null,
  reviews: []
};

it("collapses next-case context by default while keeping the open CTA", () => {
  render(
    <QueueNextCasePreview
      subject="Просроченный чат"
      description="Клиент · оператор"
      openHref="/reviews/conv-1"
      statusConversation={assignedConversation}
    >
      <p>Почему первый: SLA</p>
    </QueueNextCasePreview>
  );

  expect(screen.getByText("Следующий кейс")).toBeInTheDocument();
  expect(screen.getByText("Просроченный чат")).toBeInTheDocument();
  const openCta = screen.getByRole("button", { name: /Открыть приоритетный кейс/ });
  expect(openCta).toHaveAttribute("href", "/reviews/conv-1");

  const trigger = screen.getByRole("button", { name: /Следующий кейс/ });
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByText("Почему первый: SLA")).not.toBeInTheDocument();
});

it("expands to reveal priority context without removing the CTA", () => {
  render(
    <QueueNextCasePreview
      subject="Просроченный чат"
      description="Клиент · оператор"
      openHref="/reviews/conv-1"
      statusConversation={assignedConversation}
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
  expect(screen.getByRole("button", { name: /Открыть приоритетный кейс/ })).toBeInTheDocument();
});

it("shows the queue status chip, not a second qaStatus wording, while collapsed", () => {
  render(
    <QueueNextCasePreview
      subject="Просроченный чат"
      description="Клиент · оператор"
      openHref="/reviews/conv-1"
      statusConversation={assignedConversation}
    >
      <p>Почему первый: SLA</p>
    </QueueNextCasePreview>
  );

  expect(screen.getByText(reviewStateLabels.assigned)).toBeInTheDocument();
  expect(screen.queryByText("Назначено")).not.toBeInTheDocument();
  expect(screen.getByText(reviewStateLabels.assigned).className).toMatch(/chip/);
});

it("uses the pending-reopen chip instead of finalized qaStatus wording", () => {
  render(
    <QueueNextCasePreview
      subject="Завершенный кейс"
      description="Клиент · оператор"
      openHref="/reviews/conv-2"
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
