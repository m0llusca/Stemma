export type SemanticTone = "positive" | "warning" | "negative" | "neutral" | "info";

export type SemanticMetricInput = {
  kind:
    | "overdue_count"
    | "failed_count"
    | "risk_count"
    | "completed_count"
    | "average_score"
    | "queue_count"
    | "learning_count";
  value: number | null;
};

export type SemanticStatus = {
  tone: SemanticTone;
  className: `semantic-status--${SemanticTone}`;
  label: string;
};

function status(tone: SemanticTone, label: string): SemanticStatus {
  return {
    tone,
    className: `semantic-status--${tone}`,
    label
  };
}

export function semanticStatusForMetric(input: SemanticMetricInput): SemanticStatus {
  if (input.value === null || !Number.isFinite(input.value)) {
    return status("neutral", "Нет данных");
  }

  if ((input.kind === "overdue_count" || input.kind === "failed_count" || input.kind === "risk_count") && input.value > 0) {
    return status("negative", "Требует внимания");
  }

  if (input.kind === "average_score") {
    if (input.value < 70) {
      return status("negative", "Требует внимания");
    }

    if (input.value < 90) {
      return status("warning", "Нужен контроль");
    }
  }

  if (input.kind === "queue_count" && input.value > 0) {
    return status("warning", "В работе");
  }

  if (input.kind === "learning_count" && input.value > 0) {
    return status("info", "Обучение");
  }

  return status("positive", "В норме");
}
