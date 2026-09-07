import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ExecRiskHome } from "@/components/dashboard/exec-risk-home";

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
  });

  it("hides lead/analyst ops chrome", () => {
    render(
      <ExecRiskHome
        signal={{ overdueReviewCount: 0, highRiskCount: 0, queuedCount: 0 }}
        hrefs={hrefs}
        inWorkCount={0}
      />
    );

    expect(screen.queryByText("Нагрузка проверяющих")).not.toBeInTheDocument();
    expect(screen.queryByText("Последняя активность")).not.toBeInTheDocument();
    expect(screen.queryByText("Ближайшее обучение")).not.toBeInTheDocument();
    expect(screen.queryByText(/Качество команды/)).not.toBeInTheDocument();
    expect(screen.queryByText("Ещё в фокусе")).not.toBeInTheDocument();
    expect(screen.queryByText("Средний балл")).not.toBeInTheDocument();
  });
});
