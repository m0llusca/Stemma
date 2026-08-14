"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type SummaryTemplate = {
  label: string;
  value: string;
};

export function SummaryTemplatePicker({
  templates,
  defaultValue
}: {
  templates: SummaryTemplate[];
  defaultValue: string;
}) {
  const textareaId = useId();
  const [summary, setSummary] = useState(defaultValue);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium text-foreground">Быстрые формулировки</span>
        <span className="text-xs text-muted-foreground">Выбор сразу подставит текст в итог ниже</span>
      </div>

      <div className="grid gap-2 sm:grid-cols-3" aria-label="Шаблоны итогового комментария">
        {templates.map((template) => {
          const pressed = summary === template.value;

          return (
            <Button
              key={template.label}
              type="button"
              variant={pressed ? "secondary" : "outline"}
              aria-pressed={pressed}
              className={cn(
                "h-auto flex-col items-start gap-1 whitespace-normal px-3 py-2.5 text-left"
              )}
              onClick={() => setSummary(template.value)}
            >
              <strong className="text-sm font-medium text-foreground">{template.label}</strong>
              <span className="text-xs font-normal text-muted-foreground">{template.value}</span>
            </Button>
          );
        })}
      </div>

      <Field>
        <FieldLabel htmlFor={textareaId}>Итог проверки</FieldLabel>
        <Textarea
          id={textareaId}
          name="summary"
          rows={3}
          required
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
          className="min-h-[88px] resize-y text-sm"
        />
        <FieldDescription>Краткий вывод для оператора и истории проверки</FieldDescription>
      </Field>
    </div>
  );
}
