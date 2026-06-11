"use client";

import type { CriterionKind } from "@prisma/client";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
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

      <div className="record-list border-y border-[var(--border)]">
        {criteria.map((criterion, index) => (
          <article key={criterion.clientId} className="record-card">
            <div className="record-row">
              <div className="min-w-0">
                <p className="record-title">Критерий {index + 1}</p>
                <p className="record-meta mt-1 compact-text">{criterion.label}</p>
              </div>
              <div className="flex flex-wrap gap-1">
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
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(150px,0.8fr)_minmax(160px,0.9fr)_minmax(220px,1.2fr)_minmax(140px,0.8fr)_96px_auto] xl:items-end">
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
              <label className="grid gap-1 text-sm font-medium text-[var(--text-body)]">
                Тип
                <select
                  name={`criterion.${index}.kind`}
                  value={criterion.kind}
                  onChange={(event) => updateCriterion(index, { kind: event.target.value as CriterionKind })}
                  className="form-control"
                >
                  <option value="SCALE_1_3">Шкала 1-3</option>
                  <option value="PASS_FAIL">Зачет/незачет</option>
                </select>
              </label>
              <label className="grid gap-1 text-sm font-medium text-[var(--text-body)]">
                Вес
                <input
                  name={`criterion.${index}.weight`}
                  value={criterion.weight}
                  onChange={(event) => updateCriterion(index, { weight: Number(event.target.value) })}
                  required
                  type="number"
                  min="1"
                  max="100"
                  className="form-control"
                />
              </label>
              <label className="flex min-h-[40px] items-center gap-2 text-sm font-medium text-[var(--text-body)]">
                <input
                  name={`criterion.${index}.required`}
                  type="checkbox"
                  checked={criterion.required}
                  onChange={(event) => updateCriterion(index, { required: event.target.checked })}
                />
                Обязателен
              </label>
            </div>
          </article>
        ))}
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
          <span
            aria-live="polite"
            className={`pill ${totalWeight === 100 ? "pill--ok" : "pill--warn"}`}
          >
            Сумма весов: {totalWeight}%
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
