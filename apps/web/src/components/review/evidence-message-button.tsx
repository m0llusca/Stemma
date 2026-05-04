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
      className="action-button action-button--small"
    >
      В доказательство
    </button>
  );
}
