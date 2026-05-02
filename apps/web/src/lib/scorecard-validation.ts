import type { CriterionKind } from "@prisma/client";

const criterionKinds = ["SCALE_1_3", "PASS_FAIL"] as const satisfies readonly CriterionKind[];

export type ScorecardCriterionDraft = {
  key: string;
  label: string;
  block: string;
  kind: CriterionKind;
  weight: number;
  required: boolean;
  order: number;
};

export type ScorecardDraft = {
  name: string;
  criteria: ScorecardCriterionDraft[];
};

function cleanKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}

export function validateScorecardDraft(input: ScorecardDraft): ScorecardDraft {
  const name = input.name.trim();

  if (!name) {
    throw new Error("Название формы оценки обязательно.");
  }

  if (input.criteria.length === 0) {
    throw new Error("Добавьте хотя бы один критерий.");
  }

  const keys = new Set<string>();
  const criteria = input.criteria.map((criterion, index) => {
    const key = cleanKey(criterion.key);
    const label = criterion.label.trim();
    const block = criterion.block.trim();
    const weight = Number(criterion.weight);

    if (!/^[a-z0-9_]+$/.test(key)) {
      throw new Error(`Ключ критерия ${index + 1} должен содержать только латиницу, цифры и underscore.`);
    }

    if (keys.has(key)) {
      throw new Error(`Ключ критерия "${key}" повторяется.`);
    }

    if (!label) {
      throw new Error(`Название критерия ${index + 1} обязательно.`);
    }

    if (!block) {
      throw new Error(`Блок критерия ${index + 1} обязателен.`);
    }

    if (!criterionKinds.includes(criterion.kind)) {
      throw new Error(`Некорректный тип критерия ${index + 1}.`);
    }

    if (!Number.isInteger(weight) || weight < 1 || weight > 100) {
      throw new Error(`Вес критерия ${index + 1} должен быть целым числом от 1 до 100.`);
    }

    keys.add(key);

    return {
      key,
      label,
      block,
      kind: criterion.kind,
      weight,
      required: Boolean(criterion.required),
      order: index + 1
    };
  });

  const totalWeight = criteria.reduce((sum, criterion) => sum + criterion.weight, 0);

  if (totalWeight !== 100) {
    throw new Error("Сумма весов критериев должна быть 100%.");
  }

  return {
    name,
    criteria
  };
}
