"use client";

import type { FocusEvent, FormEvent } from "react";
import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { RequiredMark } from "@/components/ui/required-mark";
import { Textarea } from "@/components/ui/textarea";
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
    <Button type="submit" disabled={pending}>
      {pending ? "Сохраняем..." : "Создать расписание"}
    </Button>
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
    <form action={formAction} onSubmit={handleSubmit} className="flex flex-col gap-4">
      <FieldGroup className="gap-4">
        <Field>
          <FieldLabel htmlFor="report-schedule-name">
            Название
            <RequiredMark />
          </FieldLabel>
          <Input
            id="report-schedule-name"
            name="name"
            type="text"
            required
            maxLength={120}
            placeholder="Например: Еженедельный отчет по линии L1"
            autoComplete="off"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field>
            <FieldLabel htmlFor="report-schedule-period">Период данных</FieldLabel>
            <NativeSelect
              id="report-schedule-period"
              name="periodPreset"
              defaultValue={periodPresetOptions[0]?.value}
              className="w-full"
            >
              {periodPresetOptions.map((option) => (
                <NativeSelectOption key={option.value} value={option.value}>
                  {option.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>

          <Field>
            <FieldLabel htmlFor="report-schedule-cadence">Периодичность</FieldLabel>
            <NativeSelect
              id="report-schedule-cadence"
              name="cadence"
              defaultValue={cadenceOptions[0]?.value}
              className="w-full"
            >
              {cadenceOptions.map((option) => (
                <NativeSelectOption key={option.value} value={option.value}>
                  {option.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>

          <Field>
            <FieldLabel htmlFor="report-schedule-format">Формат</FieldLabel>
            <NativeSelect
              id="report-schedule-format"
              name="exportFormat"
              defaultValue={formatOptions[0]?.value}
              className="w-full"
            >
              {formatOptions.map((option) => (
                <NativeSelectOption key={option.value} value={option.value}>
                  {option.label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
        </div>

        <Field data-invalid={filtersError ? true : undefined}>
          <FieldLabel htmlFor="report-schedule-filters">Фильтры (JSON)</FieldLabel>
          <Textarea
            ref={filtersRef}
            id="report-schedule-filters"
            name="filtersJson"
            rows={3}
            placeholder='{"supportLine":"L1"}'
            autoComplete="off"
            onBlur={handleFiltersBlur}
            aria-invalid={filtersError ? true : undefined}
          />
          <FieldDescription>
            Те же фильтры, что и при выгрузке отчета. Оставьте пустым, чтобы включить все обращения.
            Поддерживаемые ключи: {reportScheduleFilterKeys.join(", ")}.
          </FieldDescription>
          {filtersError ? <FieldError>{filtersError}</FieldError> : null}
          {filtersWarning ? (
            <FieldDescription className="text-amber-800 dark:text-amber-300">{filtersWarning}</FieldDescription>
          ) : null}
        </Field>
      </FieldGroup>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton />
        {state.status === "success" ? (
          <span className="text-sm text-emerald-800 dark:text-emerald-300" role="status">
            {state.message}
          </span>
        ) : null}
        {state.status === "error" ? <FieldError>{state.message}</FieldError> : null}
      </div>
    </form>
  );
}
