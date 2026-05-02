"use client";

import { useEffect, useRef } from "react";

type EvidenceSelectedEvent = CustomEvent<{ messageId?: string }>;

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

      const target =
        activeSelectRef.current ??
        document.querySelector<HTMLSelectElement>('select[name^="criterion."][name$=".evidenceMessageId"]');

      if (!target) {
        return;
      }

      target.value = messageId;
      target.dispatchEvent(new Event("input", { bubbles: true }));
      target.dispatchEvent(new Event("change", { bubbles: true }));
      target.focus();
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
