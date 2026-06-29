"use client";

import { useEffect, useRef, useState } from "react";
import {
  initialReviewKeyboardState,
  reduceReviewKey,
  scoreKeyToOption,
  type ScoreOption
} from "@/lib/review/keyboard";
import styles from "./review-panel-workbench.module.css";

/**
 * Keyboard-first grading layer for the workbench. Mounts once inside the review
 * form (like EvidencePickerListener) and drives the EXISTING criterion cards and
 * radio inputs from the DOM — it never owns form state or field names.
 *
 *  - j / ArrowDown · k / ArrowUp  → move the focus ring between criterion cards
 *  - 1 / 2 / 3                    → set the focused criterion's score by clicking
 *                                   the matching existing radio (pass / partial /
 *                                   fail), so form state + submission stay intact
 *  - ?                            → reveal the shortcut legend in the footer hint
 *
 * Key events are ignored while an INPUT / TEXTAREA / SELECT / contentEditable is
 * focused, so typing comments or picking evidence is never hijacked.
 */

const CARD_SELECTOR = "[data-criterion-card]";

/** For a stable score token, the concrete radio value per field. */
function radioMatcher(card: HTMLElement, option: ScoreOption): HTMLInputElement | null {
  const scoreRadios = Array.from(
    card.querySelectorAll<HTMLInputElement>('input[type="radio"][name$=".score"]')
  );
  const passedRadios = Array.from(
    card.querySelectorAll<HTMLInputElement>('input[type="radio"][name$=".passed"]')
  );

  // SCALE_1_3 criterion: pass → 3, partial → 2, fail → 1.
  if (scoreRadios.length > 0) {
    const value = option === "pass" ? "3" : option === "partial" ? "2" : "1";
    return scoreRadios.find((radio) => radio.value === value) ?? null;
  }

  // Binary criterion: pass → true, fail → false; "partial" has no cell (no-op).
  if (passedRadios.length > 0) {
    if (option === "partial") {
      return null;
    }
    const value = option === "pass" ? "true" : "false";
    return passedRadios.find((radio) => radio.value === value) ?? null;
  }

  return null;
}

function isEditableTarget(element: Element | null): boolean {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  if (element.isContentEditable) {
    return true;
  }

  const tag = element.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export function ReviewKeyboard() {
  const stateRef = useRef(initialReviewKeyboardState);
  const [legendVisible, setLegendVisible] = useState(false);

  useEffect(() => {
    const root = document.querySelector(".review-panel-form");

    if (!(root instanceof HTMLElement)) {
      return;
    }

    function cards(): HTMLElement[] {
      return Array.from(root!.querySelectorAll<HTMLElement>(CARD_SELECTOR));
    }

    function paintFocus() {
      const all = cards();
      all.forEach((card, index) => {
        const focused = index === stateRef.current.focusedIndex;
        card.toggleAttribute("data-kbd-focused", focused);
      });
    }

    function focusCard(index: number) {
      const all = cards();
      const card = all[index];

      if (!card) {
        return;
      }

      // Open the disclosure so the just-focused card's controls are visible.
      if (card instanceof HTMLDetailsElement && !card.open) {
        card.open = true;
      }

      card.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    function applyScore(index: number, option: ScoreOption) {
      const card = cards()[index];

      if (!card) {
        return;
      }

      const radio = radioMatcher(card, option);

      if (!radio || radio.checked) {
        return;
      }

      // Click the existing radio so the form's controlled/uncontrolled state and
      // the CSS :checked styling update exactly as a user click would.
      radio.click();
    }

    function onKeyDown(event: KeyboardEvent) {
      // Never hijack typing in text fields, selects, or contentEditable regions.
      if (event.defaultPrevented || isEditableTarget(event.target as Element | null)) {
        return;
      }

      // Let real shortcuts (copy/paste, devtools, etc.) through untouched.
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (event.key === "?") {
        setLegendVisible((visible) => !visible);
        return;
      }

      const all = cards();

      if (all.length === 0) {
        return;
      }

      const nextState = reduceReviewKey(stateRef.current, event.key, all.length);

      if (nextState !== stateRef.current) {
        stateRef.current = nextState;
        event.preventDefault();
        paintFocus();
        focusCard(nextState.focusedIndex);
        return;
      }

      const option = scoreKeyToOption(event.key);

      if (option) {
        event.preventDefault();
        applyScore(stateRef.current.focusedIndex, option);
      }
    }

    paintFocus();
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      cards().forEach((card) => card.removeAttribute("data-kbd-focused"));
    };
  }, []);

  if (!legendVisible) {
    return null;
  }

  return (
    <p className={styles.keyboardLegend} role="status">
      <kbd>J</kbd>/<kbd>K</kbd> — переход между критериями · <kbd>1</kbd> зачёт ·{" "}
      <kbd>2</kbd> частично · <kbd>3</kbd> незачёт · <kbd>?</kbd> — скрыть подсказку
    </p>
  );
}
