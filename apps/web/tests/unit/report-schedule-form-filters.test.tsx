import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReportScheduleForm } from "@/components/admin/report-schedule-form";
import { createReportSchedule } from "@/lib/report-schedule-actions";

vi.mock("@/lib/report-schedule-actions", () => ({
  createReportSchedule: vi.fn(async () => ({ status: "success" as const, message: "ok" }))
}));

const createReportScheduleMock = vi.mocked(createReportSchedule);

beforeEach(() => {
  createReportScheduleMock.mockClear();
});

const options = {
  periodPresetOptions: [{ value: "last_7_days", label: "Последние 7 дней" }],
  cadenceOptions: [{ value: "weekly", label: "Еженедельно" }],
  formatOptions: [{ value: "xlsx", label: "XLSX" }]
};

function filtersTextarea() {
  return document.querySelector('textarea[name="filtersJson"]') as HTMLTextAreaElement;
}

describe("report schedule form filters validation", () => {
  it("lists the supported filter keys in the hint", () => {
    render(<ReportScheduleForm {...options} />);

    expect(screen.getByText(/supportLine/)).toBeDefined();
    expect(screen.getByText(/csatBucket/)).toBeDefined();
    expect(screen.getByText(/externalSource/)).toBeDefined();
    expect(screen.getByText(/assigneeName/)).toBeDefined();
  });

  it("shows an inline error and blocks submit for invalid JSON", async () => {
    render(<ReportScheduleForm {...options} />);
    const textarea = filtersTextarea();

    fireEvent.change(textarea, { target: { value: "{not json" } });
    fireEvent.blur(textarea);

    expect(screen.getByText(/Некорректный JSON/)).toBeDefined();
    expect(textarea.validity.customError).toBe(true);

    fireEvent.submit(textarea.closest("form") as HTMLFormElement);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(createReportScheduleMock).not.toHaveBeenCalled();
  });

  it("clears the error and shows a soft warning for valid JSON with unknown keys", async () => {
    render(<ReportScheduleForm {...options} />);
    const textarea = filtersTextarea();

    fireEvent.change(textarea, { target: { value: "{not json" } });
    fireEvent.blur(textarea);
    fireEvent.change(textarea, { target: { value: '{"supportLine":"L1","weird":true}' } });
    fireEvent.blur(textarea);

    expect(screen.queryByText(/Некорректный JSON/)).toBeNull();
    expect(textarea.validity.customError).toBe(false);
    expect(screen.getByText(/weird/)).toBeDefined();

    // Unknown keys warn but never block: the server action still runs.
    const nameInput = document.querySelector('input[name="name"]') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "Еженедельный отчет" } });
    fireEvent.submit(textarea.closest("form") as HTMLFormElement);

    await waitFor(() => expect(createReportScheduleMock).toHaveBeenCalledTimes(1));
  });

  it("accepts an empty filters field without errors or warnings", () => {
    render(<ReportScheduleForm {...options} />);
    const textarea = filtersTextarea();

    fireEvent.blur(textarea);

    expect(screen.queryByText(/Некорректный JSON/)).toBeNull();
    expect(textarea.validity.customError).toBe(false);
  });

  it("keeps the submit button enabled (pending-only disable pattern)", () => {
    render(<ReportScheduleForm {...options} />);
    const submit = screen.getByRole("button", { name: "Создать расписание" }) as HTMLButtonElement;

    expect(submit.disabled).toBe(false);
  });
});
