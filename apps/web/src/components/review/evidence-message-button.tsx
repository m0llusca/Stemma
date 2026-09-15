"use client";

import { useEffect, useState } from "react";
import {
  ALL_EVIDENCE_CRITERIA_FILLED_HINT,
  useEvidenceDraftOptional
} from "@/components/review/evidence-draft";
import { applyEvidenceMessageSelection } from "@/components/review/evidence-picker-listener";
import { Button } from "@/components/ui/button";
import { useToastOptional } from "@/components/ui/toast";

function shouldHintAllCriteriaFilled(draft: {
  byCriterion: Record<string, string>;
  focusedCriterionId: string | null;
}) {
  const ids = Object.keys(draft.byCriterion);
  return (
    ids.length > 0 &&
    ids.every((id) => Boolean(draft.byCriterion[id])) &&
    !draft.focusedCriterionId
  );
}

export function EvidenceMessageButton({ messageId }: { messageId: string }) {
  const draft = useEvidenceDraftOptional();
  const toast = useToastOptional();
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
        if (draft) {
          if (!draft.attachMessage(messageId) && shouldHintAllCriteriaFilled(draft)) {
            toast?.show({
              tone: "info",
              message: ALL_EVIDENCE_CRITERIA_FILLED_HINT
            });
          }
          return;
        }

        if (!applyEvidenceMessageSelection(messageId)) {
          window.dispatchEvent(new CustomEvent("review:evidence-message-selected", { detail: { messageId } }));
        }
      }}
    >
      В доказательство
    </Button>
  );
}
