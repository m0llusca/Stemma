"use client";

import { RotateCcw, Save, Send, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type LocaleOption = {
  id: string;
  code: string;
  name: string;
  isDefault: boolean;
  isEnabled: boolean;
};

type TranslationValue = {
  id: string;
  localeId: string;
  draftText: string | null;
  publishedText: string | null;
  publishedAt: string | null;
  version: number;
};

type TranslationKeyEntry = {
  id: string;
  namespace: string;
  key: string;
  fullKey: string;
  defaultText: string;
  description: string | null;
  ownerArea: string;
  values: TranslationValue[];
};

type ServerFormAction = (formData: FormData) => Promise<void>;

type LocalizationEditorProps = {
  locales: LocaleOption[];
  translationKeys: TranslationKeyEntry[];
  createLocaleAction: ServerFormAction;
  saveDraftAction: ServerFormAction;
  publishAction: ServerFormAction;
  rollbackAction: ServerFormAction;
};

type StatusKind = "published" | "draft" | "unpublished";

function draftStateKey(localeId: string, keyId: string) {
  return `${localeId}:${keyId}`;
}

function valueForLocale(translationKey: TranslationKeyEntry, localeId: string) {
  return translationKey.values.find((value) => value.localeId === localeId) ?? null;
}

function initialDraftText(translationKey: TranslationKeyEntry, value: TranslationValue | null) {
  return value?.draftText ?? value?.publishedText ?? translationKey.defaultText;
}

function statusKind(value: TranslationValue | null, draftText: string): StatusKind {
  if (value?.publishedText == null) {
    return "unpublished";
  }

  if ((value.draftText ?? "") !== value.publishedText || draftText !== value.publishedText) {
    return "draft";
  }

  return "published";
}

function statusLabel(kind: StatusKind) {
  if (kind === "published") {
    return "Опубликовано";
  }

  if (kind === "draft") {
    return "Черновик";
  }

  return "Не опубликовано";
}

function statusBadgeClass(kind: StatusKind) {
  if (kind === "published") {
    return "border-transparent bg-emerald-500/15 text-emerald-800 dark:text-emerald-300";
  }

  if (kind === "draft") {
    return "border-transparent bg-amber-500/15 text-amber-900 dark:text-amber-300";
  }

  return undefined;
}

function localeLabel(locale: LocaleOption) {
  return `${locale.name} (${locale.code})${locale.isDefault ? " · основной" : ""}`;
}

export function LocalizationEditor({
  locales,
  translationKeys,
  createLocaleAction,
  saveDraftAction,
  publishAction,
  rollbackAction
}: LocalizationEditorProps) {
  const [selectedLocaleId, setSelectedLocaleId] = useState(locales[0]?.id ?? "");
  const [keyFilter, setKeyFilter] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const selectedLocale = locales.find((locale) => locale.id === selectedLocaleId) ?? locales[0] ?? null;
  const normalizedFilter = keyFilter.trim().toLowerCase();
  const filteredKeys = useMemo(() => {
    if (!normalizedFilter) {
      return translationKeys;
    }

    return translationKeys.filter((translationKey) =>
      [
        translationKey.fullKey,
        translationKey.defaultText,
        translationKey.description ?? "",
        translationKey.ownerArea
      ].some((value) => value.toLowerCase().includes(normalizedFilter))
    );
  }, [normalizedFilter, translationKeys]);

  const localeItems = useMemo(
    () => Object.fromEntries(locales.map((locale) => [locale.id, localeLabel(locale)])),
    [locales]
  );

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 lg:grid-cols-[minmax(260px,0.9fr)_minmax(0,1.4fr)]">
        <Card size="sm">
          <CardHeader className="pb-0">
            <CardTitle className="flex items-center gap-2 text-sm">
              <SlidersHorizontal className="size-4" aria-hidden="true" />
              Новый язык
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form action={createLocaleAction}>
              <FieldGroup className="gap-3 sm:grid sm:grid-cols-[0.8fr_1.2fr_auto] sm:items-end">
                <Field>
                  <FieldLabel htmlFor="locale-code">Код</FieldLabel>
                  <Input id="locale-code" name="code" required placeholder="en-US" />
                </Field>
                <Field>
                  <FieldLabel htmlFor="locale-name">Название</FieldLabel>
                  <Input id="locale-name" name="name" required placeholder="English US" />
                </Field>
                <Button type="submit" className="sm:self-end">
                  Создать
                </Button>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardContent className="grid gap-3 pt-0 md:grid-cols-[minmax(180px,0.45fr)_minmax(220px,1fr)]">
            <Field>
              <FieldLabel htmlFor="locale-select">Язык</FieldLabel>
              <Select
                value={selectedLocaleId || null}
                onValueChange={(value) => {
                  if (value != null) {
                    setSelectedLocaleId(value);
                  }
                }}
                disabled={locales.length === 0}
              >
                <SelectTrigger id="locale-select" className="w-full" aria-label="Язык">
                  <SelectValue placeholder="Выберите язык">
                    {(value: string | null) => (value ? localeItems[value] ?? value : "Выберите язык")}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent align="start">
                  {locales.map((locale) => (
                    <SelectItem key={locale.id} value={locale.id}>
                      {localeLabel(locale)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="key-filter">Фильтр ключей</FieldLabel>
              <Input
                id="key-filter"
                type="search"
                value={keyFilter}
                onChange={(event) => setKeyFilter(event.target.value)}
                placeholder="dashboard.focus.title"
              />
            </Field>
          </CardContent>
        </Card>
      </div>

      {selectedLocale ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            Выбран язык: <strong className="text-foreground">{selectedLocale.name}</strong>
          </span>
          <Badge variant="secondary" className="tabular-nums">
            {filteredKeys.length} из {translationKeys.length} ключей
          </Badge>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          Создайте первый язык, чтобы редактировать переводы.
        </div>
      )}

      {selectedLocale ? (
        <div className="overflow-x-auto">
          <div
            className="min-w-[960px] overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10"
            role="table"
            aria-label="Ключи локализации"
          >
            <div
              className="grid grid-cols-[minmax(220px,0.8fr)_minmax(260px,1fr)_minmax(320px,1.2fr)_minmax(260px,0.85fr)] gap-3 border-b border-border bg-muted/50 px-3 py-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase"
              role="row"
            >
              <span role="columnheader">Ключ</span>
              <span role="columnheader">Базовый текст</span>
              <span role="columnheader">Черновик</span>
              <span role="columnheader">Действия</span>
            </div>

            {filteredKeys.map((translationKey) => {
              const value = valueForLocale(translationKey, selectedLocale.id);
              const stateKey = draftStateKey(selectedLocale.id, translationKey.id);
              const draftText = drafts[stateKey] ?? initialDraftText(translationKey, value);
              const draftFormId = `save-${selectedLocale.id}-${translationKey.id}`;
              const publishFormId = `publish-${selectedLocale.id}-${translationKey.id}`;
              const rollbackFormId = `rollback-${selectedLocale.id}-${translationKey.id}`;
              const canPublishOrRollback = Boolean(value?.id);
              const kind = statusKind(value, draftText);

              return (
                <div
                  key={`${selectedLocale.id}:${translationKey.id}`}
                  className="grid grid-cols-[minmax(220px,0.8fr)_minmax(260px,1fr)_minmax(320px,1.2fr)_minmax(260px,0.85fr)] gap-3 border-b border-border px-3 py-3 text-sm last:border-b-0"
                  role="row"
                >
                  <div className="grid content-start gap-1" role="cell">
                    <strong className="break-words font-mono text-xs text-foreground">{translationKey.fullKey}</strong>
                    <span className="text-xs text-muted-foreground">{translationKey.ownerArea}</span>
                    {translationKey.description ? (
                      <span className="text-xs text-muted-foreground">{translationKey.description}</span>
                    ) : null}
                  </div>

                  <div className="grid content-start gap-2 text-sm text-foreground" role="cell">
                    <span>{translationKey.defaultText}</span>
                    <Badge
                      variant={kind === "unpublished" ? "secondary" : "outline"}
                      className={cn("w-fit", statusBadgeClass(kind))}
                    >
                      {statusLabel(kind)}
                    </Badge>
                    {value?.publishedAt ? (
                      <span className="text-xs text-muted-foreground">Версия {value.version}</span>
                    ) : null}
                  </div>

                  <div role="cell">
                    <form id={draftFormId} action={saveDraftAction}>
                      <input type="hidden" name="localeId" value={selectedLocale.id} />
                      <input type="hidden" name="keyId" value={translationKey.id} />
                    </form>
                    <Textarea
                      form={draftFormId}
                      name="draftText"
                      value={draftText}
                      onChange={(event) => setDrafts((current) => ({ ...current, [stateKey]: event.target.value }))}
                      rows={3}
                      aria-label={`Черновик ${translationKey.fullKey}`}
                      className="min-h-[84px] resize-y"
                    />
                  </div>

                  <div className="flex flex-wrap content-start items-start gap-2" role="cell">
                    <Button type="submit" form={draftFormId} variant="outline" size="sm">
                      <Save data-icon="inline-start" aria-hidden="true" />
                      Сохранить черновик {translationKey.fullKey}
                    </Button>

                    <form id={publishFormId} action={publishAction}>
                      <input type="hidden" name="valueId" value={value?.id ?? ""} />
                    </form>
                    <Button type="submit" form={publishFormId} size="sm" disabled={!canPublishOrRollback}>
                      <Send data-icon="inline-start" aria-hidden="true" />
                      Опубликовать {translationKey.fullKey}
                    </Button>

                    <form id={rollbackFormId} action={rollbackAction}>
                      <input type="hidden" name="valueId" value={value?.id ?? ""} />
                    </form>
                    <Button type="submit" form={rollbackFormId} variant="outline" size="sm" disabled={!canPublishOrRollback}>
                      <RotateCcw data-icon="inline-start" aria-hidden="true" />
                      Откатить {translationKey.fullKey}
                    </Button>
                  </div>
                </div>
              );
            })}

            {filteredKeys.length === 0 ? (
              <EmptyState
                size="inline"
                icon={<SlidersHorizontal size={20} aria-hidden="true" />}
                title="Ключи по фильтру не найдены"
                description="Измените запрос фильтра, чтобы увидеть строки для перевода."
              />
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
