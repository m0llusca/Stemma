"use client";

import type { CriterionKind } from "@prisma/client";
import { ArrowDown, ArrowUp, ChevronDown, GripVertical, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Chip } from "@/components/ui/chip";
import { createScorecardVersion, updateScorecardVersion } from "@/lib/scorecard-actions";

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

export function ScorecardVersionForm({ mode = "create", scorecardId, initialName, initialCriteria }: ScorecardVersionFormProps) {
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
  const totalWeight = useMemo(() => criteria.reduce((sum, criterion) => sum + Number(criterion.weight || 0), 0), [criteria]);
  const canSubmit =
    name.trim().length > 0 &&
    criteria.length > 0 &&
    totalWeight === 100 &&
    criteria.every(
      (criterion) =>
        criterion.key.trim().length > 0 &&
        criterion.block.trim().length > 0 &&
        criterion.label.trim().length > 0 &&
        Number(criterion.weight) >= 1 &&
        Number(criterion.weight) <= 100
    );

  function updateCriterion(index: number, patch: Partial<CriterionRow>) {
    setCriteria((current) =>
      current.map((criterion, currentIndex) => (currentIndex === index ? { ...criterion, ...patch } : criterion))
    );
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
  const weightShare = (weight: number) => (totalWeight > 0 ? Math.round((Number(weight || 0) / totalWeight) * 100) : 0);

  return (
    <form action={formAction} className="grid gap-4 p-5">
      {mode === "edit" && scorecardId ? <input type="hidden" name="scorecardId" value={scorecardId} /> : null}
      <input type="hidden" name="criterionCount" value={criteria.length} />
      <label className="grid max-w-xl gap-1 text-sm font-medium text-[var(--text-body)]">
        Название
        <input
          name="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          className="form-control"
        />
      </label>

      <div className="scorecard-builder">
        <p className="scorecard-builder__section-label">Критерии</p>
        <div className="scorecard-builder__list">
          {criteria.map((criterion, index) => (
            <details key={criterion.clientId} className="criterion-card" open={criterion.clientId.startsWith("new-")}>
              <summary className="criterion-card__summary">
                <span className="criterion-card__handle" aria-hidden="true">
                  <GripVertical size={16} />
                </span>
                <span className="criterion-card__heading">
                  <span className="criterion-card__title">{criterion.label || `Критерий ${index + 1}`}</span>
                  <span className="criterion-card__meta tabular-nums">
                    {criterion.block} · {kindOptions.find((option) => option.value === criterion.kind)?.label}
                  </span>
                </span>
                <Chip
                  tone="neutral"
                  size="sm"
                  numeric
                  label="Вес"
                  value={`${criterion.weight}%`}
                  className="criterion-card__weight"
                />
                <span className="criterion-card__controls">
                  <button
                    type="button"
                    title="Поднять"
                    disabled={index === 0}
                    onClick={() => setCriteria((current) => moveRow(current, index, index - 1))}
                    className="icon-action-button"
                  >
                    <ArrowUp size={15} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    title="Опустить"
                    disabled={index === criteria.length - 1}
                    onClick={() => setCriteria((current) => moveRow(current, index, index + 1))}
                    className="icon-action-button"
                  >
                    <ArrowDown size={15} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    title="Удалить"
                    onClick={() => setCriteria((current) => current.filter((_, currentIndex) => currentIndex !== index))}
                    className="icon-action-button icon-action-button--danger"
                  >
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                </span>
                <span className="criterion-card__chevron" aria-hidden="true">
                  <ChevronDown size={16} />
                </span>
              </summary>

              <div className="criterion-card__body">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(150px,0.8fr)_minmax(160px,0.9fr)_minmax(220px,1.2fr)]">
                  <label className="grid gap-1 text-sm font-medium text-[var(--text-body)]">
                    Ключ
                    <input
                      name={`criterion.${index}.key`}
                      value={criterion.key}
                      onChange={(event) => updateCriterion(index, { key: normalizeKeySeed(event.target.value) })}
                      required
                      pattern="[a-z0-9_]+"
                      className="form-control font-mono text-xs"
                    />
                    {mode === "edit" && !criterion.clientId.startsWith("new-") ? (
                      <input type="hidden" name={`criterion.${index}.id`} value={criterion.clientId} />
                    ) : null}
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-[var(--text-body)]">
                    Блок
                    <input
                      name={`criterion.${index}.block`}
                      value={criterion.block}
                      onChange={(event) => updateCriterion(index, { block: event.target.value })}
                      required
                      className="form-control"
                    />
                  </label>
                  <label className="grid gap-1 text-sm font-medium text-[var(--text-body)]">
                    Название
                    <input
                      name={`criterion.${index}.label`}
                      value={criterion.label}
                      onChange={(event) => updateCriterion(index, { label: event.target.value })}
                      required
                      className="form-control"
                    />
                  </label>
                </div>

                <div className="criterion-card__row">
                  <div className="grid gap-1 text-sm font-medium text-[var(--text-body)]">
                    <span>Тип оценки</span>
                    <div className="segmented" role="group" aria-label="Тип оценки">
                      {kindOptions.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          className={`segmented__option ${criterion.kind === option.value ? "segmented__option--active" : ""}`}
                          aria-pressed={criterion.kind === option.value}
                          onClick={() => updateCriterion(index, { kind: option.value })}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                    <select
                      name={`criterion.${index}.kind`}
                      value={criterion.kind}
                      onChange={(event) => updateCriterion(index, { kind: event.target.value as CriterionKind })}
                      className="sr-only"
                      tabIndex={-1}
                      aria-hidden="true"
                    >
                      {kindOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <label className="grid gap-1 text-sm font-medium text-[var(--text-body)]">
                    Вес, %
                    <input
                      name={`criterion.${index}.weight`}
                      value={criterion.weight}
                      onChange={(event) => updateCriterion(index, { weight: Number(event.target.value) })}
                      required
                      type="number"
                      min="1"
                      max="100"
                      className="form-control tabular-nums"
                    />
                    <span className="criterion-card__share tabular-nums">Доля в итоге: {weightShare(criterion.weight)}%</span>
                  </label>
                  <label className="flex min-h-[40px] items-center gap-2 self-end text-sm font-medium text-[var(--text-body)]">
                    <input
                      name={`criterion.${index}.required`}
                      type="checkbox"
                      checked={criterion.required}
                      onChange={(event) => updateCriterion(index, { required: event.target.checked })}
                    />
                    Обязателен
                  </label>
                </div>
              </div>
            </details>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <button
            type="button"
            onClick={addCriterion}
            className="action-button"
          >
            <Plus size={16} aria-hidden="true" />
            Добавить критерий
          </button>
          <span aria-live="polite" className="inline-flex">
            <Chip
              tone={totalWeight === 100 ? "success" : "warning"}
              size="sm"
              numeric
              label="Сумма весов"
              value={`${totalWeight}%`}
            />
          </span>
        </div>
        <button
          type="submit"
          disabled={!canSubmit}
          className="action-button action-button--primary"
        >
          {mode === "edit" ? "Сохранить текущую форму" : "Создать новую версию"}
        </button>
      </div>
    </form>
  );
}
