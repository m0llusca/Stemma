"use client";

import { useEffect, useState } from "react";
import { applyEvidenceMessageSelection } from "@/components/review/evidence-picker-listener";
import { Button } from "@/components/ui/button";

export function EvidenceMessageButton({ messageId }: { messageId: string }) {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    setIsReady(true);
  }, []);

  return (
    <Button
      type="button"
      size="xs"
      variant="outline"
      disabled={!isReady}
      onClick={() => {
        if (!applyEvidenceMessageSelection(messageId)) {
          window.dispatchEvent(new CustomEvent("review:evidence-message-selected", { detail: { messageId } }));
        }
      }}
    >
      В доказательство
    </Button>
  );
}
