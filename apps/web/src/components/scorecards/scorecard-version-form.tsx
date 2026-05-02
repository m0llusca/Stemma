"use client";

import type { CriterionKind } from "@prisma/client";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { createScorecardVersion } from "@/lib/scorecard-actions";

type CriterionRow = {
  clientId: string;
  key: string;
  label: string;
  kind: CriterionKind;
  weight: number;
  required: boolean;
};

type ScorecardVersionFormProps = {
  initialName: string;
  initialCriteria: Array<{
    id: string;
    key: string;
    label: string;
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

export function ScorecardVersionForm({ initialName, initialCriteria }: ScorecardVersionFormProps) {
  const [name, setName] = useState(initialName);
  const [criteria, setCriteria] = useState<CriterionRow[]>(
    initialCriteria.map((criterion) => ({
      clientId: criterion.id,
      key: criterion.key,
      label: criterion.label,
      kind: criterion.kind,
      weight: criterion.weight,
      required: criterion.required
    }))
  );
  const totalWeight = useMemo(() => criteria.reduce((sum, criterion) => sum + Number(criterion.weight || 0), 0), [criteria]);
  const canSubmit = criteria.length > 0 && totalWeight === 100;

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
        kind: "SCALE_1_3",
        weight: remainingWeight,
        required: true
      }
    ]);
  }

  return (
    <form action={createScorecardVersion} className="grid gap-4 p-5">
      <input type="hidden" name="criterionCount" value={criteria.length} />
      <label className="grid max-w-xl gap-1 text-sm font-medium text-[#344054]">
        Название
        <input
          name="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          className="rounded border border-[#d7dce5] bg-white px-3 py-2"
        />
      </label>

      <div className="scroll-area">
        <table className="table-fixed-copy w-full min-w-[1060px] border-collapse text-left text-sm">
          <thead className="bg-[#eef4f4] text-xs uppercase text-[#475467]">
            <tr>
              <th className="w-24 px-4 py-3 font-semibold">Порядок</th>
              <th className="px-4 py-3 font-semibold">Ключ</th>
              <th className="px-4 py-3 font-semibold">Название</th>
              <th className="px-4 py-3 font-semibold">Тип</th>
              <th className="w-28 px-4 py-3 font-semibold">Вес</th>
              <th className="w-32 px-4 py-3 font-semibold">Обязателен</th>
              <th className="w-28 px-4 py-3 font-semibold">Действия</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#d7dce5]">
            {criteria.map((criterion, index) => (
              <tr key={criterion.clientId}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      title="Поднять"
                      disabled={index === 0}
                      onClick={() => setCriteria((current) => moveRow(current, index, index - 1))}
                      className="rounded border border-[#d7dce5] bg-white p-2 text-[#344054] hover:bg-[#eef4f4] disabled:cursor-not-allowed disabled:text-[#98a2b3]"
                    >
                      <ArrowUp size={15} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      title="Опустить"
                      disabled={index === criteria.length - 1}
                      onClick={() => setCriteria((current) => moveRow(current, index, index + 1))}
                      className="rounded border border-[#d7dce5] bg-white p-2 text-[#344054] hover:bg-[#eef4f4] disabled:cursor-not-allowed disabled:text-[#98a2b3]"
                    >
                      <ArrowDown size={15} aria-hidden="true" />
                    </button>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <input
                    name={`criterion.${index}.key`}
                    value={criterion.key}
                    onChange={(event) => updateCriterion(index, { key: normalizeKeySeed(event.target.value) })}
                    required
                    pattern="[a-z0-9_]+"
                    className="w-full rounded border border-[#d7dce5] px-3 py-2 font-mono text-xs"
                  />
                </td>
                <td className="px-4 py-3">
                  <input
                    name={`criterion.${index}.label`}
                    value={criterion.label}
                    onChange={(event) => updateCriterion(index, { label: event.target.value })}
                    required
                    className="w-full rounded border border-[#d7dce5] px-3 py-2"
                  />
                </td>
                <td className="px-4 py-3">
                  <select
                    name={`criterion.${index}.kind`}
                    value={criterion.kind}
                    onChange={(event) => updateCriterion(index, { kind: event.target.value as CriterionKind })}
                    className="w-full rounded border border-[#d7dce5] bg-white px-3 py-2"
                  >
                    <option value="SCALE_1_3">Шкала 1-3</option>
                    <option value="PASS_FAIL">Зачет/незачет</option>
                  </select>
                </td>
                <td className="px-4 py-3">
                  <input
                    name={`criterion.${index}.weight`}
                    value={criterion.weight}
                    onChange={(event) => updateCriterion(index, { weight: Number(event.target.value) })}
                    required
                    type="number"
                    min="1"
                    max="100"
                    className="w-24 rounded border border-[#d7dce5] px-3 py-2"
                  />
                </td>
                <td className="px-4 py-3">
                  <label className="flex items-center gap-2">
                    <input
                      name={`criterion.${index}.required`}
                      type="checkbox"
                      checked={criterion.required}
                      onChange={(event) => updateCriterion(index, { required: event.target.checked })}
                    />
                    Да
                  </label>
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    title="Удалить"
                    onClick={() => setCriteria((current) => current.filter((_, currentIndex) => currentIndex !== index))}
                    className="rounded border border-[#d7dce5] bg-white p-2 text-[#344054] hover:bg-[#fff4ed]"
                  >
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <button
            type="button"
            onClick={addCriterion}
            className="inline-flex items-center gap-2 rounded border border-[#116466] bg-white px-3 py-2 font-semibold text-[#116466] hover:bg-[#eef4f4]"
          >
            <Plus size={16} aria-hidden="true" />
            Добавить критерий
          </button>
          <span
            aria-live="polite"
            className={`rounded-md px-3 py-2 font-semibold ${
              totalWeight === 100 ? "bg-[#eef4f4] text-[#0b4f52]" : "bg-[#fff4ed] text-[#b54708]"
            }`}
          >
            Сумма весов: {totalWeight}%
          </span>
        </div>
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded bg-[#116466] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0b4f52] disabled:cursor-not-allowed disabled:bg-[#98a2b3]"
        >
          Создать новую версию
        </button>
      </div>
    </form>
  );
}
