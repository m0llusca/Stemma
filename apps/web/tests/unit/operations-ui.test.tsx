import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OperationalPageFrame } from "@/components/operations/operational-page-frame";
import { PriorityActionPanel } from "@/components/operations/priority-action-panel";

describe("operations UI pattern", () => {
  it("renders signals, action, details, and evidence in order", () => {
    render(
      <OperationalPageFrame
        title="Главная"
        signals={<div>Сигналы</div>}
        action={<div>Действие</div>}
        details={<div>Детали</div>}
        evidence={<div>Evidence</div>}
      />
    );

    expect(screen.getByText("Сигналы").compareDocumentPosition(screen.getByText("Действие"))).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(screen.getByText("Действие").compareDocumentPosition(screen.getByText("Детали"))).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(screen.getByText("Детали").compareDocumentPosition(screen.getByText("Evidence"))).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("renders one dominant next action", () => {
    render(
      <PriorityActionPanel
        title="Сделать сейчас"
        description="Закройте просроченное обучение."
        actionLabel="Открыть фокус"
        href="/dashboard?focus=training"
        tone="warning"
      />
    );

    expect(screen.getByRole("link", { name: "Открыть фокус" }).getAttribute("href")).toBe("/dashboard?focus=training");
  });
});
