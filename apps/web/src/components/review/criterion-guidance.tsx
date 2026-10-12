"use client";

import { Info } from "lucide-react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";

export function CriterionGuidance({ label, kind, weight, required }: {
  label: string;
  kind: "SCALE_1_3" | "PASS_FAIL";
  weight: number;
  required: boolean;
}) {
  const scale = kind === "SCALE_1_3"
    ? "3 — стандарт, 2 — доработка, 1 — не соответствует."
    : "Зачёт — критерий выполнен, незачёт — не выполнен.";
  const guidance = `${scale} ${required ? "Обязательный критерий." : "Необязательный критерий."} Вес: ${weight}%.`;

  return (
    <div className="flex items-start gap-2 text-xs text-muted-foreground">
      <p className="min-w-0 flex-1">{guidance}</p>
      <HoverCard>
        <HoverCardTrigger
          render={<button type="button" />}
          aria-label={`Справка по критерию: ${label}`}
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-md hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
        >
          <Info className="size-4" aria-hidden="true" />
        </HoverCardTrigger>
        <HoverCardContent align="end" className="grid gap-2">
          <p className="font-semibold">{label}</p>
          <p>{guidance}</p>
          <p>Комментарий: факт, риск, ожидаемая формулировка. Сообщение-доказательство выбирается в карточке критерия.</p>
        </HoverCardContent>
      </HoverCard>
    </div>
  );
}
