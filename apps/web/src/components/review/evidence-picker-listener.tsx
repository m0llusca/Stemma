"use client";

import { useEffect, useRef } from "react";

type EvidenceSelectedEvent = CustomEvent<{ messageId?: string }>;
const evidenceSelectSelector = 'select[name^="criterion."][name$=".evidenceMessageId"]';

export function applyEvidenceMessageSelection(messageId: string, target?: HTMLSelectElement | null) {
  const select = target ?? document.querySelector<HTMLSelectElement>(evidenceSelectSelector);

  if (!select) {
    return false;
  }

  select.value = messageId;
  select.dispatchEvent(new Event("input", { bubbles: true }));
  select.dispatchEvent(new Event("change", { bubbles: true }));
  select.focus();

  return true;
}

export function EvidencePickerListener() {
  const activeSelectRef = useRef<HTMLSelectElement | null>(null);

  useEffect(() => {
    function rememberSelect(event: FocusEvent) {
      const target = event.target;

      if (target instanceof HTMLSelectElement && target.name.startsWith("criterion.") && target.name.endsWith(".evidenceMessageId")) {
        activeSelectRef.current = target;
      }
    }

    function selectEvidence(event: Event) {
      const messageId = (event as EvidenceSelectedEvent).detail?.messageId;

      if (!messageId) {
        return;
      }

      applyEvidenceMessageSelection(messageId, activeSelectRef.current);
    }

    document.addEventListener("focusin", rememberSelect);
    window.addEventListener("review:evidence-message-selected", selectEvidence);

    return () => {
      document.removeEventListener("focusin", rememberSelect);
      window.removeEventListener("review:evidence-message-selected", selectEvidence);
    };
  }, []);

  return null;
}
