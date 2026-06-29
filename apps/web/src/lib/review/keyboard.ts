/**
 * Pure keyboard model for the review workbench (no DOM, no React).
 *
 * The reducer drives "focus" — which criterion card is the keyboard target —
 * while the actual scoring is applied by the client wiring against the existing
 * radio inputs. Keeping this layer pure makes the navigation logic unit-testable
 * and the wiring a thin DOM adapter.
 */

export type ReviewKeyboardState = {
  /** Index of the criterion the keyboard is focused on. */
  focusedIndex: number;
};

/** Keyboard starts focused on the first criterion. */
export const initialReviewKeyboardState: ReviewKeyboardState = { focusedIndex: 0 };

/** Stable score tokens — decoupled from the criterion kind and field names. */
export type ScoreOption = "pass" | "partial" | "fail";

const NEXT_KEYS = new Set(["j", "ArrowDown"]);
const PREV_KEYS = new Set(["k", "ArrowUp"]);

function clampIndex(index: number, criterionCount: number): number {
  // No criteria → no valid index; collapse to 0 rather than going negative.
  const upper = Math.max(0, criterionCount - 1);
  return Math.min(upper, Math.max(0, index));
}

/**
 * Advance keyboard focus. Returns the SAME state reference when the key is
 * unrelated or focus is already clamped at a bound, so callers can skip
 * re-renders on no-ops.
 */
export function reduceReviewKey(
  state: ReviewKeyboardState,
  key: string,
  criterionCount: number
): ReviewKeyboardState {
  if (NEXT_KEYS.has(key)) {
    const focusedIndex = clampIndex(state.focusedIndex + 1, criterionCount);
    return focusedIndex === state.focusedIndex ? state : { focusedIndex };
  }

  if (PREV_KEYS.has(key)) {
    const focusedIndex = clampIndex(state.focusedIndex - 1, criterionCount);
    return focusedIndex === state.focusedIndex ? state : { focusedIndex };
  }

  return state;
}

/**
 * Map the digit keys to a stable score token. 1 → pass, 2 → partial, 3 → fail.
 * Any other key returns null. The wiring translates the token to the concrete
 * radio input for the focused criterion (pass→3/true, partial→2, fail→1/false).
 */
export function scoreKeyToOption(key: string): ScoreOption | null {
  switch (key) {
    case "1":
      return "pass";
    case "2":
      return "partial";
    case "3":
      return "fail";
    default:
      return null;
  }
}
