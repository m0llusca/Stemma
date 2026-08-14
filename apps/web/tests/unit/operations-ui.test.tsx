import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Activity } from "lucide-react";
import { OperationKpiCard } from "@/components/operations/operation-kpi-card";
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

  it("styles KPI deltas with shared semantic status tokens", () => {
    render(
      <>
        <OperationKpiCard
          href="/reports"
          icon={Activity}
          value={79}
          delta={{ value: "+3", direction: "up", tone: "success" }}
          tone="positive"
          label="Улучшение"
          hint="к прошлой неделе"
        />
        <OperationKpiCard
          href="/reviews"
          icon={Activity}
          value={4}
          delta={{ value: "4", direction: "flat", tone: "warning" }}
          tone="warning"
          label="Требует внимания"
          hint="без старта"
        />
      </>
    );

    const successBadge = screen
      .getByRole("link", { name: /Улучшение/ })
      .querySelector('[data-slot="badge"]');
    const warningBadge = screen
      .getByRole("link", { name: /Требует внимания/ })
      .querySelector('[data-slot="badge"]');

    expect(successBadge?.className).toContain("bg-success-soft");
    expect(successBadge?.className).toContain("text-success");
    expect(warningBadge?.className).toContain("bg-warning-soft");
    expect(warningBadge?.className).toContain("text-warning");
    expect(`${successBadge?.className} ${warningBadge?.className}`).not.toMatch(/emerald|amber/);
  });
});
