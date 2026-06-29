import { afterEach, describe, expect, it, vi } from "vitest";
import { createToastStore } from "@/lib/ui/toast-store";

afterEach(() => {
  vi.useRealTimers();
});

describe("createToastStore", () => {
  it("starts empty", () => {
    const store = createToastStore();
    expect(store.getToasts()).toEqual([]);
  });

  it("pushes a toast with a generated id and the given tone and message", () => {
    const store = createToastStore();
    const id = store.push({ tone: "success", message: "Сохранено" });

    const toasts = store.getToasts();
    expect(toasts).toHaveLength(1);
    expect(toasts[0]).toMatchObject({ id, tone: "success", message: "Сохранено" });
    expect(typeof id).toBe("string");
  });

  it("generates unique ids for successive toasts", () => {
    const store = createToastStore();
    const first = store.push({ tone: "success", message: "A" });
    const second = store.push({ tone: "error", message: "B" });
    expect(first).not.toBe(second);
    expect(store.getToasts().map((toast) => toast.id)).toEqual([first, second]);
  });

  it("notifies subscribers on push and dismiss", () => {
    const store = createToastStore();
    const listener = vi.fn();
    store.subscribe(listener);

    const id = store.push({ tone: "error", message: "Ошибка" });
    expect(listener).toHaveBeenCalledTimes(1);

    store.dismiss(id);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(store.getToasts()).toEqual([]);
  });

  it("stops notifying after unsubscribe", () => {
    const store = createToastStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    unsubscribe();
    store.push({ tone: "success", message: "A" });
    expect(listener).not.toHaveBeenCalled();
  });

  it("auto-dismisses a toast after its duration", () => {
    vi.useFakeTimers();
    const store = createToastStore();
    store.push({ tone: "success", message: "Готово", duration: 4000 });

    expect(store.getToasts()).toHaveLength(1);
    vi.advanceTimersByTime(3999);
    expect(store.getToasts()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(store.getToasts()).toHaveLength(0);
  });

  it("does not auto-dismiss when duration is 0", () => {
    vi.useFakeTimers();
    const store = createToastStore();
    store.push({ tone: "error", message: "Останется", duration: 0 });

    vi.advanceTimersByTime(60_000);
    expect(store.getToasts()).toHaveLength(1);
  });

  it("clears a pending auto-dismiss timer when dismissed early", () => {
    vi.useFakeTimers();
    const store = createToastStore();
    const listener = vi.fn();
    const id = store.push({ tone: "success", message: "A", duration: 5000 });
    store.subscribe(listener);

    store.dismiss(id);
    expect(store.getToasts()).toHaveLength(0);

    // Advancing past the original duration must not fire a second change.
    vi.advanceTimersByTime(5000);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
