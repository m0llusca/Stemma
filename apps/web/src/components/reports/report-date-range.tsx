"use client";

import { lazy, Suspense, useState } from "react";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { MAX_CUSTOM_REPORT_PERIOD_DAYS } from "@/lib/report-period";

const ReportRangeCalendar = lazy(() => import("./report-range-calendar"));

function localDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : undefined;
}

function dateValue(date: Date | undefined) {
  if (!date) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function ReportDateRange({ start, end, idPrefix, onApply }: {
  start: string;
  end: string;
  idPrefix: string;
  onApply: (start: string, end: string) => void;
}) {
  const [draftStart, setDraftStart] = useState(start);
  const [draftEnd, setDraftEnd] = useState(end);
  const [showCalendar, setShowCalendar] = useState(false);
  const from = localDate(draftStart);
  const to = localDate(draftEnd);
  const inclusiveDays = from && to
    ? (Date.UTC(to.getFullYear(), to.getMonth(), to.getDate()) - Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())) / 86400000 + 1
    : 0;
  const valid = inclusiveDays > 0 && inclusiveDays <= MAX_CUSTOM_REPORT_PERIOD_DAYS;
  const selected: DateRange | undefined = from ? { from, to } : undefined;

  return (
    <div className="flex min-w-0 flex-col gap-3" role="group" aria-label="Произвольный период">
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-start`}>С даты</FieldLabel>
        <Input id={`${idPrefix}-start`} name="start" type="date" value={draftStart} onChange={(event) => setDraftStart(event.currentTarget.value)} />
      </Field>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-end`}>По дату</FieldLabel>
        <Input id={`${idPrefix}-end`} name="end" type="date" value={draftEnd} onChange={(event) => setDraftEnd(event.currentTarget.value)} />
      </Field>
      <Button type="button" variant="outline" size="sm" aria-expanded={showCalendar} onClick={() => setShowCalendar((shown) => !shown)}>Выбрать в календаре</Button>
      {showCalendar ? <Suspense fallback={<p role="status">Загрузка календаря…</p>}>
        <ReportRangeCalendar selected={selected} onSelect={(range) => { setDraftStart(dateValue(range?.from)); setDraftEnd(dateValue(range?.to)); }} />
      </Suspense> : null}
      <p className="text-xs text-muted-foreground" role="status">{!valid ? `Выберите обе даты по порядку, не более ${MAX_CUSTOM_REPORT_PERIOD_DAYS} дней.` : "Диапазон готов к применению."}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={!valid} onClick={() => onApply(draftStart, draftEnd)}>Применить период</Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => { setDraftStart(start); setDraftEnd(end); setShowCalendar(false); }}>Отменить</Button>
      </div>
    </div>
  );
}
