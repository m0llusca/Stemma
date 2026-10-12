import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CriterionGuidance } from "@/components/review/criterion-guidance";

describe("criterion guidance", () => {
  it("keeps required scoring guidance readable without opening the preview", () => {
    render(<form><CriterionGuidance label="Точность" kind="SCALE_1_3" weight={25} required /></form>);
    expect(screen.getByText(/3 — стандарт, 2 — доработка, 1 — не соответствует/)).toBeVisible();
    expect(screen.getByText(/Обязательный критерий\. Вес: 25%/)).toBeVisible();
    const trigger = screen.getByRole("button", { name: "Справка по критерию: Точность" });
    expect(trigger).toHaveAttribute("type", "button");
    expect([...new FormData(trigger.closest("form")!).entries()]).toEqual([]);
  });

  it("uses binary guidance and the actual optional criterion metadata", () => {
    render(<CriterionGuidance label="Тон" kind="PASS_FAIL" weight={10} required={false} />);
    expect(screen.getByText(/Зачёт — критерий выполнен, незачёт — не выполнен/)).toBeVisible();
    expect(screen.getByText(/Необязательный критерий\. Вес: 10%/)).toBeVisible();
  });
});
