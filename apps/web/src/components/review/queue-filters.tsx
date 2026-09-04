import Link from "next/link";
import { QUEUE_GLOSSARY } from "@/components/guidance/queue-glossary";
import { QueueAdvancedFilters } from "@/components/review/queue-advanced-filters";
import { AutoSubmitFilterForm } from "@/components/ui/auto-submit-filter-form";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Field, FieldLabel } from "@/components/ui/field";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Separator } from "@/components/ui/separator";
import {
  channelLabels,
  csatBucketLabels,
  appealStatusLabels,
  feedbackStatusLabels,
  qaStatusLabels,
  reanswerStatusLabels,
  reviewQueueStatusLabels,
  riskLevelLabels,
  samplingTypeLabels
} from "@/lib/labels";
import type { ReviewQueueFilters } from "@/lib/review-repository";
import { qaQueueStatuses, queueCsatBuckets, queueProcessFilters, queueSamplingTypes, reviewQueueStatuses } from "@/lib/review-repository";

type QueueFiltersProps = {
  filters: ReviewQueueFilters;
  sources: string[];
  assignees: string[];
  qaAssignees: string[];
  supportLines: string[];
  teamNames: string[];
  resultCount?: number;
};

const queueFiltersFormId = "review-queue-filters";

const exactQueueFilterParameters = [
  "channel",
  "qaStatus",
  "source",
  "assignee",
  "qaAssignee",
  "samplingType",
  "csatBucket",
  "supportLine",
  "teamName",
  "process",
  "due",
  "riskLevel"
] satisfies readonly (keyof ReviewQueueFilters)[];

