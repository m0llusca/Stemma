"use client";

import { useEffect, useState } from "react";
import { applyEvidenceMessageSelection } from "@/components/review/evidence-picker-listener";

export function EvidenceMessageButton({ messageId }: { messageId: string }) {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    setIsReady(true);
  }, []);

  return (
    <button
      type="button"
      disabled={!isReady}
      onClick={() => {
        if (!applyEvidenceMessageSelection(messageId)) {
          window.dispatchEvent(new CustomEvent("review:evidence-message-selected", { detail: { messageId } }));
        }
      }}
      className="rounded-md border border-[#d9e0ea] bg-white px-2 py-1 text-xs font-semibold text-[#1d3fae] hover:bg-[#edf2ff] disabled:cursor-not-allowed disabled:opacity-60"
    >
      В доказательство
    </button>
  );
}
