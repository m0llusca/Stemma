import { useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AccountMenuDisclosure,
  DemoRoleSwitchMenu,
  resetAccountMenuExpandedForTests
} from "@/components/auth/demo-role-switch";

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

function openViaUa(trigger: HTMLElement) {
  fireEvent.click(trigger);
  const details = trigger.closest("details");
  if (details && !details.open) {
    details.open = true;
  }
  if (details?.open && trigger.getAttribute("aria-expanded") !== "true") {
    fireEvent(details, new Event("toggle", { bubbles: true }));
  }
  return details;
}

describe("AccountMenuDisclosure", () => {
  beforeEach(() => {
    resetAccountMenuExpandedForTests();
  });

  it("sets aria-expanded in the same turn as a native toggle event", () => {
    renderMenu();
    const trigger = document.querySelector("[data-slot=account-menu]");
    const details = trigger?.closest("details");
    expect(trigger).not.toBeNull();
    expect(details).not.toBeNull();

    act(() => {
      details!.open = true;
      details!.dispatchEvent(new Event("toggle"));
    });
    expect(trigger!.getAttribute("aria-expanded")).toBe("true");
  });

  it("opens via native details and sets aria-expanded from the toggle event", () => {
    renderMenu();

    const trigger = screen.getByRole("button", { name: "Профиль: Оператор, Иван Петров" });
    expect(trigger.tagName).toBe("SUMMARY");
    expect(trigger.getAttribute("data-slot")).toBe("account-menu");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.closest("details")).not.toBeNull();
    expect(trigger.closest("details")?.open).toBe(false);

    const details = openViaUa(trigger);
    expect(details?.open).toBe(true);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("menuitem", { name: "Иван Петров · Оператор · Демо" })).not.toBeNull();
    expect(screen.getByRole("menuitem", { name: "Анна QA · Проверяющий · Демо" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Сменить роль" })).toBeNull();
  });

  it("keeps details.open and aria-expanded true after a parent re-render", () => {
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
    const trigger = screen.getByRole("button", { name: "Профиль: Оператор, Иван Петров" });
    openViaUa(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(trigger.closest("details")?.open).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "force-rerender" }));
    expect(screen.getByTestId("rerender-tick").textContent).toBe("1");
    expect(trigger.hasAttribute("aria-expanded")).toBe(true);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(trigger.closest("details")?.open).toBe(true);
    expect(screen.getByRole("menuitem", { name: "Анна QA · Проверяющий · Демо" })).not.toBeNull();
  });

  it("restores details.open and aria-expanded after remount from the mirrored flag", () => {
    const { unmount } = renderMenu();
    const trigger = screen.getByRole("button", { name: "Профиль: Оператор, Иван Петров" });
    openViaUa(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");

    unmount();
    renderMenu();

    const next = screen.getByRole("button", { name: "Профиль: Оператор, Иван Петров" });
    expect(next.closest("details")?.open).toBe(true);
    expect(next.getAttribute("aria-expanded")).toBe("true");
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
    const trigger = screen.getByRole("button", { name: "Профиль: Оператор, Иван Петров" });
    openViaUa(trigger);
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
    expect(trigger.closest("details")?.open).toBe(true);

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
    const closed = screen.getByRole("button", { name: "Профиль: Оператор, Иван Петров" });
    expect(closed.getAttribute("aria-expanded")).toBe("false");
    expect(closed.closest("details")?.open).toBe(false);
  });
});
