"use client";

import type { CriterionKind } from "@prisma/client";
import { ArrowDown, ArrowUp, ChevronDown, GripVertical, Plus, Trash2 } from "lucide-react";
import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RequiredMark } from "@/components/ui/required-mark";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { createScorecardVersion, updateScorecardVersion } from "@/lib/scorecard-actions";
import { cn } from "@/lib/utils";

type CriterionRow = {
  clientId: string;
  key: string;
  label: string;
  block: string;
  kind: CriterionKind;
  weight: number;
  required: boolean;
};

type ScorecardVersionFormProps = {
  mode?: "create" | "edit";
  scorecardId?: string;
  initialName: string;
  initialCriteria: Array<{
    id: string;
    key: string;
    label: string;
    block: string;
    kind: CriterionKind;
    weight: number;
    required: boolean;
  }>;
};

const kindOptions: Array<{ value: CriterionKind; label: string }> = [
  { value: "SCALE_1_3", label: "Шкала 1-3" },
  { value: "PASS_FAIL", label: "Зачет/незачет" }
];

function moveRow(rows: CriterionRow[], fromIndex: number, toIndex: number) {
  const nextRows = [...rows];
  const [row] = nextRows.splice(fromIndex, 1);
  nextRows.splice(toIndex, 0, row);
  return nextRows;
}

