import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EvidenceDrawer } from "@/components/operations/evidence-drawer";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { PageShell } from "@/components/ui/page-shell";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { TriageStrip } from "@/components/ui/triage-strip";

const dashboardSource = readFileSync(
  join(process.cwd(), "src/app/dashboard/page.tsx"),
  "utf8"
);

describe("shadcn UI composition primitives", () => {
  it("renders EmptyState with a title", () => {
    render(<EmptyState title="Нет данных" description="Попробуйте изменить фильтры" />);

    expect(screen.getByText("Нет данных")).toBeInTheDocument();
    expect(screen.getByText("Попробуйте изменить фильтры")).toBeInTheDocument();
  });

  it("renders PageShell with a title heading", () => {
    render(
      <PageShell title="Очередь проверок" description="Активные задачи">
        <p>body</p>
      </PageShell>
    );

    expect(screen.getByRole("heading", { level: 1, name: "Очередь проверок" })).toBeInTheDocument();
    expect(screen.getByText("Активные задачи")).toBeInTheDocument();
    expect(screen.getByText("body")).toBeInTheDocument();
  });

  it("keeps PageShell at a 12px mobile gutter with one locally scrollable tab row", () => {
    render(
      <PageShell
        title="Аналитика"
        tabs={[
          { label: "Обзор", href: "/reports", active: true },
          { label: "Исполнение", href: "/reports?view=performance" },
          { label: "Процессы", href: "/reports?view=process" }
        ]}
      >
        <p>Содержимое аналитики</p>
      </PageShell>
    );

    const heading = screen.getByRole("heading", { level: 1, name: "Аналитика" });
    const shell = heading.parentElement?.parentElement?.parentElement;
    const tabs = screen.getByRole("navigation", { name: "Разделы страницы" });
    const content = document.querySelector('[data-slot="page-shell-content"]');

    expect(shell).toHaveClass("min-w-0", "p-3", "md:p-6");
    expect(shell).not.toHaveClass("p-4");
    expect(content).toHaveClass("min-w-0");
    expect(tabs).toHaveClass("flex-nowrap", "overflow-x-auto");
    expect(tabs).not.toHaveClass("flex-wrap");
    for (const link of within(tabs).getAllByRole("link")) {
      expect(link).toHaveClass("shrink-0", "whitespace-nowrap");
    }
  });

  it("stacks Triage copy above a full-width action at 320 and uses semantic tones", () => {
    const { rerender } = render(
      <TriageStrip
        tone="success"
        title="Критичных отклонений нет"
        description="Держите ритм очереди."
        action={<Button>Открыть очередь</Button>}
      />
    );

    const alert = screen.getByRole("alert");
    const actionOwner = screen.getByRole("button", { name: "Открыть очередь" }).parentElement;
    expect(alert).toHaveClass(
      "flex-col",
      "items-stretch",
      "min-[390px]:flex-row",
      "min-[390px]:items-center",
      "border-success/30",
      "bg-success-soft"
    );
    expect(actionOwner).toHaveClass(
      "w-full",
      "[&_[data-slot=button]]:w-full",
      "min-[390px]:w-auto",
      "min-[390px]:[&_[data-slot=button]]:w-auto"
    );

    for (const tone of ["accent", "success", "warning", "danger", "ai"] as const) {
      rerender(
        <TriageStrip tone={tone} title={tone} action={<Button>Действие</Button>} />
      );
      expect(screen.getByRole("alert").className).not.toMatch(
        /emerald|amber|violet|dark:/
      );
    }
  });

  it("opens the activity Sheet full-width through 640px with a Russian close label", () => {
    render(
      <EvidenceDrawer
        title="Последняя активность"
        description="Что менялось в проверках и обучении."
      >
        <p>Событие</p>
      </EvidenceDrawer>
    );

    const trigger = screen.getByRole("button", { name: /Последняя активность/ });
    const triggerCopy = within(trigger).getByText("Последняя активность").parentElement;

    expect(trigger).toHaveClass("min-w-0");
    expect(triggerCopy).toHaveClass("whitespace-normal", "[overflow-wrap:anywhere]");

    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Последняя активность" });

    expect(dialog).toHaveClass(
      "data-[side=right]:h-dvh",
      "data-[side=right]:w-full",
      "data-[side=right]:max-w-none",
      "data-[side=right]:sm:max-w-none",
      "data-[side=right]:min-[641px]:h-full"
    );
    expect(within(dialog).getByRole("button", { name: "Закрыть" })).toBeInTheDocument();
    expect(document.querySelector('[data-slot="card"]')).not.toBeInTheDocument();
  });

  it("keeps dashboard card titles in title case without caps styling", () => {
    expect(dashboardSource).not.toMatch(/CardTitle[^>]*uppercase/);
  });

  it("exposes CardTitle as a level-2 heading so aria-labelledby targets stay navigable", () => {
    render(
      <Card aria-labelledby="sample-card-title">
        <CardHeader>
          <CardTitle id="sample-card-title">Сводка</CardTitle>
        </CardHeader>
      </Card>
    );

    const title = screen.getByRole("heading", { level: 2, name: "Сводка" });
    expect(title).toHaveAttribute("data-slot", "card-title");
  });

  it("lets consumers override the CardTitle heading level", () => {
    render(<CardTitle aria-level={3}>Подраздел</CardTitle>);

    expect(screen.getByRole("heading", { level: 3, name: "Подраздел" })).toBeInTheDocument();
  });

  it("keeps the dashboard shell flat, removes decorative eyebrow copy, and uses two-to-one desktop pairs", () => {
    expect(dashboardSource).not.toContain('eyebrow="Рабочее пространство"');
    expect(
      dashboardSource.match(
        /xl:grid-cols-\[minmax\(0,2fr\)_minmax\(320px,1fr\)\]/g
      )
    ).toHaveLength(2);
    expect(dashboardSource).not.toMatch(
      /<Card>\s*<CardContent[^>]*>\s*<EvidenceDrawer/
    );
    expect(dashboardSource).not.toContain(
      "dashboard-focus-row__icon inline-flex size-8 items-center justify-center rounded-md border"
    );
  });

  it("renders StatusBadge and Chip content", () => {
    render(
      <div>
        <StatusBadge label="Статус" value="Готово" tone="positive" />
        <Chip tone="warning">В работе</Chip>
      </div>
    );

    expect(screen.getByText("Готово")).toBeInTheDocument();
    expect(screen.getByText("В работе")).toBeInTheDocument();
  });

  it("renders StatCard with label and value", () => {
    render(<StatCard label="Средний балл" value="92" hint="за 7 дней" />);

    expect(screen.getByText("Средний балл")).toBeInTheDocument();
    expect(screen.getByText("92")).toBeInTheDocument();
    expect(screen.getByText("за 7 дней")).toBeInTheDocument();
  });
});
