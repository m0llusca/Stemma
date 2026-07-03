import { describe, expect, it } from "vitest";
import { resolveUndoTarget } from "@/lib/appearance-undo";

type State = { value: number };

const equals = (left: State, right: State) => left.value === right.value;

describe("resolveUndoTarget", () => {
  it("returns null when the current state matches the only persisted state", () => {
    const persisted = { value: 1 };

    expect(resolveUndoTarget(persisted, persisted, null, equals)).toBeNull();
    expect(resolveUndoTarget({ value: 1 }, { value: 1 }, null, equals)).toBeNull();
  });

  it("reverts unsaved changes back to the last persisted state", () => {
    const lastPersisted = { value: 1 };
    const current = { value: 2 };

    expect(resolveUndoTarget(current, lastPersisted, null, equals)).toBe(lastPersisted);
  });

  it("prefers reverting unsaved changes even when a previous persisted step exists", () => {
    const previousPersisted = { value: 0 };
    const lastPersisted = { value: 1 };
    const current = { value: 2 };

    expect(resolveUndoTarget(current, lastPersisted, previousPersisted, equals)).toBe(lastPersisted);
  });

  it("reverts the last persisted step to the previous persisted state once saved", () => {
    const previousPersisted = { value: 0 };
    const lastPersisted = { value: 1 };

    expect(resolveUndoTarget({ value: 1 }, lastPersisted, previousPersisted, equals)).toBe(previousPersisted);
  });

  it("returns null when the previous persisted step equals the last persisted state", () => {
    const lastPersisted = { value: 1 };

    expect(resolveUndoTarget({ value: 1 }, lastPersisted, { value: 1 }, equals)).toBeNull();
  });
});
