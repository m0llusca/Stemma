"use client";

import { useEffect, useRef, useState } from "react";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import {
  initialReviewKeyboardState,
  isEditableTarget,
  reduceReviewKey,
  resolveReviewHotkey,
  type ScoreOption
} from "@/lib/review/keyboard";

/**
 * Keyboard-first grading layer for the workbench. Mounts once inside the review
 * form (like EvidencePickerListener) and drives the EXISTING criterion cards and
 * radio inputs from the DOM — it never owns form state or field names.
 *
 * Contract: docs/ux-queue-hotkeys-contract.md
 *
 *  - j / ArrowDown · k / ArrowUp  → move the focus ring between criterion cards
 *  - 1 / 2 / 3                    → set the focused criterion's score
 *  - Enter                        → expand the focused criterion
 *  - Esc                          → hide legend, else collapse focused criterion
 *  - Cmd/Ctrl+Enter               → finalize & take next
 *  - ?                            → reveal the shortcut legend
 *
 * Key events are ignored while a typing field is focused.
 */

const CARD_SELECTOR = "[data-criterion-card]";
const FINALIZE_NEXT_SELECTOR = 'button[type="submit"][name="intent"][value="finalize_next"]';

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

function isCriterionOpen(card: HTMLElement): boolean {
  if (card instanceof HTMLDetailsElement) {
    return card.open;
  }

  if (card.hasAttribute("data-closed")) {
    return false;
  }

  if (card.getAttribute("data-open") !== null) {
    return true;
  }

  return (
    card.querySelector<HTMLElement>("[data-slot='collapsible-trigger']")?.getAttribute("aria-expanded") !==
    "false"
  );
}

export function ReviewKeyboard() {
  const stateRef = useRef(initialReviewKeyboardState);
  const [legendVisible, setLegendVisible] = useState(false);
  const legendVisibleRef = useRef(legendVisible);
  legendVisibleRef.current = legendVisible;

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

    function ensureCriterionOpen(card: HTMLElement) {
      // Legacy details (if any remain in tests/fixtures).
      if (card instanceof HTMLDetailsElement) {
        if (!card.open) {
          card.open = true;
        }
        return;
      }

      if (isCriterionOpen(card)) {
        return;
      }

      const trigger = card.querySelector<HTMLElement>("[data-slot='collapsible-trigger']");
      trigger?.click();
    }

    function ensureCriterionClosed(card: HTMLElement) {
      if (card instanceof HTMLDetailsElement) {
        if (card.open) {
          card.open = false;
        }
        return;
      }

      if (!isCriterionOpen(card)) {
        return;
      }

      const trigger = card.querySelector<HTMLElement>("[data-slot='collapsible-trigger']");
      trigger?.click();
    }

    function focusCard(index: number) {
      const all = cards();
      const card = all[index];

      if (!card) {
        return;
      }

      ensureCriterionOpen(card);
      card.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    function applyScore(index: number, option: ScoreOption) {
      const card = cards()[index];

      if (!card) {
        return;
      }

      // Expand first so the operator sees the new score even though keepMounted
      // already keeps radios in FormData when collapsed.
      ensureCriterionOpen(card);

      const radio = radioMatcher(card, option);

      if (!radio || radio.checked) {
        return;
      }

      // Click the existing radio so form state + segment styling update as a
      // real pointer interaction would (Base UI RadioGroup hidden input).
      radio.click();
    }

    function submitFinalizeNext() {
      const form = root!.closest("form") ?? root!.querySelector("form");
      const button =
        (form instanceof HTMLFormElement
          ? form.querySelector<HTMLButtonElement>(FINALIZE_NEXT_SELECTOR)
          : null) ?? root!.querySelector<HTMLButtonElement>(FINALIZE_NEXT_SELECTOR);

      if (!button || button.disabled) {
        return;
      }

      button.click();
    }

    function onKeyDown(event: KeyboardEvent) {
      const all = cards();
      const action = resolveReviewHotkey({
        key: event.key,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        defaultPrevented: event.defaultPrevented,
        targetIsEditable: isEditableTarget(event.target),
        criterionCount: all.length
      });

      if (!action) {
        return;
      }

      switch (action.type) {
        case "toggle_legend":
          setLegendVisible((visible) => !visible);
          return;
        case "escape":
          event.preventDefault();
          if (legendVisibleRef.current) {
            setLegendVisible(false);
            return;
          }
          {
            const card = all[stateRef.current.focusedIndex];
            if (card) {
              ensureCriterionClosed(card);
            }
          }
          return;
        case "expand_focused": {
          event.preventDefault();
          const card = all[stateRef.current.focusedIndex];
          if (card) {
            ensureCriterionOpen(card);
            card.scrollIntoView({ behavior: "smooth", block: "nearest" });
          }
          return;
        }
        case "submit_finalize_next":
          event.preventDefault();
          submitFinalizeNext();
          return;
        case "navigate": {
          const nextState = reduceReviewKey(stateRef.current, action.key, all.length);
          if (nextState !== stateRef.current) {
            stateRef.current = nextState;
            event.preventDefault();
            paintFocus();
            focusCard(nextState.focusedIndex);
          }
          return;
        }
        case "score":
          event.preventDefault();
          applyScore(stateRef.current.focusedIndex, action.option);
          return;
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
    <p
      className="flex flex-wrap items-center gap-1.5 border-t border-border bg-muted/30 px-4 py-2 text-xs text-muted-foreground"
      role="status"
    >
      <KbdGroup>
        <Kbd>J</Kbd>
        <Kbd>K</Kbd>
      </KbdGroup>
      <span>— переход между критериями ·</span>
      <Kbd>1</Kbd>
      <span>зачёт ·</span>
      <Kbd>2</Kbd>
      <span>частично ·</span>
      <Kbd>3</Kbd>
      <span>незачёт ·</span>
      <Kbd>Enter</Kbd>
      <span>— раскрыть ·</span>
      <Kbd>Esc</Kbd>
      <span>— свернуть ·</span>
      <KbdGroup>
        <Kbd>⌘</Kbd>
        <Kbd>Enter</Kbd>
      </KbdGroup>
      <span>— завершить и взять следующий ·</span>
      <Kbd>?</Kbd>
      <span>— скрыть подсказку</span>
    </p>
  );
}
