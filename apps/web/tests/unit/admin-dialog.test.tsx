import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AdminDialog } from "@/components/admin/admin-dialog";

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/tokens"
}));

describe("AdminDialog", () => {
  it("stays closed until the trigger is pressed and opens as a shadcn dialog", async () => {
    render(
      <AdminDialog
        triggerLabel="Новый ключ"
        triggerClassName="gap-1.5"
        title="Новый ключ"
      >
        <p>Форма</p>
      </AdminDialog>
    );

    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Новый ключ" }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).not.toBeNull();
    // DialogTitle provides the accessible name for the dialog.
    expect(dialog).toHaveAccessibleName("Новый ключ");
    expect(screen.getByText("Форма")).not.toBeNull();
    // No legacy BEM surface classes — styled via shadcn Dialog tokens.
    expect(dialog.className).not.toMatch(/admin-dialog__/);
  });

  it("closes via the close button", async () => {
    render(
      <AdminDialog triggerLabel="Новый ключ" title="Новый ключ">
        <p>Форма</p>
      </AdminDialog>
    );

    fireEvent.click(screen.getByRole("button", { name: "Новый ключ" }));
    expect(await screen.findByRole("dialog")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Закрыть окно" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  it("opens immediately when defaultOpen is set (deep link ?section=create)", async () => {
    render(
      <AdminDialog triggerLabel="Новый ключ" title="Новый ключ" defaultOpen>
        <p>Форма</p>
      </AdminDialog>
    );

    expect(await screen.findByRole("dialog")).not.toBeNull();
    expect(screen.getByText("Форма")).not.toBeNull();
  });

  it("uses Dialog primitives rather than native dialog element", async () => {
    const { container } = render(
      <AdminDialog triggerLabel="Открыть" title="Заголовок" defaultOpen>
        <p>Контент</p>
      </AdminDialog>
    );

    await screen.findByRole("dialog");
    expect(container.querySelector("dialog.admin-dialog")).toBeNull();
    expect(document.querySelector("[data-slot='dialog-content']")).not.toBeNull();
  });

  it("keeps a long wide dialog inside the viewport and gives its body an internal scroll owner", async () => {
    render(
      <AdminDialog
        triggerLabel="Новая версия"
        title="Новая версия формы оценки"
        defaultOpen
        wide
      >
        <div>Первое поле</div>
        {Array.from({ length: 30 }, (_, index) => (
          <div key={index}>Критерий {index + 1}</div>
        ))}
        <button type="button">Последнее действие</button>
      </AdminDialog>
    );

    const dialog = await screen.findByRole("dialog", {
      name: "Новая версия формы оценки"
    });
    const scrollBody = dialog.querySelector("[data-slot='admin-dialog-body']");

    expect(dialog).toHaveClass(
      "max-h-[calc(100dvh-2rem)]",
      "grid-rows-[auto_minmax(0,1fr)]",
      "overflow-hidden"
    );
    expect(scrollBody).not.toBeNull();
    expect(scrollBody).toHaveClass("min-h-0", "overflow-y-auto", "overscroll-contain");
    expect(screen.getByRole("button", { name: "Последнее действие" })).toBeInTheDocument();
  });
});
