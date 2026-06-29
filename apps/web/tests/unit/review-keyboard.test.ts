import { describe, expect, it } from "vitest";
import {
  initialReviewKeyboardState,
  reduceReviewKey,
  scoreKeyToOption,
  type ReviewKeyboardState
} from "@/lib/review/keyboard";

const state = (focusedIndex: number): ReviewKeyboardState => ({ focusedIndex });

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
