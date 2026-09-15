"use client";

import { useEffect, useRef } from "react";

type EvidenceSelectedEvent = CustomEvent<{ messageId?: string }>;

export const EVIDENCE_SELECT_SELECTOR = 'select[name^="criterion."][name$=".evidenceMessageId"]';
export const EVIDENCE_APPLIED_EVENT = "review:evidence-applied";

export function isEvidenceSelect(node: EventTarget | Node | null): node is HTMLSelectElement {
  return node instanceof HTMLSelectElement && node.matches(EVIDENCE_SELECT_SELECTOR);
}

/**
 * After an evidence select blurs, run `onLeft` unless another evidence select is active.
 * Deferred so a «В доказательство» click that caused the blur can still attach.
 */
export function scheduleIfEvidenceSelectLeft(onLeft: () => void) {
  window.setTimeout(() => {
    if (isEvidenceSelect(document.activeElement)) {
      return;
    }
    onLeft();
  }, 0);
}

export function listEvidenceSelects() {
  return Array.from(document.querySelectorAll<HTMLSelectElement>(EVIDENCE_SELECT_SELECTOR));
}

export function countAttachedEvidence(criterionIds?: readonly string[]) {
  return listEvidenceSelects().filter((select) => {
    if (!select.value) {
      return false;
    }

    if (!criterionIds) {
      return true;
    }

    const match = /^criterion\.(.+)\.evidenceMessageId$/.exec(select.name);
    return match ? criterionIds.includes(match[1]) : false;
  }).length;
}

export function paintLiveEvidenceHighlights(messageIds?: readonly string[]) {
  document.querySelectorAll<HTMLElement>("[data-slot=conversation-message][data-live-evidence]").forEach((node) => {
    node.removeAttribute("data-live-evidence");
  });

  const ids = messageIds ?? listEvidenceSelects().map((select) => select.value).filter(Boolean);
  for (const messageId of ids) {
    document.getElementById(`msg-${messageId}`)?.setAttribute("data-live-evidence", "");
  }
}

function resolveEvidenceSelect(preferred?: HTMLSelectElement | null) {
  const selects = listEvidenceSelects();

  if (preferred && selects.includes(preferred) && document.contains(preferred)) {
    return preferred;
  }

  return selects.find((select) => !select.value) ?? null;
}

export function applyEvidenceMessageSelection(messageId: string, target?: HTMLSelectElement | null) {
  const select = resolveEvidenceSelect(target);

  if (!select) {
    return false;
  }

  const hasOption = Array.from(select.options).some((option) => option.value === messageId);
  if (!hasOption) {
    return false;
  }

  select.value = messageId;
  select.dispatchEvent(new Event("input", { bubbles: true }));
  select.dispatchEvent(new Event("change", { bubbles: true }));
  select.focus();
  paintLiveEvidenceHighlights();
  window.dispatchEvent(
    new CustomEvent(EVIDENCE_APPLIED_EVENT, {
      detail: { messageId, name: select.name }
    })
  );

  return true;
}

export function EvidencePickerListener() {
  const activeSelectRef = useRef<HTMLSelectElement | null>(null);

  useEffect(() => {
    function rememberSelect(event: FocusEvent) {
      if (isEvidenceSelect(event.target)) {
        activeSelectRef.current = event.target;
      }
    }

    function forgetSelect(event: FocusEvent) {
      if (!isEvidenceSelect(event.target)) {
        return;
      }

      const leaving = event.target;
      scheduleIfEvidenceSelectLeft(() => {
        if (activeSelectRef.current === leaving) {
          activeSelectRef.current = null;
        }
      });
    }

    function selectEvidence(event: Event) {
      const messageId = (event as EvidenceSelectedEvent).detail?.messageId;

      if (!messageId) {
        return;
      }

      applyEvidenceMessageSelection(messageId, activeSelectRef.current);
    }

    document.addEventListener("focusin", rememberSelect);
    document.addEventListener("focusout", forgetSelect);
    window.addEventListener("review:evidence-message-selected", selectEvidence);

    return () => {
      document.removeEventListener("focusin", rememberSelect);
      document.removeEventListener("focusout", forgetSelect);
      window.removeEventListener("review:evidence-message-selected", selectEvidence);
    };
  }, []);

  return null;
}
