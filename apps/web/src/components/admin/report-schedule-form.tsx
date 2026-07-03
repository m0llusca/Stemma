"use client";

import type { FocusEvent, FormEvent } from "react";
import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { RequiredMark } from "@/components/ui/required-mark";
import { createReportSchedule, type ReportScheduleActionState } from "@/lib/report-schedule-actions";
import { reportScheduleFilterKeys, validateReportScheduleFiltersJson } from "@/lib/report-schedule-filters";

const initialState: ReportScheduleActionState = {
  status: "idle"
};

type Option = { value: string; label: string };

const filtersInvalidMessage = 'Некорректный JSON. Введите объект вида {"supportLine":"L1"} или очистите поле.';

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
  const [filtersError, setFiltersError] = useState<string | null>(null);
  const [filtersWarning, setFiltersWarning] = useState<string | null>(null);
  const filtersRef = useRef<HTMLTextAreaElement>(null);

  const applyFiltersValidation = (element: HTMLTextAreaElement) => {
    const result = validateReportScheduleFiltersJson(element.value);

    if (result.status === "invalid") {
      element.setCustomValidity(filtersInvalidMessage);
      setFiltersError(filtersInvalidMessage);
      setFiltersWarning(null);
      return false;
    }

    element.setCustomValidity("");
    setFiltersError(null);
    setFiltersWarning(
      result.unknownKeys.length > 0
        ? `Неизвестные ключи: ${result.unknownKeys.join(", ")}. Расписание сохранится, но выгрузка эти ключи не учитывает.`
        : null
    );
    return true;
  };

  const handleFiltersBlur = (event: FocusEvent<HTMLTextAreaElement>) => {
    applyFiltersValidation(event.currentTarget);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    const filters = filtersRef.current;

    if (filters && !applyFiltersValidation(filters)) {
      event.preventDefault();
      filters.focus();
    }
  };

  return (
    <form action={formAction} onSubmit={handleSubmit} className="report-schedule-form">
      <label className="report-schedule-form__field">
        <span className="report-schedule-form__label">
          Название
          <RequiredMark />
        </span>
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
        <span className="report-schedule-form__label">Фильтры (JSON)</span>
        <textarea
          ref={filtersRef}
          name="filtersJson"
          rows={3}
          placeholder='{"supportLine":"L1"}'
          className="form-control report-schedule-form__textarea"
          autoComplete="off"
          onBlur={handleFiltersBlur}
          aria-invalid={filtersError ? true : undefined}
        />
        <span className="report-schedule-form__hint">
          Те же фильтры, что и при выгрузке отчета. Оставьте пустым, чтобы включить все обращения. Поддерживаемые ключи:{" "}
          {reportScheduleFilterKeys.join(", ")}.
        </span>
        {filtersError ? (
          <span className="report-schedule-form__status report-schedule-form__status--error" role="alert">
            {filtersError}
          </span>
        ) : null}
        {filtersWarning ? <span className="report-schedule-form__status">{filtersWarning}</span> : null}
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
