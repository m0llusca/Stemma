import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AccountMenuDisclosure, DemoRoleSwitchMenu } from "@/components/auth/demo-role-switch";

vi.mock("@/lib/user-actions", () => ({
  switchCurrentUser: vi.fn()
}));

const demoUsers = [
  {
    id: "user-1",
    name: "Иван Петров",
    roleLabel: "Оператор",
    optionLabel: "Иван Петров · Оператор · Демо"
  },
  {
    id: "user-2",
    name: "Анна QA",
    roleLabel: "Проверяющий",
    optionLabel: "Анна QA · Проверяющий · Демо"
  }
];

describe("AccountMenuDisclosure", () => {
  it("opens on a real pointer sequence and keeps aria-expanded true with DEMO roles visible", () => {
    render(
      <AccountMenuDisclosure
        triggerAriaLabel="Профиль: Оператор, Иван Петров"
        triggerClassName="inline-flex"
        panel={<DemoRoleSwitchMenu switcher={{ currentUserId: "user-1", roleLabel: "Оператор", users: demoUsers }} />}
      >
        Оператор
      </AccountMenuDisclosure>
    );

    const trigger = screen.getByRole("button", { name: "Профиль: Оператор, Иван Петров" });
    expect(trigger.getAttribute("data-slot")).toBe("account-menu");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.closest("details")?.hasAttribute("open")).toBe(false);
    expect(screen.queryByRole("menuitem", { name: "Анна QA · Проверяющий · Демо" })).toBeNull();

    fireEvent.pointerDown(trigger);
    fireEvent.pointerUp(trigger);
    fireEvent.click(trigger);

    expect(trigger.closest("details")?.hasAttribute("open")).toBe(true);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("menuitem", { name: "Иван Петров · Оператор · Демо" })).not.toBeNull();
    expect(screen.getByRole("menuitem", { name: "Анна QA · Проверяющий · Демо" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Сменить роль" })).toBeNull();
  });

  it("stays open after timers flush so a leftover document pointerdown is not required to keep state", () => {
    render(
      <AccountMenuDisclosure
        triggerAriaLabel="Профиль: Оператор, Иван Петров"
        triggerClassName="inline-flex"
        panel={<DemoRoleSwitchMenu switcher={{ currentUserId: "user-1", roleLabel: "Оператор", users: demoUsers }} />}
      >
        Оператор
      </AccountMenuDisclosure>
    );

    const trigger = screen.getByRole("button", { name: "Профиль: Оператор, Иван Петров" });
    fireEvent.pointerDown(trigger);
    fireEvent.pointerUp(trigger);
    fireEvent.click(trigger);
    fireEvent.pointerDown(document.body);

    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("menuitem", { name: "Анна QA · Проверяющий · Демо" })).not.toBeNull();
  });
});
