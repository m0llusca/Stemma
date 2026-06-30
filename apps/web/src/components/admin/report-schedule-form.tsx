"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { createReportSchedule, type ReportScheduleActionState } from "@/lib/report-schedule-actions";

const initialState: ReportScheduleActionState = {
  status: "idle"
};

type Option = { value: string; label: string };

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" className="action-button action-button--primary" disabled={pending}>
      {pending ? "Сохраняем..." : "Создать расписание"}
    </button>
  );
}

export function ReportScheduleForm({
  periodPresetOptions,
  cadenceOptions,
  formatOptions
}: {
  periodPresetOptions: Option[];
  cadenceOptions: Option[];
  formatOptions: Option[];
}) {
  const [state, formAction] = useActionState(createReportSchedule, initialState);

  return (
    <form action={formAction} className="report-schedule-form">
      <label className="report-schedule-form__field">
        <span className="report-schedule-form__label">Название</span>
        <input
          name="name"
          type="text"
          required
          maxLength={120}
          placeholder="Например: Еженедельный отчет по линии L1"
          className="form-control"
          autoComplete="off"
        />
      </label>

      <div className="report-schedule-form__grid">
        <label className="report-schedule-form__field">
          <span className="report-schedule-form__label">Период данных</span>
          <select name="periodPreset" defaultValue={periodPresetOptions[0]?.value} className="form-control">
            {periodPresetOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="report-schedule-form__field">
          <span className="report-schedule-form__label">Периодичность</span>
          <select name="cadence" defaultValue={cadenceOptions[0]?.value} className="form-control">
            {cadenceOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="report-schedule-form__field">
          <span className="report-schedule-form__label">Формат</span>
          <select name="exportFormat" defaultValue={formatOptions[0]?.value} className="form-control">
            {formatOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="report-schedule-form__field">
        <span className="report-schedule-form__label">Фильтры (JSON, необязательно)</span>
        <textarea
          name="filtersJson"
          rows={3}
          placeholder='{"supportLine":"L1"}'
          className="form-control report-schedule-form__textarea"
          autoComplete="off"
        />
        <span className="report-schedule-form__hint">
          Те же фильтры, что и при выгрузке отчета. Оставьте пустым, чтобы включить все обращения.
        </span>
      </label>

      <div className="report-schedule-form__actions">
        <SubmitButton />
        {state.status === "success" ? (
          <span className="report-schedule-form__status report-schedule-form__status--ok">{state.message}</span>
        ) : null}
        {state.status === "error" ? (
          <span className="report-schedule-form__status report-schedule-form__status--error">{state.message}</span>
        ) : null}
      </div>
    </form>
  );
}
