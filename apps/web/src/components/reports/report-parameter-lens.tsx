"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SlidersHorizontal, XIcon } from "lucide-react";
import { ReportSavedViews } from "@/components/reports/report-saved-views";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger
} from "@/components/ui/popover";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from "@/components/ui/sheet";
import type { SavedReportViewSummary } from "@/lib/saved-report-view";
import { externalSourceLabel } from "@/lib/labels";
import {
  buildReportAnalysisHref,
  parseReportAnalysisState,
  reportFilterValue,
  serializeReportAnalysisState,
  type ReportAnalysisPatch,
  type ReportAnalysisState,
  type ReportFilterCatalog
} from "@/lib/reports/report-analysis-state";

function useMobileFilters() {
  const [mobile, setMobile] = React.useState(false);

  React.useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      return;
    }
    const query = window.matchMedia("(max-width: 640px)");
    const update = () => setMobile(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return mobile;
}

function defaultCustomRange() {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 29);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10)
  };
}

export const reportLocationNavigation = {
  reload() {
    window.location.reload();
  }
};

function filterChips(
  state: ReportAnalysisState,
  catalog: ReportFilterCatalog
) {
  return [
    state.team
      ? {
          key: `team:${state.team}`,
          label: reportFilterValue(state.team, catalog.teams) ?? state.team
        }
      : undefined,
    state.source
      ? {
          key: `source:${state.source}`,
          label: externalSourceLabel(state.source)
        }
      : undefined,
    state.risk === "high_plus"
      ? { key: "risk:high_plus", label: "HIGH+" }
      : state.risk
        ? {
            key: `risk:${state.risk}`,
            label: state.risk.toLocaleUpperCase("ru-RU")
          }
        : undefined,
    state.block
      ? {
          key: `block:${state.block}`,
          label: reportFilterValue(state.block, catalog.blocks) ?? state.block
        }
      : undefined
  ].filter((value): value is { key: string; label: string } => Boolean(value));
}

