import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AccountMenuDisclosure,
  DemoRoleSwitchMenu,
  resetAccountMenuExpandedForTests
} from "@/components/auth/demo-role-switch";

vi.mock("@/lib/user-actions", () => ({
  switchCurrentUser: vi.fn()
}));

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);
Element.prototype.scrollIntoView = vi.fn();

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

function DemoPanel() {
  return <DemoRoleSwitchMenu switcher={{ currentUserId: "user-1", roleLabel: "Оператор", users: demoUsers }} />;
}

function renderMenu(dismissKey?: string) {
  return render(
    <AccountMenuDisclosure
      triggerAriaLabel="Профиль: Оператор, Иван Петров"
      triggerClassName="inline-flex"
      dismissKey={dismissKey}
      panel={<DemoPanel />}
    >
      Оператор
    </AccountMenuDisclosure>
  );
}

function openTrigger() {
  const trigger = screen.getByRole("button", { name: "Профиль: Оператор, Иван Петров" });
  fireEvent.click(trigger);
  return trigger;
}

describe("AccountMenuDisclosure", () => {
  beforeEach(() => {
    resetAccountMenuExpandedForTests();
  });

  it("opens on click like the area-menu DropdownMenu and shows DEMO roles", () => {
    renderMenu();

    const trigger = screen.getByRole("button", { name: "Профиль: Оператор, Иван Петров" });
    expect(trigger.tagName).toBe("BUTTON");
    expect(trigger.getAttribute("data-slot")).toBe("account-menu");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.closest("details")).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Анна QA · Проверяющий · Демо" })).toBeNull();

    fireEvent.click(trigger);

    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("menu")).not.toBeNull();
    expect(screen.getByRole("menuitem", { name: "Иван Петров · Оператор · Демо" })).not.toBeNull();
    expect(screen.getByRole("menuitem", { name: "Анна QA · Проверяющий · Демо" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Сменить роль" })).toBeNull();
  });

  it("keeps aria-expanded true after a parent re-render while the panel stays open", () => {
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
            panel={<DemoPanel />}
          >
            Оператор
          </AccountMenuDisclosure>
        </div>
      );
    }

    render(<Harness />);
    const trigger = openTrigger();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "force-rerender" }));
    expect(screen.getByTestId("rerender-tick").textContent).toBe("1");
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("menuitem", { name: "Анна QA · Проверяющий · Демо" })).not.toBeNull();
  });

  it("stays open across an unmount/remount (AppNav Suspense remount)", () => {
    const { unmount } = renderMenu();
    openTrigger();
    expect(screen.getByRole("button", { name: "Профиль: Оператор, Иван Петров" }).getAttribute("aria-expanded")).toBe(
      "true"
    );

    unmount();
    renderMenu();

    const trigger = screen.getByRole("button", { name: "Профиль: Оператор, Иван Петров" });
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("menuitem", { name: "Анна QA · Проверяющий · Демо" })).not.toBeNull();
  });

  it("closes only when dismissKey changes, not when it stays the same", () => {
    const { rerender } = render(
      <AccountMenuDisclosure
        triggerAriaLabel="Профиль: Оператор, Иван Петров"
        triggerClassName="inline-flex"
        dismissKey="/self-review"
        panel={<DemoPanel />}
      >
        Оператор
      </AccountMenuDisclosure>
    );
    const trigger = openTrigger();
    expect(trigger.getAttribute("aria-expanded")).toBe("true");

    rerender(
      <AccountMenuDisclosure
        triggerAriaLabel="Профиль: Оператор, Иван Петров"
        triggerClassName="inline-flex"
        dismissKey="/self-review"
        panel={<DemoPanel />}
      >
        Оператор
      </AccountMenuDisclosure>
    );
    expect(trigger.getAttribute("aria-expanded")).toBe("true");

    rerender(
      <AccountMenuDisclosure
        triggerAriaLabel="Профиль: Оператор, Иван Петров"
        triggerClassName="inline-flex"
        dismissKey="/coaching"
        panel={<DemoPanel />}
      >
        Оператор
      </AccountMenuDisclosure>
    );
    expect(screen.getByRole("button", { name: "Профиль: Оператор, Иван Петров" }).getAttribute("aria-expanded")).toBe(
      "false"
    );
    expect(screen.queryByRole("menuitem", { name: "Анна QA · Проверяющий · Демо" })).toBeNull();
  });
});
