"use client";

import { useId, useState } from "react";
import styles from "./review-panel-workbench.module.css";

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
    <div className={styles.summaryComposer}>
      <div className={styles.summaryTemplateHeader}>
        <div>
          <span>Быстрые формулировки</span>
          <small>Выбор сразу подставит текст в итог ниже</small>
        </div>
      </div>

      <div className={styles.summaryTemplateGrid} aria-label="Шаблоны итогового комментария">
        {templates.map((template) => (
          <button
            key={template.label}
            aria-pressed={summary === template.value}
            className={styles.summaryTemplateButton}
            onClick={() => setSummary(template.value)}
            type="button"
          >
            <strong>{template.label}</strong>
            <span>{template.value}</span>
          </button>
        ))}
      </div>

      <label className={styles.summaryField} htmlFor={textareaId}>
        Итог проверки
        <textarea
          id={textareaId}
          name="summary"
          rows={3}
          required
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
          className={`form-control text-sm ${styles.summaryTextarea}`}
        />
      </label>
    </div>
  );
}
