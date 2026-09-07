import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ExecRiskHome } from "@/components/dashboard/exec-risk-home";

vi.mock("next/dynamic", () => ({
  default: () =>
    function MockExecRiskChart() {
      return <div data-slot="exec-risk-chart" />;
    }
}));

const hrefs = {
  overdue: "/reviews?due=overdue",
  highRisk: "/reviews?status=reviewed&finalizedFrom=2026-08-08&finalizedTo=2026-09-07&riskLevel=HIGH_OR_CRITICAL",
  queued: "/reviews?qaStatus=QUEUED"
};

describe("ExecRiskHome", () => {
  it("renders a risk narrative whose KPIs drill into queue filters", () => {
    render(
      <ExecRiskHome
        signal={{ overdueReviewCount: 6, highRiskCount: 3, queuedCount: 11 }}
        hrefs={hrefs}
        inWorkCount={2}
      />
    );

    expect(screen.getByText("Риск")).toBeInTheDocument();
    expect(screen.getByText(/операционный хром скрыт/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Разобрать/ })).toHaveAttribute("href", hrefs.overdue);

    expect(screen.getByRole("link", { name: /Просрочено SLA/ })).toHaveAttribute("href", hrefs.overdue);
    expect(screen.getByRole("link", { name: /Высокий риск/ })).toHaveAttribute("href", hrefs.highRisk);
    expect(screen.getByRole("link", { name: /Очередь без старта/ })).toHaveAttribute("href", hrefs.queued);
    expect(screen.getByRole("region", { name: "Сигналы риска" })).toBeInTheDocument();
    expect(document.querySelector('[data-slot="exec-risk-chart"]')).toBeInTheDocument();
  });

  it("hides lead/analyst ops chrome and shows an honest empty instead of a fake-green chart", () => {
    render(
      <ExecRiskHome
        signal={{ overdueReviewCount: 0, highRiskCount: 0, queuedCount: 0 }}
        hrefs={hrefs}
        inWorkCount={0}
      />
    );

    expect(screen.getAllByText("Нет сигналов за период").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/это не сертификат/i).length).toBeGreaterThan(0);
    expect(screen.queryByText("В норме")).not.toBeInTheDocument();
    expect(screen.queryByText("Критичных отклонений нет")).not.toBeInTheDocument();
    expect(document.querySelector('[data-slot="triage-strip"]')?.className).not.toMatch(/success/);
    expect(document.querySelector('[data-slot="exec-risk-chart"]')).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Открыть очередь без фильтра" })).toHaveAttribute(
      "href",
      "/reviews"
    );
    expect(screen.queryByText("Нагрузка проверяющих")).not.toBeInTheDocument();
    expect(screen.queryByText("Последняя активность")).not.toBeInTheDocument();
    expect(screen.queryByText("Ближайшее обучение")).not.toBeInTheDocument();
    expect(screen.queryByText(/Качество команды/)).not.toBeInTheDocument();
    expect(screen.queryByText("Ещё в фокусе")).not.toBeInTheDocument();
    expect(screen.queryByText("Средний балл")).not.toBeInTheDocument();
  });
});
