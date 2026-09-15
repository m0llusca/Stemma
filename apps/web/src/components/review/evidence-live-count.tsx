"use client";

import { useEffect, useState } from "react";
import { useEvidenceDraftOptional } from "@/components/review/evidence-draft";
import {
  countAttachedEvidence,
  EVIDENCE_APPLIED_EVENT,
  EVIDENCE_SELECT_SELECTOR,
  paintLiveEvidenceHighlights
} from "@/components/review/evidence-picker-listener";
import { Chip } from "@/components/ui/chip";

function subscribeEvidenceLive(update: () => void) {
  function onFormEvent(event: Event) {
    const target = event.target;
    if (
      target instanceof HTMLSelectElement &&
      target.matches(EVIDENCE_SELECT_SELECTOR)
    ) {
      update();
    }
  }

  document.addEventListener("input", onFormEvent);
  document.addEventListener("change", onFormEvent);
  window.addEventListener(EVIDENCE_APPLIED_EVENT, update);
  window.addEventListener("review:evidence-message-selected", update);

  return () => {
    document.removeEventListener("input", onFormEvent);
    document.removeEventListener("change", onFormEvent);
    window.removeEventListener(EVIDENCE_APPLIED_EVENT, update);
    window.removeEventListener("review:evidence-message-selected", update);
  };
}

function useDomEvidenceCount(
  initialCount: number,
  criterionIds: readonly string[] | undefined,
  enabled: boolean
) {
  const [count, setCount] = useState(initialCount);
  const criterionKey = criterionIds?.join("\0") ?? "";

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const ids = criterionKey ? criterionKey.split("\0") : undefined;
    const refresh = () => {
      setCount(countAttachedEvidence(ids));
      paintLiveEvidenceHighlights();
    };

    refresh();
    return subscribeEvidenceLive(refresh);
  }, [criterionKey, enabled, initialCount]);

  return count;
}

export function LiveEvidenceTotal({ initialCount }: { initialCount: number }) {
  const draft = useEvidenceDraftOptional();
  const fallbackCount = useDomEvidenceCount(initialCount, undefined, !draft);
  const count = draft?.count ?? fallbackCount;

  return (
    <>
      <strong
        data-slot="review-evidence-count"
        data-review-evidence-dirty={draft?.isDirty ? "true" : "false"}
        className="text-base text-foreground tabular-nums"
      >
        {count}
      </strong>
      <small className="text-xs text-muted-foreground">
        {count > 0 ? "Подсвечены в таймлайне диалога." : "Пока нет привязанных сообщений."}
      </small>
    </>
  );
}

export function LiveEvidenceGroupChip({
  criterionIds,
  initialCount
}: {
  criterionIds: readonly string[];
  initialCount: number;
}) {
  const draft = useEvidenceDraftOptional();
  const fallbackCount = useDomEvidenceCount(initialCount, criterionIds, !draft);
  const count = draft ? draft.countFor(criterionIds) : fallbackCount;

  if (count === 0) {
    return null;
  }

  return (
    <Chip tone="info">
      {count} доказ.
    </Chip>
  );
}

/** Keeps timeline rings in sync when the score pane is already mounted. */
export function LiveEvidenceHighlights() {
  const draft = useEvidenceDraftOptional();

  useEffect(() => {
    if (draft) {
      paintLiveEvidenceHighlights(draft.attachedMessageIds);
      return;
    }

    paintLiveEvidenceHighlights();
    return subscribeEvidenceLive(() => paintLiveEvidenceHighlights());
  }, [draft, draft?.attachedMessageIds]);

  return null;
}
