import { useState } from "react";
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

  it("keeps aria-expanded true after a parent re-render while details stays open", () => {
    function Harness() {
      const [tick, setTick] = useState(0);
      return (
        <div>
          <button type="button" onClick={() => setTick((value) => value + 1)}>
            force-rerender
          </button>
          <span data-testid="rerender-tick">{tick}</span>
          <AccountMenuDisclosure
            triggerAriaLabel="Профиль: Оператор, Иван Петров"
            triggerClassName="inline-flex"
            panel={
              <DemoRoleSwitchMenu switcher={{ currentUserId: "user-1", roleLabel: "Оператор", users: demoUsers }} />
            }
          >
            Оператор
          </AccountMenuDisclosure>
        </div>
      );
    }

    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Профиль: Оператор, Иван Петров" });
    fireEvent.pointerDown(trigger);
    fireEvent.pointerUp(trigger);
    fireEvent.click(trigger);

    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(trigger.closest("details")?.hasAttribute("open")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "force-rerender" }));
    expect(screen.getByTestId("rerender-tick").textContent).toBe("1");
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(trigger.closest("details")?.hasAttribute("open")).toBe(true);
    expect(screen.getByRole("menuitem", { name: "Анна QA · Проверяющий · Демо" })).not.toBeNull();
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