export function QueueFilters({
  filters,
  sources,
  assignees,
  qaAssignees,
  supportLines,
  teamNames,
  resultCount
}: QueueFiltersProps) {
  const advancedFilterValues = [
    filters.channel,
    filters.qaStatus,
    filters.source,
    filters.assignee,
    filters.qaAssignee,
    filters.samplingType,
    filters.csatBucket,
    filters.supportLine,
    filters.teamName,
    filters.process,
    filters.due,
    filters.riskLevel,
    filters.coachingStatus,
    filters.findingCategory,
    filters.criticalCategory,
    filters.feedbackStatus,
    filters.appealStatus,
    filters.reanswerStatus,
    filters.finalizedFrom,
    filters.finalizedTo
  ];
  const activeAdvancedFilterCount = advancedFilterValues.filter(Boolean).length;
  const hasAdvancedFilters = activeAdvancedFilterCount > 0;
  const processLabels = {
    critical: "Критические ошибки",
    reanswer: "Переответы",
    appeal: "Апелляции"
  } as const;
  const riskLevels = ["HIGH_OR_CRITICAL", "CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
  const riskFilterLabels = {
    HIGH_OR_CRITICAL: "Высокий и критический",
    ...riskLevelLabels
  } as const;
  const activeFilters = [
    filters.q ? { label: "Поиск", value: filters.q } : null,
    filters.status !== "all" ? { label: "Итог", value: reviewQueueStatusLabels[filters.status] } : null,
    filters.qaStatus ? { label: "Статус проверки", value: qaStatusLabels[filters.qaStatus] } : null,
    filters.channel ? { label: "Канал", value: channelLabels[filters.channel] } : null,
    filters.source ? { label: "Источник", value: filters.source } : null,
    filters.assignee ? { label: "Оператор", value: filters.assignee } : null,
    filters.qaAssignee ? { label: "Проверяющий", value: filters.qaAssignee } : null,
    filters.samplingType ? { label: "Выборка", value: samplingTypeLabels[filters.samplingType] ?? filters.samplingType } : null,
    filters.csatBucket ? { label: "CSAT", value: csatBucketLabels[filters.csatBucket] ?? filters.csatBucket } : null,
    filters.supportLine ? { label: "Линия", value: filters.supportLine } : null,
    filters.teamName ? { label: "Команда", value: filters.teamName } : null,
    filters.process ? { label: "Процесс", value: processLabels[filters.process] } : null,
    filters.due ? { label: "Срок", value: "Просрочено" } : null,
    filters.riskLevel ? { label: "Риск", value: riskFilterLabels[filters.riskLevel] } : null,
    filters.coachingStatus ? { label: "Разбор", value: "Открыт" } : null,
    filters.findingCategory ? { label: "Категория", value: filters.findingCategory } : null,
    filters.criticalCategory ? { label: "Критическая ошибка", value: filters.criticalCategory } : null,
    filters.feedbackStatus ? { label: "Обратная связь", value: feedbackStatusLabels[filters.feedbackStatus] ?? filters.feedbackStatus } : null,
    filters.appealStatus ? { label: "Апелляция", value: appealStatusLabels[filters.appealStatus] ?? filters.appealStatus } : null,
    filters.reanswerStatus ? { label: "Переответ", value: reanswerStatusLabels[filters.reanswerStatus] ?? filters.reanswerStatus } : null,
    filters.finalizedFrom ? { label: "Период с", value: filters.finalizedFrom.toLocaleDateString("ru-RU") } : null,
    filters.finalizedTo ? { label: "Период по", value: filters.finalizedTo.toLocaleDateString("ru-RU") } : null
  ].filter((filter): filter is { label: string; value: string } => Boolean(filter));

  const liveAnnouncement =
    activeFilters.length === 0
      ? resultCount != null
        ? `Фильтры сброшены. Найдено обращений: ${resultCount}.`
        : "Фильтры сброшены."
      : resultCount != null
        ? `Применено фильтров: ${activeFilters.length}. Найдено обращений: ${resultCount}.`
        : `Применено фильтров: ${activeFilters.length}.`;

  return (
    <AutoSubmitFilterForm
      id={queueFiltersFormId}
      action="/reviews"
      className="queue-filterbar border-t border-border"
    >
      <div
        className="sr-only"
        aria-live="polite"
        aria-atomic="true"
        data-slot="queue-filters-live"
      >
        {liveAnnouncement}
      </div>

      <div className="queue-filterbar__primary grid grid-cols-1 items-end gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(11rem,14rem)] xl:grid-cols-[minmax(0,1fr)_minmax(11rem,14rem)_max-content_max-content]">
        <Field className="min-w-0">
          <FieldLabel htmlFor="queue-filter-q">Поиск</FieldLabel>
          <Input
            key={filters.q ?? ""}
            id="queue-filter-q"
            name="q"
            defaultValue={filters.q ?? ""}
            aria-label="Поиск в очереди проверок"
            placeholder="Клиент, тема, тег или внешний ID"
          />
        </Field>

        <Field className="min-w-0">
          <FieldLabel htmlFor="queue-filter-status">Итог</FieldLabel>
          <NativeSelect id="queue-filter-status" name="status" defaultValue={filters.status} className="w-full">
            {reviewQueueStatuses.map((status) => (
              <NativeSelectOption key={status} value={status}>
                {reviewQueueStatusLabels[status]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>

        <QueueAdvancedFilters
          activeCount={activeAdvancedFilterCount}
          parameterCount={exactQueueFilterParameters.length}
          defaultOpen={hasAdvancedFilters}
          formId={queueFiltersFormId}
          actions={
            <div className="queue-filterbar__actions flex min-w-0 flex-nowrap items-end justify-start gap-2 sm:col-span-2 sm:justify-end xl:col-span-1">
              <Button
                render={<Link href="/reviews" title="Вернуть очередь без фильтров" />}
                nativeButton={false}
                variant="outline"
              >
                Сбросить фильтры
              </Button>
            </div>
          }
        >
          <Field className="min-w-0">
            <FieldLabel htmlFor="queue-filter-qaStatus">Статус проверки</FieldLabel>
            <NativeSelect
              id="queue-filter-qaStatus"
              name="qaStatus"
              form={queueFiltersFormId}
              defaultValue={filters.qaStatus ?? "all"}
              className="w-full"
            >
              {qaQueueStatuses.map((status) => (
                <NativeSelectOption key={status} value={status}>
                  {status === "all" ? "Все" : qaStatusLabels[status]}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>

          <Field className="min-w-0">
            <FieldLabel htmlFor="queue-filter-channel">Канал</FieldLabel>
            <NativeSelect
              id="queue-filter-channel"
              name="channel"
              form={queueFiltersFormId}
              defaultValue={filters.channel ?? ""}
              className="w-full"
            >
              <NativeSelectOption value="">Все</NativeSelectOption>
              {Object.entries(channelLabels).map(([channel, label]) => (
                <NativeSelectOption key={channel} value={channel}>
                  {label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>

          <Field className="min-w-0">
            <FieldLabel htmlFor="queue-filter-source" className="inline-flex items-center gap-1">
              Источник
              <HelpTooltip
                label={QUEUE_GLOSSARY.source.label}
                content={QUEUE_GLOSSARY.source.content}
                placement="top-start"
              />
            </FieldLabel>
            <NativeSelect
              id="queue-filter-source"
              name="source"
              form={queueFiltersFormId}
              defaultValue={filters.source ?? ""}
              className="w-full"
            >
              <NativeSelectOption value="">Все</NativeSelectOption>
              {sources.map((source) => (
                <NativeSelectOption key={source} value={source}>
                  {source}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>

          <Field className="min-w-0">
            <FieldLabel htmlFor="queue-filter-assignee">Оператор</FieldLabel>
            <NativeSelect
              id="queue-filter-assignee"
              name="assignee"
              form={queueFiltersFormId}
              defaultValue={filters.assignee ?? ""}
              className="w-full"
            >
              <NativeSelectOption value="">Все</NativeSelectOption>
              {assignees.map((assignee) => (
                <NativeSelectOption key={assignee} value={assignee}>
                  {assignee}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>

          <Field className="min-w-0">
            <FieldLabel htmlFor="queue-filter-qaAssignee">Проверяющий</FieldLabel>
            <NativeSelect
              id="queue-filter-qaAssignee"
              name="qaAssignee"
              form={queueFiltersFormId}
              defaultValue={filters.qaAssignee ?? ""}
              className="w-full"
            >
              <NativeSelectOption value="">Все</NativeSelectOption>
              {qaAssignees.map((qaAssignee) => (
                <NativeSelectOption key={qaAssignee} value={qaAssignee}>
                  {qaAssignee}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>

          <Field className="min-w-0">
            <FieldLabel htmlFor="queue-filter-samplingType">Выборка</FieldLabel>
            <NativeSelect
              id="queue-filter-samplingType"
              name="samplingType"
              form={queueFiltersFormId}
              defaultValue={filters.samplingType ?? ""}
              className="w-full"
            >
              <NativeSelectOption value="">Все</NativeSelectOption>
              {queueSamplingTypes.map((samplingType) => (
                <NativeSelectOption key={samplingType} value={samplingType}>
                  {samplingTypeLabels[samplingType]}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>

          <Field className="min-w-0">
            <FieldLabel htmlFor="queue-filter-csatBucket">CSAT</FieldLabel>
            <NativeSelect
              id="queue-filter-csatBucket"
              name="csatBucket"
              form={queueFiltersFormId}
              defaultValue={filters.csatBucket ?? ""}
              className="w-full"
            >
              <NativeSelectOption value="">Все</NativeSelectOption>
              {queueCsatBuckets.map((csatBucket) => (
                <NativeSelectOption key={csatBucket} value={csatBucket}>
                  {csatBucketLabels[csatBucket]}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>

          <Field className="min-w-0">
            <FieldLabel htmlFor="queue-filter-supportLine">Линия</FieldLabel>
            <NativeSelect
              id="queue-filter-supportLine"
              name="supportLine"
              form={queueFiltersFormId}
              defaultValue={filters.supportLine ?? ""}
              className="w-full"
            >
              <NativeSelectOption value="">Все</NativeSelectOption>
              {supportLines.map((supportLine) => (
                <NativeSelectOption key={supportLine} value={supportLine}>
                  {supportLine}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>

          <Field className="min-w-0">
            <FieldLabel htmlFor="queue-filter-teamName">Команда</FieldLabel>
            <NativeSelect
              id="queue-filter-teamName"
              name="teamName"
              form={queueFiltersFormId}
              defaultValue={filters.teamName ?? ""}
              className="w-full"
            >
              <NativeSelectOption value="">Все</NativeSelectOption>
              {teamNames.map((teamName) => (
                <NativeSelectOption key={teamName} value={teamName}>
                  {teamName}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>

          <Field className="min-w-0">
            <FieldLabel htmlFor="queue-filter-process">Процесс</FieldLabel>
            <NativeSelect
              id="queue-filter-process"
              name="process"
              form={queueFiltersFormId}
              defaultValue={filters.process ?? ""}
              className="w-full"
            >
              <NativeSelectOption value="">Все</NativeSelectOption>
              {queueProcessFilters.map((process) => (
                <NativeSelectOption key={process} value={process}>
                  {processLabels[process]}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>

          <Field className="min-w-0">
            <FieldLabel htmlFor="queue-filter-due" className="inline-flex items-center gap-1">
              Срок (SLA)
              <HelpTooltip
                label={QUEUE_GLOSSARY.sla.label}
                content={QUEUE_GLOSSARY.sla.content}
                placement="top-start"
              />
            </FieldLabel>
            <NativeSelect
              id="queue-filter-due"
              name="due"
              form={queueFiltersFormId}
              defaultValue={filters.due ?? ""}
              className="w-full"
            >
              <NativeSelectOption value="">Все</NativeSelectOption>
              <NativeSelectOption value="overdue">Просрочено</NativeSelectOption>
            </NativeSelect>
          </Field>

          <Field className="min-w-0">
            <FieldLabel htmlFor="queue-filter-riskLevel">Риск</FieldLabel>
            <NativeSelect
              id="queue-filter-riskLevel"
              name="riskLevel"
              form={queueFiltersFormId}
              defaultValue={filters.riskLevel ?? ""}
              className="w-full"
            >
              <NativeSelectOption value="">Все</NativeSelectOption>
              {riskLevels.map((riskLevel) => (
                <NativeSelectOption key={riskLevel} value={riskLevel}>
                  {riskFilterLabels[riskLevel]}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
        </QueueAdvancedFilters>
      </div>

      {activeFilters.length > 0 ? (
        <>
          <Separator />
          <div className="queue-filterbar__active flex flex-wrap items-center gap-1.5 bg-muted/40 px-4 py-2.5">
            {activeFilters.map((filter) => (
              <Chip key={`${filter.label}:${filter.value}`} tone="accent">
                {filter.label}: {filter.value}
              </Chip>
            ))}
          </div>
        </>
      ) : null}
    </AutoSubmitFilterForm>
  );
}
