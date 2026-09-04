import { describe, expect, it } from "vitest";
import {
  initialReviewKeyboardState,
  isEditableTarget,
  reduceReviewKey,
  resolveReviewHotkey,
  scoreKeyToOption,
  type ReviewHotkeyInput,
  type ReviewKeyboardState
} from "@/lib/review/keyboard";

const state = (focusedIndex: number): ReviewKeyboardState => ({ focusedIndex });

const baseHotkey = (overrides: Partial<ReviewHotkeyInput> = {}): ReviewHotkeyInput => ({
  key: "j",
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  defaultPrevented: false,
  targetIsEditable: false,
  criterionCount: 3,
  ...overrides
});

describe("reduceReviewKey", () => {
  it("moves focus down on 'j' and 'ArrowDown'", () => {
    expect(reduceReviewKey(state(0), "j", 5)).toEqual(state(1));
    expect(reduceReviewKey(state(0), "ArrowDown", 5)).toEqual(state(1));
  });

  it("moves focus up on 'k' and 'ArrowUp'", () => {
    expect(reduceReviewKey(state(3), "k", 5)).toEqual(state(2));
    expect(reduceReviewKey(state(3), "ArrowUp", 5)).toEqual(state(2));
  });

  it("clamps at the bottom bound (count - 1)", () => {
    expect(reduceReviewKey(state(4), "j", 5)).toEqual(state(4));
    expect(reduceReviewKey(state(4), "ArrowDown", 5)).toEqual(state(4));
  });

  it("clamps at the top bound (0)", () => {
    expect(reduceReviewKey(state(0), "k", 5)).toEqual(state(0));
    expect(reduceReviewKey(state(0), "ArrowUp", 5)).toEqual(state(0));
  });

  it("never returns a negative index even when the count is zero", () => {
    expect(reduceReviewKey(state(0), "j", 0)).toEqual(state(0));
    expect(reduceReviewKey(state(0), "k", 0)).toEqual(state(0));
  });

  it("leaves state unchanged for unrelated keys", () => {
    expect(reduceReviewKey(state(2), "1", 5)).toEqual(state(2));
    expect(reduceReviewKey(state(2), "x", 5)).toEqual(state(2));
    expect(reduceReviewKey(state(2), "Enter", 5)).toEqual(state(2));
  });

  it("returns the same reference when nothing changes (no needless re-render)", () => {
    const current = state(2);
    expect(reduceReviewKey(current, "x", 5)).toBe(current);
    const clamped = state(4);
    expect(reduceReviewKey(clamped, "j", 5)).toBe(clamped);
  });
});

describe("scoreKeyToOption", () => {
  it("maps the digit keys to stable score tokens", () => {
    expect(scoreKeyToOption("1")).toBe("pass");
    expect(scoreKeyToOption("2")).toBe("partial");
    expect(scoreKeyToOption("3")).toBe("fail");
  });

  it("returns null for any other key", () => {
    expect(scoreKeyToOption("4")).toBeNull();
    expect(scoreKeyToOption("0")).toBeNull();
    expect(scoreKeyToOption("j")).toBeNull();
    expect(scoreKeyToOption("Enter")).toBeNull();
    expect(scoreKeyToOption("")).toBeNull();
  });
});

describe("initialReviewKeyboardState", () => {
  it("starts focused on the first criterion", () => {
    expect(initialReviewKeyboardState).toEqual(state(0));
  });
});

describe("isEditableTarget (hotkey-in-input guard)", () => {
  it("blocks typing surfaces", () => {
    expect(isEditableTarget(document.createElement("textarea"))).toBe(true);
    expect(isEditableTarget(document.createElement("select"))).toBe(true);

    const text = document.createElement("input");
    text.type = "text";
    expect(isEditableTarget(text)).toBe(true);

    const search = document.createElement("input");
    search.type = "search";
    expect(isEditableTarget(search)).toBe(true);

    const editable = document.createElement("div");
    editable.contentEditable = "true";
    expect(isEditableTarget(editable)).toBe(true);
  });

  it("allows radios, checkboxes, and buttons so criterion scoring stays reachable", () => {
    const radio = document.createElement("input");
    radio.type = "radio";
    expect(isEditableTarget(radio)).toBe(false);

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    expect(isEditableTarget(checkbox)).toBe(false);

    expect(isEditableTarget(document.createElement("button"))).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});

describe("resolveReviewHotkey (locked contract)", () => {
  it("never steals keys in editable targets", () => {
    expect(resolveReviewHotkey(baseHotkey({ key: "j", targetIsEditable: true }))).toBeNull();
    expect(resolveReviewHotkey(baseHotkey({ key: "1", targetIsEditable: true }))).toBeNull();
    expect(resolveReviewHotkey(baseHotkey({ key: "Enter", metaKey: true, targetIsEditable: true }))).toBeNull();
    expect(resolveReviewHotkey(baseHotkey({ key: "?", targetIsEditable: true }))).toBeNull();
  });

  it("maps j/k navigation and digit scores when criteria exist", () => {
    expect(resolveReviewHotkey(baseHotkey({ key: "j" }))).toEqual({ type: "navigate", key: "j" });
    expect(resolveReviewHotkey(baseHotkey({ key: "k" }))).toEqual({ type: "navigate", key: "k" });
    expect(resolveReviewHotkey(baseHotkey({ key: "1" }))).toEqual({ type: "score", option: "pass" });
    expect(resolveReviewHotkey(baseHotkey({ key: "2" }))).toEqual({ type: "score", option: "partial" });
    expect(resolveReviewHotkey(baseHotkey({ key: "3" }))).toEqual({ type: "score", option: "fail" });
  });

  it("maps Enter / Esc / ? / Cmd|Ctrl+Enter", () => {
    expect(resolveReviewHotkey(baseHotkey({ key: "Enter" }))).toEqual({ type: "expand_focused" });
    expect(resolveReviewHotkey(baseHotkey({ key: "Escape" }))).toEqual({ type: "escape" });
    expect(resolveReviewHotkey(baseHotkey({ key: "?" }))).toEqual({ type: "toggle_legend" });
    expect(resolveReviewHotkey(baseHotkey({ key: "Enter", metaKey: true }))).toEqual({
      type: "submit_finalize_next"
    });
    expect(resolveReviewHotkey(baseHotkey({ key: "Enter", ctrlKey: true }))).toEqual({
      type: "submit_finalize_next"
    });
  });

  it("ignores unrelated modifier chords and empty criterion lists for scoring nav", () => {
    expect(resolveReviewHotkey(baseHotkey({ key: "s", metaKey: true }))).toBeNull();
    expect(resolveReviewHotkey(baseHotkey({ key: "Enter", altKey: true }))).toBeNull();
    expect(resolveReviewHotkey(baseHotkey({ key: "j", criterionCount: 0 }))).toBeNull();
    expect(resolveReviewHotkey(baseHotkey({ key: "1", criterionCount: 0 }))).toBeNull();
    // Escape / ? / Cmd+Enter still work without criteria (legend / finish-next).
    expect(resolveReviewHotkey(baseHotkey({ key: "Escape", criterionCount: 0 }))).toEqual({
      type: "escape"
    });
    expect(resolveReviewHotkey(baseHotkey({ key: "?", criterionCount: 0 }))).toEqual({
      type: "toggle_legend"
    });
    expect(
      resolveReviewHotkey(baseHotkey({ key: "Enter", metaKey: true, criterionCount: 0 }))
    ).toEqual({ type: "submit_finalize_next" });
  });
});