function ReportFilterFields({
  state,
  catalog,
  idPrefix,
  onFieldChange
}: {
  state: ReportAnalysisState;
  catalog: ReportFilterCatalog;
  idPrefix: string;
  onFieldChange: (name: string, value: string) => void;
}) {
  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-team`}>Команда</FieldLabel>
        <NativeSelect
          id={`${idPrefix}-team`}
          name="team"
          value={state.team ?? ""}
          onChange={(event) => onFieldChange("team", event.currentTarget.value)}
        >
          <NativeSelectOption value="">Все команды</NativeSelectOption>
          {catalog.teams.map((option) => (
            <NativeSelectOption key={option.slug} value={option.slug}>
              {option.value}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-source`}>Источник</FieldLabel>
        <NativeSelect
          id={`${idPrefix}-source`}
          name="source"
          value={state.source ?? ""}
          onChange={(event) => onFieldChange("source", event.currentTarget.value)}
        >
          <NativeSelectOption value="">Все источники</NativeSelectOption>
          {catalog.sources.map((source) => (
            <NativeSelectOption key={source} value={source}>
              {externalSourceLabel(source)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-risk`}>Риск</FieldLabel>
        <NativeSelect
          id={`${idPrefix}-risk`}
          name="risk"
          value={state.risk ?? ""}
          onChange={(event) => onFieldChange("risk", event.currentTarget.value)}
        >
          <NativeSelectOption value="">Все уровни</NativeSelectOption>
          <NativeSelectOption value="low">Низкий</NativeSelectOption>
          <NativeSelectOption value="medium">Средний</NativeSelectOption>
          <NativeSelectOption value="high">Высокий</NativeSelectOption>
          <NativeSelectOption value="critical">Критический</NativeSelectOption>
          <NativeSelectOption value="high_plus">HIGH+</NativeSelectOption>
        </NativeSelect>
      </Field>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-block`}>Блок</FieldLabel>
        <NativeSelect
          id={`${idPrefix}-block`}
          name="block"
          value={state.block ?? ""}
          onChange={(event) => onFieldChange("block", event.currentTarget.value)}
        >
          <NativeSelectOption value="">Все блоки</NativeSelectOption>
          {catalog.blocks.map((option) => (
            <NativeSelectOption key={option.slug} value={option.slug}>
              {option.value}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      {state.period === "custom" ? (
        <>
          <Field>
            <FieldLabel htmlFor={`${idPrefix}-start`}>С даты</FieldLabel>
            <Input
              id={`${idPrefix}-start`}
              name="start"
              type="date"
              value={state.start ?? ""}
              onChange={(event) => onFieldChange("start", event.currentTarget.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${idPrefix}-end`}>По дату</FieldLabel>
            <Input
              id={`${idPrefix}-end`}
              name="end"
              type="date"
              value={state.end ?? ""}
              onChange={(event) => onFieldChange("end", event.currentTarget.value)}
            />
          </Field>
        </>
      ) : null}
    </FieldGroup>
  );
}

export function ReportParameterLens({
  currentHref,
  catalog,
  savedViews
}: {
  currentHref: string;
  state: ReportAnalysisState;
  catalog: ReportFilterCatalog;
  savedViews: SavedReportViewSummary[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const mobile = useMobileFilters();
  const [hydrated, setHydrated] = React.useState(false);
  const liveState = React.useMemo(() => {
    const input: Record<string, string | string[] | undefined> = {};
    new URLSearchParams(search).forEach((value, key) => {
      const current = input[key];
      input[key] =
        current === undefined
          ? value
          : Array.isArray(current)
            ? [...current, value]
            : [current, value];
    });
    return parseReportAnalysisState(input, catalog);
  }, [catalog, search]);
  const liveHref = serializeReportAnalysisState(liveState);
  const savedViewsHref = buildReportAnalysisHref(
    liveHref,
    { evidenceType: null, evidenceKey: null },
    catalog
  );
  const serverMaterialHref = buildReportAnalysisHref(
    currentHref,
    { evidenceType: null, evidenceKey: null },
    catalog
  );
  const chips = filterChips(liveState, catalog);

  React.useEffect(() => {
    setHydrated(true);
  }, []);

  React.useEffect(() => {
    const reloadMaterialPopstate = (event: PopStateEvent) => {
      if (event.state?.__NA !== true) return;
      if (window.location.pathname !== "/reports") return;
      const eventHref =
        `${window.location.pathname}${window.location.search}${window.location.hash}`;
      let targetMaterialHref: string;
      try {
        const targetCanonicalHref = buildReportAnalysisHref(
          eventHref,
          {},
          catalog
        );
        targetMaterialHref = buildReportAnalysisHref(
          targetCanonicalHref,
          { evidenceType: null, evidenceKey: null },
          catalog
        );
      } catch {
        reportLocationNavigation.reload();
        return;
      }
      if (targetMaterialHref === serverMaterialHref) return;
      reportLocationNavigation.reload();
    };
    window.addEventListener("popstate", reloadMaterialPopstate);
    return () => {
      window.removeEventListener("popstate", reloadMaterialPopstate);
    };
  }, [catalog, serverMaterialHref]);

  function navigate(patch: ReportAnalysisPatch) {
    const eventHref =
      `${window.location.pathname}${window.location.search}${window.location.hash}`;
    let canonicalBaseHref = liveHref;
    try {
      canonicalBaseHref = buildReportAnalysisHref(eventHref, {}, catalog);
    } catch {
      // The hook-derived canonical state remains the safe fallback for an
      // unrelated pathname or malformed browser URL.
    }
    const href = buildReportAnalysisHref(canonicalBaseHref, patch, catalog);
    window.history.pushState(null, "", href);
    router.refresh();
  }

  function handleFieldChange(name: string, value: string) {
    const normalized = value || null;
    if (name === "period" && value === "custom") {
      navigate({
        period: "custom",
        ...defaultCustomRange()
      });
      return;
    }
    navigate({ [name]: normalized });
  }

  const filterFields = (
    <ReportFilterFields
      state={liveState}
      catalog={catalog}
      idPrefix={mobile ? "mobile-report-filter" : "desktop-report-filter"}
      onFieldChange={handleFieldChange}
    />
  );

  return (
    <section
      role="region"
      aria-label="Параметры отчёта"
      data-hydrated={hydrated ? "true" : "false"}
      className="flex h-14 w-full max-w-full min-w-0 flex-row items-center gap-2 rounded-xl border bg-background px-3 py-1 min-[641px]:max-h-14 min-[641px]:flex-row min-[641px]:items-center [@media(min-width:1024px)_and_(min-height:700px)]:sticky [@media(min-width:1024px)_and_(min-height:700px)]:top-(--app-topbar-height) [@media(min-width:1024px)_and_(min-height:700px)]:z-10"
    >
      <form
        action="/reports"
        className="relative flex w-0 max-w-full min-w-0 flex-1 items-center gap-2 overflow-x-auto"
        onSubmit={(event) => event.preventDefault()}
      >
        <Field className="min-w-40 gap-1">
          <FieldLabel htmlFor="analysis-period" className="sr-only">
            Период
          </FieldLabel>
          <NativeSelect
            id="analysis-period"
            name="period"
            value={liveState.period}
            aria-label="Период"
            onChange={(event) =>
              handleFieldChange("period", event.currentTarget.value)
            }
          >
            <NativeSelectOption value="vk-current">Текущий 22–21</NativeSelectOption>
            <NativeSelectOption value="vk-previous">Прошлый 22–21</NativeSelectOption>
            <NativeSelectOption value="calendar-current">Текущий месяц</NativeSelectOption>
            <NativeSelectOption value="calendar-previous">Прошлый месяц</NativeSelectOption>
            <NativeSelectOption value="quarter-current">Квартал</NativeSelectOption>
            <NativeSelectOption value="custom">Произвольный</NativeSelectOption>
          </NativeSelect>
        </Field>
        <Field className="min-w-40 gap-1">
          <FieldLabel htmlFor="analysis-compare" className="sr-only">
            Сравнение
          </FieldLabel>
          <NativeSelect
            id="analysis-compare"
            name="compare"
            value={liveState.compare}
            aria-label="Сравнение"
            onChange={(event) =>
              handleFieldChange("compare", event.currentTarget.value)
            }
          >
            <NativeSelectOption value="previous">Прошлый период</NativeSelectOption>
            <NativeSelectOption value="year">Год к году</NativeSelectOption>
            <NativeSelectOption value="none">Без сравнения</NativeSelectOption>
          </NativeSelect>
        </Field>
        <Field className="min-w-30 gap-1">
          <FieldLabel htmlFor="analysis-grain" className="sr-only">
            Шаг
          </FieldLabel>
          <NativeSelect
            id="analysis-grain"
            name="grain"
            value={liveState.grain}
            aria-label="Шаг"
            onChange={(event) =>
              handleFieldChange("grain", event.currentTarget.value)
            }
          >
            <NativeSelectOption value="day">По дням</NativeSelectOption>
            <NativeSelectOption value="week">По неделям</NativeSelectOption>
          </NativeSelect>
        </Field>
      </form>

      <div className="flex w-0 max-w-full min-w-0 flex-1 items-center gap-2 overflow-x-auto min-[641px]:w-auto min-[641px]:flex-none">
        {mobile ? (
          <Sheet>
            <SheetTrigger render={<Button variant="outline" size="sm" />}>
              <SlidersHorizontal data-icon="inline-start" aria-hidden="true" />
              Фильтры ({chips.length})
            </SheetTrigger>
              <SheetContent
                showCloseButton={false}
                className="data-[side=right]:h-dvh data-[side=right]:w-full data-[side=right]:max-w-none data-[side=right]:sm:max-w-none"
              >
              <SheetClose
                render={
                  <Button
                    variant="ghost"
                    className="absolute top-3 right-3"
                    size="icon-sm"
                  />
                }
              >
                <XIcon aria-hidden="true" />
                <span className="sr-only">Закрыть</span>
              </SheetClose>
              <SheetHeader>
                <SheetTitle>Фильтры отчёта</SheetTitle>
                <SheetDescription>
                  Ограничьте выборку по команде, источнику, риску и блоку.
                </SheetDescription>
              </SheetHeader>
              <div className="px-4">{filterFields}</div>
            </SheetContent>
          </Sheet>
        ) : (
          <Popover>
            <PopoverTrigger render={<Button variant="outline" size="sm" />}>
              <SlidersHorizontal data-icon="inline-start" aria-hidden="true" />
              Фильтры ({chips.length})
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80">
              <PopoverHeader>
                <PopoverTitle>Фильтры отчёта</PopoverTitle>
                <PopoverDescription>
                  Команда, источник, риск и блок критериев.
                </PopoverDescription>
              </PopoverHeader>
              {filterFields}
            </PopoverContent>
          </Popover>
        )}
        <ReportSavedViews
          currentHref={savedViewsHref}
          savedViews={savedViews}
        />
      </div>

      {chips.length > 0 ? (
        <div className="flex w-0 max-w-full min-w-0 flex-1 items-center gap-1 overflow-x-auto min-[641px]:order-last min-[641px]:max-w-sm">
          {chips.slice(0, 3).map((chip) => (
            <Badge
              key={chip.key}
              variant="secondary"
              data-testid="active-report-filter-chip"
            >
              {chip.label}
            </Badge>
          ))}
          {chips.length > 3 ? (
            <Badge variant="outline">Ещё {chips.length - 3}</Badge>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
