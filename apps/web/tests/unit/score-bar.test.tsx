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

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "keeps the empty label for non-finite score %s",
    (value) => {
      render(<ScoreBar value={value} emptyLabel="Некорректная оценка" />);

      expect(screen.getByText("Некорректная оценка")).toBeInTheDocument();
      expect(screen.queryByText(/балл/)).not.toBeInTheDocument();
    }
  );

  it("hides the visual track from assistive technologies", () => {
    const { container } = render(<ScoreBar value={72} label="Оценка" />);

    expect(container.querySelector("[aria-hidden='true']")).toBeInTheDocument();
  });

  it("clamps visual width above 100 points", () => {
    const { container } = render(<ScoreBar value={140} label="Оценка" />);
    const track = container.querySelector("[aria-hidden='true']");
    const fill = track?.firstElementChild;

    expect(screen.getByText("Оценка: 100 баллов")).toBeInTheDocument();
    expect(fill).toHaveStyle({ width: "100%" });
  });
});
