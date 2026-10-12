import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { FormEvent } from "react";
import { QueuePersonFilter } from "@/components/review/queue-person-filter";

const options = [
  { value: "qa-1", label: "Анна" },
  { value: "qa-2", label: "Анна" },
  ...Array.from({ length: 6 }, (_, index) => ({ value: `qa-${index + 3}`, label: `Проверяющий ${index + 3}` }))
];

describe("QueuePersonFilter", () => {
  it("searches without submission and submits one exact value for duplicate labels or clear", async () => {
    const submitted: FormData[] = [];
    const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      submitted.push(new FormData(event.currentTarget));
    });
    render(<>
      <form id="people-filter-form" onSubmit={onSubmit} />
      <div onInput={() => { throw new Error("Search leaked to auto-submit parent"); }}>
        <QueuePersonFilter id="qa" name="qaAssignee" label="Проверяющий" formId="people-filter-form" value="qa-1" options={options} />
      </div>
    </>);
    const form = document.getElementById("people-filter-form") as HTMLFormElement;
    expect(new FormData(form).getAll("qaAssignee")).toEqual(["qa-1"]);
    const input = screen.getByRole("combobox", { name: "Проверяющий" });
    fireEvent.change(input, { target: { value: "Ан" } });
    fireEvent.input(input, { target: { value: "Ан" } });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    const duplicateNames = await screen.findAllByRole("option", { name: "Анна" });
    expect(duplicateNames).toHaveLength(2);
    expect(screen.queryByRole("option", { name: "Проверяющий 3" })).not.toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.click(duplicateNames[1]);
    await waitFor(() => expect(submitted[0]?.getAll("qaAssignee")).toEqual(["qa-2"]));
    expect(new FormData(form).getAll("qaAssignee")).toEqual(["qa-2"]);
    fireEvent.click(screen.getByRole("button", { name: "Сбросить фильтр «Проверяющий»" }));
    expect(submitted[1]?.getAll("qaAssignee")).toEqual([""]);
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });

  it("keeps a short list native and preserves a selected value missing from the current catalog", () => {
    render(<form id="short-form"><QueuePersonFilter id="operator" name="assignee" label="Оператор" formId="short-form" value="archived-operator" options={[{ value: "operator-1", label: "Анна" }]} /></form>);
    expect(screen.getByRole("combobox")).toHaveValue("archived-operator");
    expect(new FormData(document.getElementById("short-form") as HTMLFormElement).getAll("assignee")).toEqual(["archived-operator"]);
  });
});
