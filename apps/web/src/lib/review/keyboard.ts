/**
 * Pure keyboard model for the review workbench (no DOM, no React).
 *
 * Contract: docs/ux-queue-hotkeys-contract.md
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

/** Input types that still leave workbench hotkeys active (not "typing"). */
const NON_TYPING_INPUT_TYPES = new Set([
  "button",
  "checkbox",
  "radio",
  "submit",
  "reset",
  "file",
  "image",
  "range",
  "color",
  "hidden"
]);

/**
 * True when the event target is a typing / form-text surface.
 * Hotkeys must never steal keys here (contract: docs/ux-queue-hotkeys-contract.md).
 */
export function isEditableTarget(element: EventTarget | null): boolean {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  const contentEditableAttr = element.getAttribute("contenteditable");
  if (
    element.isContentEditable ||
    element.contentEditable === "true" ||
    contentEditableAttr === "true" ||
    contentEditableAttr === ""
  ) {
    return true;
  }

  const tag = element.tagName;

  if (tag === "TEXTAREA" || tag === "SELECT") {
    return true;
  }

  if (tag === "INPUT") {
    const type = (element as HTMLInputElement).type || "text";
    return !NON_TYPING_INPUT_TYPES.has(type.toLowerCase());
  }

  return false;
}

export type ReviewHotkeyAction =
  | { type: "navigate"; key: string }
  | { type: "score"; option: ScoreOption }
  | { type: "toggle_legend" }
  | { type: "expand_focused" }
  | { type: "escape" }
  | { type: "submit_finalize_next" };

export type ReviewHotkeyInput = {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
  targetIsEditable: boolean;
  criterionCount: number;
};

/**
 * Resolve a keydown into a workbench hotkey action, or null when the event
 * must be left alone (editable target, unrelated chord, no criteria, …).
 */
export function resolveReviewHotkey(input: ReviewHotkeyInput): ReviewHotkeyAction | null {
  if (input.defaultPrevented || input.targetIsEditable) {
    return null;
  }

  const isMod = input.metaKey || input.ctrlKey;

  if (isMod && input.key === "Enter" && !input.altKey) {
    return { type: "submit_finalize_next" };
  }

  // Let real shortcuts (copy/paste, devtools, etc.) through untouched.
  if (isMod || input.altKey) {
    return null;
  }

  if (input.key === "?") {
    return { type: "toggle_legend" };
  }

  if (input.key === "Escape") {
    return { type: "escape" };
  }

  if (input.criterionCount === 0) {
    return null;
  }

  if (input.key === "Enter") {
    return { type: "expand_focused" };
  }

  if (NEXT_KEYS.has(input.key) || PREV_KEYS.has(input.key)) {
    return { type: "navigate", key: input.key };
  }

  const option = scoreKeyToOption(input.key);

  if (option) {
    return { type: "score", option };
  }

  return null;
}

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
