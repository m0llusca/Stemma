import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
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
      />
    );

    expect(screen.getByLabelText("Поиск в очереди проверок")).toBeInTheDocument();
    expect(screen.getByLabelText("Состояние")).toHaveValue("QUEUED");
    expect(screen.getByRole("button", { name: /точные фильтры/i })).toHaveTextContent("1 применено");
    expect(screen.getByText("Состояние: В очереди")).toBeInTheDocument();
  });
});
