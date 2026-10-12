"use client";

import { ru } from "react-day-picker/locale";
import type { DateRange } from "react-day-picker";
import { Calendar } from "@/components/ui/calendar";

export default function ReportRangeCalendar({ selected, onSelect }: {
  selected: DateRange | undefined;
  onSelect: (range: DateRange | undefined) => void;
}) {
  return <Calendar mode="range" locale={ru} selected={selected} onSelect={(_range, day) => {
    if (!selected?.from || selected.to) onSelect({ from: day });
    else if (day < selected.from) onSelect({ from: day, to: selected.from });
    else onSelect({ from: selected.from, to: day });
  }} defaultMonth={selected?.from} aria-label="Календарь периода отчёта" />;
}
