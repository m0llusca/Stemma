import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { CoachCallout } from "@/components/guidance/coach-callout";

describe("CoachCallout", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    storage.clear();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        clear: () => storage.clear(),
        getItem: (key: string) => storage.get(key) ?? null,
        removeItem: (key: string) => storage.delete(key),
        setItem: (key: string, value: string) => storage.set(key, value)
      }
    });
  });

  it("renders a spotlight coachmark with an anchor and compact action", () => {
    const { container } = render(
      <CoachCallout
        title="Настройте правила"
        body="Выберите условия, по которым обращения автоматически попадут в проверку."
        href="/admin/sampling?section=create"
        actionLabel="Создать"
        variant="spotlight"
        placement="left"
        anchorLabel="Подсказка к правилам"
        stepIndex={2}
      />
    );

    const callout = screen.getByRole("region", { name: "Настройте правила" });

    expect(callout).toHaveAttribute("data-variant", "spotlight");
    expect(callout).toHaveAttribute("data-placement", "left");
    expect(screen.getByRole("img", { name: "Подсказка к правилам" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Создать/ })).toHaveAttribute("href", "/admin/sampling?section=create");
    expect(container.querySelector("[data-step-index='2']")).toHaveTextContent("2");
  });

  it("can be dismissed and stays hidden for the same dismiss id", async () => {
    const { unmount } = render(
      <CoachCallout
        title="Настройте правила"
        body="Выберите условия."
        dismissId="settings:sampling"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Скрыть подсказку" }));

    expect(window.localStorage.getItem("qc:coach-callout:settings:sampling")).toBe("1");
    expect(screen.queryByRole("region", { name: "Настройте правила" })).not.toBeInTheDocument();

    unmount();
    render(
      <CoachCallout
        title="Настройте правила"
        body="Выберите условия."
        dismissId="settings:sampling"
      />
    );

    await waitFor(() => {
      expect(screen.queryByRole("region", { name: "Настройте правила" })).not.toBeInTheDocument();
    });
  });
});
