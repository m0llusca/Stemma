import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { QueueFilters } from "@/components/review/queue-filters";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn()
  })
}));

describe("QueueFilters", () => {
  it("exposes QA status as a visible exact filter and gives queue search a unique label", () => {
    render(
      <QueueFilters
        filters={{ status: "all", qaStatus: "QUEUED" }}
        sources={[]}
        assignees={[]}
        qaAssignees={[]}
        supportLines={[]}
        teamNames={[]}
        resultCount={12}
      />
    );

    expect(screen.getByLabelText("Поиск в очереди проверок")).toBeInTheDocument();
    expect(screen.getByLabelText("Итог")).toHaveValue("all");
    expect(screen.getByRole("button", { name: /^точные фильтры/i, hidden: true })).toHaveTextContent(
      "1 применено"
    );
    expect(screen.getByLabelText("Статус проверки")).toHaveValue("QUEUED");
    expect(screen.getByText("Статус проверки: В очереди")).toBeInTheDocument();
    expect(screen.getByText("Сбросить фильтры").closest("a")).toHaveAttribute("href", "/reviews");
    expect(screen.getByText(/Применено фильтров: 1\. Найдено обращений: 12\./)).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Срок (SLA)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /что такое sla/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /что такое источник/i })).toBeInTheDocument();
  });

  it("synchronizes queue search with refreshed filters without Base UI ownership warnings", () => {
    const diagnostics: Array<{ message: string; ownerStack: string }> = [];
    const captureDiagnostic = (...args: unknown[]) => {
      const message = args.map(String).join(" ");

      if (/uncontrolled|controlled|FieldControl/i.test(message)) {
        diagnostics.push({
          message,
          ownerStack:
            (
              React as typeof React & {
                captureOwnerStack?: () => string | null;
              }
            ).captureOwnerStack?.() ?? ""
        });
      }
    };
    const errorSpy = vi.spyOn(console, "error").mockImplementation(captureDiagnostic);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(captureDiagnostic);
    const renderQueueFilters = (q?: string) => (
      <QueueFilters
        filters={{ status: "all", q }}
        sources={[]}
        assignees={[]}
        qaAssignees={[]}
        supportLines={[]}
        teamNames={[]}
      />
    );
    const { container, rerender } = render(renderQueueFilters());
    const search = screen.getByLabelText("Поиск в очереди проверок");

    fireEvent.input(search, { target: { value: "локальный черновик" } });
    expect(search).toHaveValue("локальный черновик");

    rerender(renderQueueFilters("Мила"));

    const refreshedSearch = screen.getByLabelText("Поиск в очереди проверок");
    const form = container.querySelector('form[action="/reviews"]');
    const submittedSearch = new FormData(form as HTMLFormElement).get("q");
    errorSpy.mockRestore();
    warnSpy.mockRestore();

    expect(diagnostics).toEqual([]);
    expect(refreshedSearch).toHaveValue("Мила");
    expect(submittedSearch).toBe("Мила");
  });
});
