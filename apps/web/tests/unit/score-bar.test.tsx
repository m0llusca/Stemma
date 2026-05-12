import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ScoreBar } from "@/components/ui/score-bar";

describe("ScoreBar", () => {
  it("renders quality score as points", () => {
    render(<ScoreBar value={86.7} label="Оценка" />);

    expect(screen.getByText("Оценка: 87 баллов")).toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it("keeps the empty label for missing score", () => {
    render(<ScoreBar value={null} emptyLabel="Еще не сохранен" />);

    expect(screen.getByText("Еще не сохранен")).toBeInTheDocument();
  });
});
