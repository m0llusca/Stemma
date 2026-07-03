import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdminDialog } from "@/components/admin/admin-dialog";

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/tokens"
}));

describe("AdminDialog", () => {
  it("stays closed until the trigger is pressed and opens as a modal dialog", () => {
    render(
      <AdminDialog triggerLabel="Новый ключ" triggerClassName="action-button action-button--primary" title="Новый ключ">
        <p>Форма</p>
      </AdminDialog>
    );

    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Новый ключ" }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).not.toBeNull();
    // Заголовок связан с диалогом для скринридеров.
    expect(dialog.getAttribute("aria-labelledby")).toBeTruthy();
    expect(screen.getByText("Форма")).not.toBeNull();
  });

  it("closes via the close button", () => {
    render(
      <AdminDialog triggerLabel="Новый ключ" title="Новый ключ">
        <p>Форма</p>
      </AdminDialog>
    );

    fireEvent.click(screen.getByRole("button", { name: "Новый ключ" }));
    expect(screen.getByRole("dialog")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Закрыть окно" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens immediately when defaultOpen is set (deep link ?section=create)", () => {
    render(
      <AdminDialog triggerLabel="Новый ключ" title="Новый ключ" defaultOpen>
        <p>Форма</p>
      </AdminDialog>
    );

    expect(screen.getByRole("dialog")).not.toBeNull();
  });
});
