"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { EvidenceJumpLink } from "@/components/review/evidence-jump-link";
import { paintLiveEvidenceHighlights } from "@/components/review/evidence-picker-listener";
import { FieldDescription } from "@/components/ui/field";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

export type EvidenceDraftMap = Record<string, string>;

export type EvidenceDraftValue = {
  byCriterion: EvidenceDraftMap;
  focusedCriterionId: string | null;
  setFocusedCriterionId: (criterionId: string | null) => void;
  setCriterionEvidence: (criterionId: string, messageId: string) => void;
  attachMessage: (messageId: string) => boolean;
  count: number;
  countFor: (criterionIds: readonly string[]) => number;
  attachedMessageIds: string[];
  isDirty: boolean;
};

const EvidenceDraftContext = createContext<EvidenceDraftValue | null>(null);

export function useEvidenceDraft() {
  const value = useContext(EvidenceDraftContext);

  if (!value) {
    throw new Error("useEvidenceDraft must be used within EvidenceDraftProvider");
  }

  return value;
}

export function useEvidenceDraftOptional() {
  return useContext(EvidenceDraftContext);
}

function normalizeDraft(criterionIds: readonly string[], initialByCriterion: EvidenceDraftMap): EvidenceDraftMap {
  const next: EvidenceDraftMap = {};

  for (const criterionId of criterionIds) {
    next[criterionId] = initialByCriterion[criterionId] ?? "";
  }

  return next;
}

export function EvidenceDraftProvider({
  criterionIds,
  initialByCriterion,
  allowedMessageIds,
  children
}: {
  criterionIds: readonly string[];
  initialByCriterion: EvidenceDraftMap;
  allowedMessageIds: readonly string[];
  children: ReactNode;
}) {
  const criterionKey = criterionIds.join("\0");
  const initialKey = criterionIds.map((id) => `${id}=${initialByCriterion[id] ?? ""}`).join("\0");
  const initial = useMemo(() => {
    const ids = criterionKey ? criterionKey.split("\0") : [];
    const values = Object.fromEntries(
      initialKey
        .split("\0")
        .filter(Boolean)
        .map((pair) => {
          const separator = pair.indexOf("=");
          return [pair.slice(0, separator), pair.slice(separator + 1)] as const;
        })
    );
    return normalizeDraft(ids, values);
  }, [criterionKey, initialKey]);
  const allowed = useMemo(() => new Set(allowedMessageIds), [allowedMessageIds]);
  const [byCriterion, setByCriterion] = useState(initial);
  const [focusedCriterionId, setFocusedCriterionId] = useState<string | null>(null);
  const byCriterionRef = useRef(byCriterion);
  const focusedRef = useRef(focusedCriterionId);

  byCriterionRef.current = byCriterion;
  focusedRef.current = focusedCriterionId;

  useEffect(() => {
    setByCriterion(initial);
  }, [initial]);

  const setCriterionEvidence = useCallback((criterionId: string, messageId: string) => {
    setByCriterion((current) => ({ ...current, [criterionId]: messageId }));
  }, []);

  const attachMessage = useCallback(
    (messageId: string) => {
      if (allowed.size > 0 && !allowed.has(messageId)) {
        return false;
      }

      const current = byCriterionRef.current;
      const ids = Object.keys(current);
      const focused = focusedRef.current;
      const target =
        (focused && Object.hasOwn(current, focused) ? focused : undefined) ??
        ids.find((id) => !current[id]) ??
        ids[0];

      if (!target) {
        return false;
      }

      setByCriterion({ ...current, [target]: messageId });
      return true;
    },
    [allowed]
  );

  const attachedMessageIds = useMemo(
    () => Array.from(new Set(Object.values(byCriterion).filter(Boolean))),
    [byCriterion]
  );
  const count = Object.values(byCriterion).filter(Boolean).length;
  const isDirty = useMemo(
    () => Object.keys(initial).some((id) => (byCriterion[id] ?? "") !== (initial[id] ?? "")),
    [byCriterion, initial]
  );

  const countFor = useCallback(
    (ids: readonly string[]) => ids.filter((id) => Boolean(byCriterion[id])).length,
    [byCriterion]
  );

  useEffect(() => {
    paintLiveEvidenceHighlights(attachedMessageIds);
  }, [attachedMessageIds]);

  const value = useMemo<EvidenceDraftValue>(
    () => ({
      byCriterion,
      focusedCriterionId,
      setFocusedCriterionId,
      setCriterionEvidence,
      attachMessage,
      count,
      countFor,
      attachedMessageIds,
      isDirty
    }),
    [
      attachMessage,
      attachedMessageIds,
      byCriterion,
      count,
      countFor,
      focusedCriterionId,
      isDirty,
      setCriterionEvidence
    ]
  );

  return <EvidenceDraftContext.Provider value={value}>{children}</EvidenceDraftContext.Provider>;
}

export function EnsureEvidenceDraft({
  criterionIds,
  initialByCriterion,
  allowedMessageIds,
  children
}: {
  criterionIds: readonly string[];
  initialByCriterion: EvidenceDraftMap;
  allowedMessageIds: readonly string[];
  children: ReactNode;
}) {
  const existing = useEvidenceDraftOptional();

  if (existing) {
    return children;
  }

  return (
    <EvidenceDraftProvider
      criterionIds={criterionIds}
      initialByCriterion={initialByCriterion}
      allowedMessageIds={allowedMessageIds}
    >
      {children}
    </EvidenceDraftProvider>
  );
}

type EvidenceMessageOption = {
  id: string;
  authorName: string;
  body: string;
  sentAt: Date;
};

export function EvidenceMessageSelect({
  criterionId,
  messages
}: {
  criterionId: string;
  messages: readonly EvidenceMessageOption[];
}) {
  const { byCriterion, setCriterionEvidence, setFocusedCriterionId } = useEvidenceDraft();

  return (
    <NativeSelect
      id={`review-criterion-${criterionId}-evidence-message`}
      name={`criterion.${criterionId}.evidenceMessageId`}
      value={byCriterion[criterionId] ?? ""}
      onChange={(event) => setCriterionEvidence(criterionId, event.target.value)}
      onFocus={() => setFocusedCriterionId(criterionId)}
      className="w-full"
    >
      <NativeSelectOption value="">Без привязки к сообщению</NativeSelectOption>
      {messages.map((message) => (
        <NativeSelectOption key={message.id} value={message.id}>
          {message.authorName}: {message.body.slice(0, 70)}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}

function formatEvidenceTime(value: Date) {
  return value.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

export function EvidenceFieldHint({
  criterionId,
  messages
}: {
  criterionId: string;
  messages: readonly EvidenceMessageOption[];
}) {
  const { byCriterion } = useEvidenceDraft();
  const evidenceMessage = messages.find((message) => message.id === byCriterion[criterionId]);

  return (
    <FieldDescription>
      Реплика, на которую опирается оценка
      {evidenceMessage ? (
        <>
          {" · "}
          <EvidenceJumpLink
            messageId={evidenceMessage.id}
            timeLabel={formatEvidenceTime(evidenceMessage.sentAt)}
            className="font-semibold tabular-nums text-primary"
          />
        </>
      ) : null}
    </FieldDescription>
  );
}
