import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CriterionHeatmapPanel, MetricInsightStrip } from "@/components/reports/analytics-intelligence";
import { TooltipProvider } from "@/components/ui/tooltip";

vi.mock("next/link", () => ({
  default: ({
    href,
    prefetch,
    scroll,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
    prefetch?: boolean;
    scroll?: boolean;
  }) => (
    <a
      href={href}
      data-prefetch={prefetch == null ? undefined : String(prefetch)}
      data-scroll={scroll == null ? undefined : String(scroll)}
      {...props}
    />
  )
}));

describe("MetricInsightStrip", () => {
  it("disables prefetch and preserves scroll for evidence links without changing review links", () => {
    const evidenceKey = `ev1_${"A".repeat(43)}`;
    render(
      <MetricInsightStrip
        title="Операционные сигналы"
        description="Короткая проверка рисков."
        items={[
          {
            label: "Evidence",
            value: "10",
            detail: "Выбранный срез",
            progress: 43,
            progressLabel: "доля риска",
            href: `/reports?view=overview&evidenceType=kpi&evidenceKey=${evidenceKey}`
          },
          {
            label: "Reviews",
            value: "7",
            detail: "Очередь проверок",
            progress: 20,
            progressLabel: "доля",
            href: "/reviews?riskLevel=HIGH_OR_CRITICAL"
          }
        ]}
      />
    );

    const evidenceLink = screen.getByRole("button", {
      name: /Открыть срез Evidence/
    });
    const reviewLink = screen.getByRole("button", {
      name: /Открыть срез Reviews/
    });
    expect(evidenceLink).toHaveAttribute("data-prefetch", "false");
    expect(evidenceLink).toHaveAttribute("data-scroll", "false");
    expect(reviewLink).toHaveAttribute("data-prefetch", "false");
    expect(reviewLink).not.toHaveAttribute("data-scroll");
  });

  it("adds explanatory help to operational signal cards without hiding the drilldown", async () => {
    render(
      <TooltipProvider>
        <MetricInsightStrip
          title="Операционные сигналы"
          description="Короткая проверка рисков."
          items={[
            {
              label: "Риск HIGH+",
              value: "10",
              detail: "43% всех замечаний",
              progress: 43,
              progressLabel: "доля риска",
              explanation:
                "Показывает замечания HIGH и CRITICAL. Высокая доля означает, что сначала стоит открыть список проверок с высоким риском.",
              href: "/reviews?riskLevel=HIGH_OR_CRITICAL",
              tone: "danger"
            }
          ]}
        />
      </TooltipProvider>
    );

    const help = screen.getByRole("button", { name: "Что значит сигнал Риск HIGH+?" });
    expect(help).toBeInTheDocument();
    fireEvent.focus(help);
    fireEvent.pointerMove(help);

    expect(
      await screen.findByText(/Показывает замечания HIGH и CRITICAL/, {}, { timeout: 2000 })
    ).toBeInTheDocument();
    const drilldown = screen.getByText("Открыть срез").closest("a");
    expect(drilldown).toHaveAttribute("href", "/reviews?riskLevel=HIGH_OR_CRITICAL");
  });
});

describe("CriterionHeatmapPanel", () => {
  it("keeps the lowest intensity pill on the solid primary pairing for WCAG text contrast", () => {
    // P3-residual: the ranked pills used bg-primary/55 + text-primary-foreground
    // (≈2.46:1 on performance views). The densest bucket must use the solid
    // primary pairing — the criterion-matrix precedent — which stays ≥4.5:1.
    render(
      <CriterionHeatmapPanel
        title="Качество по блокам"
        description="Насыщенность заливки показывает балл."
        actionHref="/reports?view=details"
        rows={[
          { label: "Эмпатия", score: 95, count: 8, detail: "8 проверок" },
          { label: "Решение конфликта", score: 61, count: 8, detail: "8 проверок" }
        ]}
      />
    );

    const weakPill = screen.getByRole("progressbar", {
      name: /Решение конфликта/
    }).parentElement;
    expect(weakPill).toHaveClass("bg-primary", "text-primary-foreground");
    expect(weakPill?.className ?? "").not.toContain("bg-primary/55");

    const strongPill = screen.getByRole("progressbar", {
      name: /Эмпатия/
    }).parentElement;
    expect(strongPill).toHaveClass("bg-primary/10", "text-foreground");
  });
});
