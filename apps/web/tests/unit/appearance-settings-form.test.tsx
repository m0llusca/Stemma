import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppearanceSettingsForm } from "@/components/admin/appearance-settings-form";
import { resolveUiAppearance } from "@/lib/ui-theme";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  updateWorkspaceAppearance: vi.fn()
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh })
}));

vi.mock("@/lib/ui-theme-actions", () => ({
  updateWorkspaceAppearance: mocks.updateWorkspaceAppearance
}));

function deferred() {
  let resolve!: () => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}

function initialAppearance() {
  return resolveUiAppearance({
    uiTheme: "graphite",
    uiDensity: "comfortable",
    uiCorners: "medium",
    uiContrast: "standard"
  });
}

async function flushAsyncWork() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function openThemeTab() {
  fireEvent.click(screen.getByRole("tab", { name: "Тема" }));
}

describe("AppearanceSettingsForm persistence reconciliation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("PointerEvent", MouseEvent);
    mocks.refresh.mockReset();
    mocks.updateWorkspaceAppearance.mockReset();
    document.documentElement.className = "";
    document.documentElement.removeAttribute("style");
    delete document.documentElement.dataset.theme;
    delete document.documentElement.dataset.density;
    delete document.documentElement.dataset.corners;
    delete document.documentElement.dataset.contrast;
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("serializes rapid saves and refreshes exactly once for the winning state", async () => {
    const first = deferred();
    const second = deferred();
    mocks.updateWorkspaceAppearance
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);

    render(<AppearanceSettingsForm initialAppearance={initialAppearance()} />);
    openThemeTab();

    fireEvent.click(screen.getByRole("radio", { name: /Signal Blue/ }));
    act(() => {
      vi.advanceTimersByTime(180);
    });
    expect(mocks.updateWorkspaceAppearance).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("radio", { name: /Mint Steel/ }));
    act(() => {
      vi.advanceTimersByTime(180);
    });
    expect(mocks.updateWorkspaceAppearance).toHaveBeenCalledTimes(1);
    expect(document.documentElement.dataset.theme).toBe("emerald");

    first.resolve();
    await flushAsyncWork();

    expect(mocks.updateWorkspaceAppearance).toHaveBeenCalledTimes(2);
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(document.documentElement.dataset.theme).toBe("emerald");

    second.resolve();
    await flushAsyncWork();

    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(document.documentElement.dataset.theme).toBe("emerald");
    expect(
      (mocks.updateWorkspaceAppearance.mock.calls[1]?.[0] as FormData).get("uiTheme")
    ).toBe("emerald");
  });

  it("refreshes once when a stale numeric revision confirms the semantic winner", async () => {
    const pendingAzure = deferred();
    mocks.updateWorkspaceAppearance.mockImplementationOnce(
      () => pendingAzure.promise
    );

    render(<AppearanceSettingsForm initialAppearance={initialAppearance()} />);
    openThemeTab();

    fireEvent.click(screen.getByRole("radio", { name: /Signal Blue/ }));
    act(() => {
      vi.advanceTimersByTime(180);
    });

    fireEvent.click(screen.getByRole("radio", { name: /Mint Steel/ }));
    act(() => {
      vi.advanceTimersByTime(180);
    });
    fireEvent.click(screen.getByRole("radio", { name: /Signal Blue/ }));
    act(() => {
      vi.advanceTimersByTime(180);
    });

    expect(mocks.updateWorkspaceAppearance).toHaveBeenCalledTimes(1);
    expect(document.documentElement.dataset.theme).toBe("azure");

    pendingAzure.resolve();
    await flushAsyncWork();

    expect(mocks.updateWorkspaceAppearance).toHaveBeenCalledTimes(1);
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(document.documentElement.dataset.theme).toBe("azure");
  });

  it("corrects the server when a stale success differs from the queued winning state", async () => {
    const staleAzure = deferred();
    const winningGraphite = deferred();
    mocks.updateWorkspaceAppearance
      .mockImplementationOnce(() => staleAzure.promise)
      .mockImplementationOnce(() => winningGraphite.promise);

    render(<AppearanceSettingsForm initialAppearance={initialAppearance()} />);
    openThemeTab();

    fireEvent.click(screen.getByRole("radio", { name: /Signal Blue/ }));
    act(() => {
      vi.advanceTimersByTime(180);
    });

    fireEvent.click(screen.getByRole("radio", { name: /Graphite/ }));
    act(() => {
      vi.advanceTimersByTime(180);
    });

    expect(mocks.updateWorkspaceAppearance).toHaveBeenCalledTimes(1);
    expect(document.documentElement.dataset.theme).toBe("graphite");

    staleAzure.resolve();
    await flushAsyncWork();

    expect(mocks.updateWorkspaceAppearance).toHaveBeenCalledTimes(2);
    expect(
      (mocks.updateWorkspaceAppearance.mock.calls[1]?.[0] as FormData).get("uiTheme")
    ).toBe("graphite");
    expect(mocks.refresh).not.toHaveBeenCalled();

    winningGraphite.resolve();
    await flushAsyncWork();

    expect(document.documentElement.dataset.theme).toBe("graphite");
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("rolls a failed correction back to the latest server-confirmed stale success", async () => {
    const staleAzure = deferred();
    const rejectedGraphite = deferred();
    mocks.updateWorkspaceAppearance
      .mockImplementationOnce(() => staleAzure.promise)
      .mockImplementationOnce(() => rejectedGraphite.promise);

    const { unmount } = render(
      <AppearanceSettingsForm initialAppearance={initialAppearance()} />
    );
    openThemeTab();

    fireEvent.click(screen.getByRole("radio", { name: /Signal Blue/ }));
    act(() => {
      vi.advanceTimersByTime(180);
    });
    fireEvent.click(screen.getByRole("radio", { name: /Graphite/ }));
    act(() => {
      vi.advanceTimersByTime(180);
    });

    staleAzure.resolve();
    await flushAsyncWork();
    expect(mocks.updateWorkspaceAppearance).toHaveBeenCalledTimes(2);

    rejectedGraphite.reject(new Error("corrective save rejected"));
    await flushAsyncWork();

    expect(document.documentElement.dataset.theme).toBe("azure");
    expect(mocks.refresh).not.toHaveBeenCalled();

    unmount();

    expect(document.documentElement.dataset.theme).toBe("azure");
  });

  it("rolls a rejected latest preview back and preserves it after unmount", async () => {
    const rejected = deferred();
    mocks.updateWorkspaceAppearance.mockImplementationOnce(() => rejected.promise);
    const { unmount } = render(
      <AppearanceSettingsForm initialAppearance={initialAppearance()} />
    );
    openThemeTab();

    fireEvent.click(screen.getByRole("radio", { name: /Night Ops/ }));
    expect(document.documentElement.dataset.theme).toBe("ops");
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    act(() => {
      vi.advanceTimersByTime(180);
    });
    rejected.reject(new Error("save rejected"));
    await flushAsyncWork();

    expect(document.documentElement.dataset.theme).toBe("graphite");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(mocks.refresh).not.toHaveBeenCalled();

    unmount();

    expect(document.documentElement.dataset.theme).toBe("graphite");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("replaces rapid debounce timers and clears the pending save on unmount", () => {
    const { unmount } = render(
      <AppearanceSettingsForm initialAppearance={initialAppearance()} />
    );
    openThemeTab();
    const frameworkTimerCount = vi.getTimerCount();

    act(() => {
      fireEvent.click(screen.getByRole("radio", { name: /Signal Blue/ }));
      fireEvent.click(screen.getByRole("radio", { name: /Mint Steel/ }));
    });

    expect(vi.getTimerCount()).toBe(frameworkTimerCount + 1);
    unmount();
    expect(vi.getTimerCount()).toBe(frameworkTimerCount);

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(mocks.updateWorkspaceAppearance).not.toHaveBeenCalled();
  });
});
