import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Menubar, MenubarContent, MenubarItem, MenubarMenu, MenubarTrigger } from "@/components/ui/menubar";

function Example() {
  return <>
    <button type="button">До меню</button>
    <Menubar modal={false} aria-label="Действия">
      <MenubarMenu>
        <MenubarTrigger>Документ</MenubarTrigger>
        <MenubarContent>
          <MenubarItem render={<a href="/reports?view=overview" />} nativeButton={false}>Обзор</MenubarItem>
          <MenubarItem render={<a href="/reports?view=process" />} nativeButton={false}>Процесс</MenubarItem>
        </MenubarContent>
      </MenubarMenu>
      <MenubarMenu>
        <MenubarTrigger>Экспорт</MenubarTrigger>
        <MenubarContent>
          <MenubarItem render={<a href="/reports/export?period=custom" />} nativeButton={false}>CSV</MenubarItem>
        </MenubarContent>
      </MenubarMenu>
    </Menubar>
    <button type="button">После меню</button>
  </>;
}

describe("Menubar composition", () => {
  it("opens portalled native links with ArrowDown and restores the trigger after Escape", async () => {
    render(<Example />);
    const trigger = screen.getByRole("menuitem", { name: "Документ" });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const overview = await screen.findByRole("menuitem", { name: "Обзор" });
    expect(overview.tagName).toBe("A");
    expect(overview).toHaveAttribute("href", "/reports?view=overview");
    const menubar = screen.getByRole("menubar", { name: "Действия" });
    expect(menubar).not.toContainElement(overview);
    // Exposed VoiceOver guard buttons must never become menubar descendants.
    expect(menubar.querySelector('[data-slot="menubar-portal-layer"]')).toBeNull();
    expect(menubar.querySelector('[data-base-ui-focus-guard]')).toBeNull();
    await waitFor(() => expect(overview).toHaveFocus());
    fireEvent.keyDown(overview, { key: "ArrowDown" });
    await waitFor(() => expect(screen.getByRole("menuitem", { name: "Процесс" })).toHaveFocus());
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("keeps bidirectional roving trigger focus and restores Export after Escape", async () => {
    render(<Example />);
    const documentTrigger = screen.getByRole("menuitem", { name: "Документ" });
    const exportTrigger = screen.getByRole("menuitem", { name: "Экспорт" });
    documentTrigger.focus();
    fireEvent.keyDown(documentTrigger, { key: "ArrowRight" });
    await waitFor(() => expect(exportTrigger).toHaveFocus());
    fireEvent.keyDown(exportTrigger, { key: "ArrowLeft" });
    await waitFor(() => expect(documentTrigger).toHaveFocus());
    fireEvent.keyDown(documentTrigger, { key: "ArrowRight" });
    await waitFor(() => expect(exportTrigger).toHaveFocus());
    fireEvent.keyDown(exportTrigger, { key: "ArrowDown" });
    const csv = await screen.findByRole("menuitem", { name: "CSV" });
    await waitFor(() => expect(csv).toHaveFocus());
    // Native Tab traversal through portal guards belongs to browser coverage.
    fireEvent.keyDown(csv, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
    expect(exportTrigger).toHaveFocus();
  });
});
