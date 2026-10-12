import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ReportDateRange } from "@/components/reports/report-date-range";

describe("ReportDateRange", () => {
  it("keeps a manual draft until apply, rejects incomplete/reversed/oversized dates, and cancels", () => {
    const apply = vi.fn();
    render(<ReportDateRange idPrefix="range" start="2026-10-01" end="2026-10-12" onApply={apply} />);
    const from = screen.getByLabelText("С даты");
    const to = screen.getByLabelText("По дату");
    const button = screen.getByRole("button", { name: "Применить период" });
    fireEvent.change(from, { target: { value: "2026-10-13" } });
    expect(button).toBeDisabled();
    expect(apply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Отменить" }));
    expect(from).toHaveValue("2026-10-01");
    fireEvent.change(to, { target: { value: "" } });
    expect(button).toBeDisabled();
    fireEvent.change(from, { target: { value: "2025-01-01" } });
    fireEvent.change(to, { target: { value: "2026-01-02" } });
    expect(button).toBeDisabled();
    fireEvent.change(to, { target: { value: "2026-01-01" } });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(apply).toHaveBeenCalledExactlyOnceWith("2025-01-01", "2026-01-01");
  });

  it("loads the Russian calendar on demand and applies local calendar dates only after both clicks", async () => {
    const apply = vi.fn();
    const { container } = render(<ReportDateRange idPrefix="range" start="2026-10-01" end="2026-10-12" onApply={apply} />);
    expect(container.querySelector('[data-slot="calendar"]')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Выбрать в календаре" }));
    await waitFor(() => expect(container.querySelector('[data-slot="calendar"]')).toBeInTheDocument(), { timeout: 10000 });
    expect(screen.getByText(/октябрь 2026/i)).toBeInTheDocument();
    const day = container.querySelector('button[data-day="31.10.2026"]') as HTMLButtonElement;
    expect(day).toBeInTheDocument();
    fireEvent.click(day);
    expect(screen.getByLabelText("С даты")).toHaveValue("2026-10-31");
    expect(screen.getByLabelText("По дату")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Применить период" })).toBeDisabled();
    expect(apply).not.toHaveBeenCalled();
    fireEvent.click(container.querySelector('button[data-day="31.10.2026"]') as HTMLButtonElement);
    expect(screen.getByLabelText("По дату")).toHaveValue("2026-10-31");
    fireEvent.click(screen.getByRole("button", { name: "Применить период" }));
    expect(apply).toHaveBeenCalledExactlyOnceWith("2026-10-31", "2026-10-31");
    fireEvent.click(screen.getByRole("button", { name: "Отменить" }));
    expect(screen.getByLabelText("С даты")).toHaveValue("2026-10-01");
    expect(screen.getByLabelText("По дату")).toHaveValue("2026-10-12");
    expect(container.querySelector('[data-slot="calendar"]')).not.toBeInTheDocument();
  }, 15000);
});
