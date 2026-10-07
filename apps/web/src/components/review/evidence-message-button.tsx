"use client";

import { useEffect, useState } from "react";
import {
  ALL_EVIDENCE_CRITERIA_FILLED_HINT,
  resolveEvidenceAttachTarget,
  useEvidenceDraftOptional
} from "@/components/review/evidence-draft";
import { applyEvidenceMessageSelection } from "@/components/review/evidence-picker-listener";
import { commandReviewDisclosure } from "@/components/review/review-disclosure";
import { Button } from "@/components/ui/button";
import { useToastOptional } from "@/components/ui/toast";

const EVIDENCE_ATTACHED_NEEDS_SCORE =
  "Реплика привязана к критерию. Поставьте оценку — без неё проверку не завершить.";

function landAttachedEvidence(criterionId: string) {
  const card = document.querySelector<HTMLElement>(
    `[data-criterion-card][data-criterion-id="${CSS.escape(criterionId)}"]`
  );
  if (!card) {
    return;
  }

  document.getElementById("review-workspace")?.setAttribute("data-active-pane", "score");
  if (card instanceof HTMLDetailsElement) {
    commandReviewDisclosure(card, true);
  }

  const notApplicable = card.querySelector<HTMLInputElement>('input[type="checkbox"][name$=".notApplicable"]');
  const scored = card.querySelector(
    'input[type="radio"][name$=".score"]:checked, input[type="radio"][name$=".passed"]:checked'
  );
  if (!scored && !notApplicable?.checked) {
    return "needs-score" as const;
  }

  return "ok" as const;
}

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
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (draft) {
          const target = resolveEvidenceAttachTarget(draft.byCriterion, draft.focusedCriterionId);
          if (!draft.attachMessage(messageId)) {
            if (shouldHintAllCriteriaFilled(draft)) {
              toast?.show({
                tone: "info",
                message: ALL_EVIDENCE_CRITERIA_FILLED_HINT
              });
            }
            return;
          }
          if (target && landAttachedEvidence(target) === "needs-score") {
            toast?.show({
              tone: "info",
              message: EVIDENCE_ATTACHED_NEEDS_SCORE
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
