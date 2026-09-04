import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { QueueNextCasePreview } from "@/components/review/queue-next-case-preview";

it("collapses next-case context by default while keeping the open CTA", () => {
  render(
    <QueueNextCasePreview
      subject="Просроченный чат"
      description="Клиент · оператор · В очереди"
      openHref="/reviews/conv-1"
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
      description="Клиент · оператор · В очереди"
      openHref="/reviews/conv-1"
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
