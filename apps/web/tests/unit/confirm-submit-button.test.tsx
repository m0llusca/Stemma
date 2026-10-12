import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { FormEvent, MouseEvent } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";

afterEach(() => vi.restoreAllMocks());

function renderForm(options: { required?: boolean; onClick?: (event: MouseEvent<HTMLButtonElement>) => void } = {}) {
  const onSubmit = vi.fn((event: FormEvent<HTMLFormElement>) => event.preventDefault());
  render(
    <form onSubmit={onSubmit}>
      <input aria-label="Название" name="title" required={options.required} />
      <ConfirmSubmitButton name="operation" value="delete" formAction="/delete-source" confirmMessage="Источник будет удалён навсегда." onClick={options.onClick}>
        Удалить источник
      </ConfirmSubmitButton>
    </form>
  );
  const button = screen.getByRole("button", { name: "Удалить источник" }) as HTMLButtonElement;
  return { button, onSubmit };
}

async function openDialog(button: HTMLButtonElement) {
  fireEvent.click(button);
  return screen.findByRole("alertdialog", { name: "Подтвердите действие" });
}

describe("ConfirmSubmitButton", () => {
  it("opens an accessible dialog with cancel focus and leaves the form untouched after cancellation", async () => {
    const { button, onSubmit } = renderForm();
    const dialog = await openDialog(button);
    expect(within(dialog).getByText("Источник будет удалён навсегда.")).toBeDefined();
    const cancel = within(dialog).getByRole("button", { name: "Отмена" });
    await waitFor(() => expect(document.activeElement).toBe(cancel));
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.click(cancel);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(onSubmit).not.toHaveBeenCalled();
    await waitFor(() => expect(document.activeElement).toBe(button));
  });

  it("submits once through the original button, retaining its name, value and form action", async () => {
    const onClick = vi.fn();
    const { button, onSubmit } = renderForm({ onClick });
    const dialog = await openDialog(button);
    expect(onClick).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
    const confirm = within(dialog).getByRole("button", { name: "Подтвердить" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onClick).toHaveBeenCalledTimes(1);
    const submitter = (onSubmit.mock.calls[0][0].nativeEvent as SubmitEvent).submitter;
    expect(submitter).toBe(button);
    expect(button.name).toBe("operation");
    expect(button.value).toBe("delete");
    expect(button.getAttribute("formaction")).toBe("/delete-source");
    const data = new FormData(button.form!, button);
    expect(data.get("operation")).toBe("delete");
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });

  it("uses the confirmed click event so a consumer can cancel submission with preventDefault", async () => {
    const onClick = vi.fn((event: MouseEvent<HTMLButtonElement>) => event.preventDefault());
    const { button, onSubmit } = renderForm({ onClick });
    const dialog = await openDialog(button);
    fireEvent.click(within(dialog).getByRole("button", { name: "Подтвердить" }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });

  it("does not open confirmation for an invalid form", async () => {
    const { button, onSubmit } = renderForm({ required: true });
    const invalid = vi.fn();
    screen.getByRole("textbox", { name: "Название" }).addEventListener("invalid", invalid);
    fireEvent.click(button);
    expect(invalid).toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("rechecks native validation when a valid form becomes invalid while confirmation is open", async () => {
    const { button, onSubmit } = renderForm({ required: true });
    const input = screen.getByRole("textbox", { name: "Название" });
    fireEvent.change(input, { target: { value: "Источник" } });
    const dialog = await openDialog(button);
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Подтвердить" }));
    expect(onSubmit).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });

  it("confirms a standalone destructive action without submitting a form", async () => {
    const onClick = vi.fn();
    render(<ConfirmSubmitButton type="button" confirmMessage="Критерий будет удалён." onClick={onClick}>Удалить критерий</ConfirmSubmitButton>);
    const button = screen.getByRole("button", { name: "Удалить критерий" }) as HTMLButtonElement;
    const dialog = await openDialog(button);
    expect(onClick).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Подтвердить" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