function normalizeKeySeed(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function ScorecardVersionForm({
  mode = "create",
  scorecardId,
  initialName,
  initialCriteria
}: ScorecardVersionFormProps) {
  const [name, setName] = useState(initialName);
  const [criteria, setCriteria] = useState<CriterionRow[]>(
    initialCriteria.map((criterion) => ({
      clientId: criterion.id,
      key: criterion.key,
      label: criterion.label,
      block: criterion.block,
      kind: criterion.kind,
      weight: criterion.weight,
      required: criterion.required
    }))
  );
  const totalWeight = useMemo(
    () => criteria.reduce((sum, criterion) => sum + Number(criterion.weight || 0), 0),
    [criteria]
  );
  const [submitError, setSubmitError] = useState<string | null>(null);

  function updateCriterion(index: number, patch: Partial<CriterionRow>) {
    setCriteria((current) =>
      current.map((criterion, currentIndex) =>
        currentIndex === index ? { ...criterion, ...patch } : criterion
      )
    );
  }

  function removeCriterion(index: number) {
    const criterion = criteria[index];
    const title = criterion?.label.trim() || `Критерий ${index + 1}`;
    const confirmed = window.confirm(
      `Удалить критерий «${title}»? Он исчезнет из этой версии формы, а веса остальных критериев придется пересмотреть до суммы 100%.`
    );

    if (!confirmed) {
      return;
    }

    setCriteria((current) => current.filter((_, currentIndex) => currentIndex !== index));
  }

  // Кнопка сабмита всегда активна (#17): полевые правила закрывает нативный
  // required, а межполевые инварианты (список не пуст, сумма весов 100%)
  // проверяем в момент отправки и показываем ошибку инлайн.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (criteria.length === 0) {
      event.preventDefault();
      setSubmitError("Добавьте хотя бы один критерий.");
      return;
    }

    if (totalWeight !== 100) {
      event.preventDefault();
      setSubmitError(`Сумма весов критериев должна быть 100% (сейчас ${totalWeight}%).`);
      return;
    }

    setSubmitError(null);
  }

  function addCriterion() {
    const nextNumber = criteria.length + 1;
    const remainingWeight = Math.max(1, 100 - totalWeight);

    setCriteria((current) => [
      ...current,
      {
        clientId: `new-${Date.now()}`,
        key: normalizeKeySeed(`criterion_${nextNumber}`),
        label: "Новый критерий",
        block: "Общее",
        kind: "SCALE_1_3",
        weight: remainingWeight,
        required: true
      }
    ]);
  }

  const formAction = mode === "edit" ? updateScorecardVersion : createScorecardVersion;
  const weightShare = (weight: number) =>
    totalWeight > 0 ? Math.round((Number(weight || 0) / totalWeight) * 100) : 0;

  return (
    <form action={formAction} onSubmit={handleSubmit} className="flex flex-col gap-4">
      {mode === "edit" && scorecardId ? (
        <input type="hidden" name="scorecardId" value={scorecardId} />
      ) : null}
      <input type="hidden" name="criterionCount" value={criteria.length} />

      <FieldGroup className="max-w-xl gap-4">
        <Field>
          <FieldLabel htmlFor="scorecard-name">
            Название
            <RequiredMark />
          </FieldLabel>
          <Input
            id="scorecard-name"
            name="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </Field>
      </FieldGroup>

      <div className="flex flex-col gap-3">
        <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          Критерии
        </p>
        <div className="flex flex-col gap-2">
          {criteria.map((criterion, index) => (
            <Collapsible
              key={criterion.clientId}
              defaultOpen={criterion.clientId.startsWith("new-")}
              className="group rounded-xl ring-1 ring-foreground/10 data-open:bg-muted/15"
            >
              <div className="flex items-center gap-2 p-3">
                <CollapsibleTrigger className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left outline-none">
                  <span className="text-muted-foreground" aria-hidden="true">
                    <GripVertical size={16} />
                  </span>
                  <span className="min-w-0 flex-1 flex flex-col gap-0.5">
                    <span className="truncate font-medium text-foreground">
                      {criterion.label || `Критерий ${index + 1}`}
                    </span>
                    <span className="text-sm text-muted-foreground tabular-nums">
                      {criterion.block} ·{" "}
                      {kindOptions.find((option) => option.value === criterion.kind)?.label}
                    </span>
                  </span>
                  <Badge variant="secondary" className="tabular-nums shrink-0">
                    Вес {criterion.weight}%
                  </Badge>
                </CollapsibleTrigger>
                <span className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    title="Поднять"
                    disabled={index === 0}
                    onClick={() => setCriteria((current) => moveRow(current, index, index - 1))}
                  >
                    <ArrowUp size={15} aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    title="Опустить"
                    disabled={index === criteria.length - 1}
                    onClick={() => setCriteria((current) => moveRow(current, index, index + 1))}
                  >
                    <ArrowDown size={15} aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    title="Удалить"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => removeCriterion(index)}
                  >
                    <Trash2 size={15} aria-hidden="true" />
                  </Button>
                </span>
                <CollapsibleTrigger
                  className="flex size-8 shrink-0 items-center justify-center text-muted-foreground outline-none"
                  aria-label={criterion.label || `Критерий ${index + 1}`}
                >
                  <ChevronDown
                    size={16}
                    aria-hidden="true"
                    className="transition-transform group-data-open:rotate-180"
                  />
                </CollapsibleTrigger>
              </div>

              <CollapsibleContent keepMounted>
                <Card className="rounded-none border-0 bg-transparent ring-0 shadow-none">
                  <CardContent className="flex flex-col gap-4 border-t border-border pt-4">
                    <FieldGroup className="gap-3 md:grid md:grid-cols-2 xl:grid-cols-[minmax(150px,0.8fr)_minmax(160px,0.9fr)_minmax(220px,1.2fr)]">
                      <Field>
                        <FieldLabel htmlFor={`criterion-${index}-key`}>
                          Ключ
                          <RequiredMark />
                        </FieldLabel>
                        <Input
                          id={`criterion-${index}-key`}
                          name={`criterion.${index}.key`}
                          value={criterion.key}
                          onChange={(event) =>
                            updateCriterion(index, { key: normalizeKeySeed(event.target.value) })
                          }
                          required
                          pattern="[a-z0-9_]+"
                          className="font-mono text-xs"
                        />
                        {mode === "edit" && !criterion.clientId.startsWith("new-") ? (
                          <input type="hidden" name={`criterion.${index}.id`} value={criterion.clientId} />
                        ) : null}
                      </Field>
                      <Field>
                        <FieldLabel htmlFor={`criterion-${index}-block`}>
                          Блок
                          <RequiredMark />
                        </FieldLabel>
                        <Input
                          id={`criterion-${index}-block`}
                          name={`criterion.${index}.block`}
                          value={criterion.block}
                          onChange={(event) => updateCriterion(index, { block: event.target.value })}
                          required
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor={`criterion-${index}-label`}>
                          Название
                          <RequiredMark />
                        </FieldLabel>
                        <Input
                          id={`criterion-${index}-label`}
                          name={`criterion.${index}.label`}
                          value={criterion.label}
                          onChange={(event) => updateCriterion(index, { label: event.target.value })}
                          required
                        />
                      </Field>
                    </FieldGroup>

                    <div className="grid gap-3 md:grid-cols-[minmax(0,1.2fr)_minmax(120px,0.5fr)_auto] md:items-end">
                      <Field>
                        <FieldLabel>Тип оценки</FieldLabel>
                        <ToggleGroup
                          value={[criterion.kind]}
                          onValueChange={(v) => {
                            const next = v[0];
                            if (next) updateCriterion(index, { kind: next as CriterionKind });
                          }}
                          spacing={0}
                          variant="outline"
                          size="sm"
                          aria-label="Тип оценки"
                        >
                          {kindOptions.map((option) => (
                            <ToggleGroupItem key={option.value} value={option.value}>
                              {option.label}
                            </ToggleGroupItem>
                          ))}
                        </ToggleGroup>
                        <input type="hidden" name={`criterion.${index}.kind`} value={criterion.kind} />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor={`criterion-${index}-weight`}>
                          Вес, %
                          <RequiredMark />
                        </FieldLabel>
                        <Input
                          id={`criterion-${index}-weight`}
                          name={`criterion.${index}.weight`}
                          value={criterion.weight}
                          onChange={(event) =>
                            updateCriterion(index, { weight: Number(event.target.value) })
                          }
                          required
                          type="number"
                          min={1}
                          max={100}
                          className="tabular-nums"
                        />
                        <FieldDescription className="tabular-nums">
                          Доля в итоге: {weightShare(criterion.weight)}%
                        </FieldDescription>
                      </Field>
                      <Field orientation="horizontal" className="min-h-8 items-center self-end pb-0.5">
                        <Checkbox
                          id={`criterion-${index}-required`}
                          name={`criterion.${index}.required`}
                          checked={criterion.required}
                          onCheckedChange={(checked) =>
                            updateCriterion(index, { required: checked === true })
                          }
                        />
                        <FieldLabel htmlFor={`criterion-${index}-required`} className="font-normal">
                          Обязателен
                        </FieldLabel>
                      </Field>
                    </div>
                  </CardContent>
                </Card>
              </CollapsibleContent>
            </Collapsible>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Button type="button" variant="outline" onClick={addCriterion}>
            <Plus size={16} aria-hidden="true" />
            Добавить критерий
          </Button>
          <span aria-live="polite" className="inline-flex">
            <Badge
              variant={totalWeight === 100 ? "default" : "outline"}
              className={cn(
                "tabular-nums",
                totalWeight !== 100 &&
                  "border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-300"
              )}
            >
              Сумма весов {totalWeight}%
            </Badge>
          </span>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Button type="submit">
            {mode === "edit" ? "Сохранить текущую форму" : "Создать новую версию"}
          </Button>
          {submitError ? <FieldError>{submitError}</FieldError> : null}
        </div>
      </div>
    </form>
  );
}
