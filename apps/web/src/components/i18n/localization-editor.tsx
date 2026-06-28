"use client";

import { RotateCcw, Save, Send, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";
import { Chip, type ChipTone } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";

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

function draftStateKey(localeId: string, keyId: string) {
  return `${localeId}:${keyId}`;
}

function valueForLocale(translationKey: TranslationKeyEntry, localeId: string) {
  return translationKey.values.find((value) => value.localeId === localeId) ?? null;
}

function initialDraftText(translationKey: TranslationKeyEntry, value: TranslationValue | null) {
  return value?.draftText ?? value?.publishedText ?? translationKey.defaultText;
}

function statusLabel(value: TranslationValue | null, draftText: string) {
  if (value?.publishedText == null) {
    return "Не опубликовано";
  }

  if ((value.draftText ?? "") !== value.publishedText || draftText !== value.publishedText) {
    return "Черновик";
  }

  return "Опубликовано";
}

function statusTone(value: TranslationValue | null, draftText: string): ChipTone {
  const label = statusLabel(value, draftText);

  if (label === "Опубликовано") {
    return "success";
  }

  if (label === "Черновик") {
    return "warning";
  }

  return "neutral";
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

  return (
    <div className="grid gap-4 p-4">
      <div className="grid gap-3 lg:grid-cols-[minmax(260px,0.9fr)_minmax(0,1.4fr)]">
        <form action={createLocaleAction} className="grid gap-3 rounded-lg border border-[var(--line-soft)] bg-[var(--surface-soft)] p-3">
          <div className="flex items-center gap-2 text-sm font-extrabold text-[var(--foreground)]">
            <SlidersHorizontal size={16} aria-hidden="true" />
            Новый язык
          </div>
          <div className="grid gap-2 sm:grid-cols-[0.8fr_1.2fr_auto]">
            <label className="grid gap-1 text-xs font-bold text-[var(--text-muted)]">
              Код
              <input name="code" required placeholder="en-US" className="form-control text-sm" />
            </label>
            <label className="grid gap-1 text-xs font-bold text-[var(--text-muted)]">
              Название
              <input name="name" required placeholder="English US" className="form-control text-sm" />
            </label>
            <button type="submit" className="action-button action-button--primary self-end">
              Создать
            </button>
          </div>
        </form>

        <div className="grid gap-3 rounded-lg border border-[var(--line-soft)] bg-[var(--surface-soft)] p-3 md:grid-cols-[minmax(180px,0.45fr)_minmax(220px,1fr)]">
          <label className="grid gap-1 text-xs font-bold text-[var(--text-muted)]">
            Язык
            <select
              className="form-control text-sm"
              value={selectedLocaleId}
              onChange={(event) => setSelectedLocaleId(event.target.value)}
              disabled={locales.length === 0}
            >
              {locales.map((locale) => (
                <option key={locale.id} value={locale.id}>
                  {locale.name} ({locale.code}){locale.isDefault ? " · основной" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-bold text-[var(--text-muted)]">
            Фильтр ключей
            <input
              type="search"
              className="form-control text-sm"
              value={keyFilter}
              onChange={(event) => setKeyFilter(event.target.value)}
              placeholder="dashboard.focus.title"
            />
          </label>
        </div>
      </div>

      {selectedLocale ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--text-muted)]">
          <span>
            Выбран язык: <strong className="text-[var(--foreground)]">{selectedLocale.name}</strong>
          </span>
          <Chip tone="neutral" size="sm" numeric>{filteredKeys.length} из {translationKeys.length} ключей</Chip>
        </div>
      ) : (
        <div className="soft-callout text-sm text-[var(--text-muted)]">Создайте первый язык, чтобы редактировать переводы.</div>
      )}

      {selectedLocale ? (
        <div className="overflow-x-auto">
          <div className="min-w-[960px] overflow-hidden rounded-lg border border-[var(--line-soft)] bg-[var(--surface-raised)]" role="table" aria-label="Ключи локализации">
            <div
              className="grid grid-cols-[minmax(220px,0.8fr)_minmax(260px,1fr)_minmax(320px,1.2fr)_minmax(260px,0.85fr)] gap-3 border-b border-[var(--line-soft)] bg-[var(--surface-soft)] px-3 py-2 text-[11px] font-extrabold uppercase text-[var(--text-muted)]"
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

              return (
                <div
                  key={`${selectedLocale.id}:${translationKey.id}`}
                  className="grid grid-cols-[minmax(220px,0.8fr)_minmax(260px,1fr)_minmax(320px,1.2fr)_minmax(260px,0.85fr)] gap-3 border-b border-[var(--line-soft)] px-3 py-3 text-sm last:border-b-0"
                  role="row"
                >
                  <div className="grid content-start gap-1" role="cell">
                    <strong className="break-words font-mono text-xs text-[var(--foreground)]">{translationKey.fullKey}</strong>
                    <span className="text-xs text-[var(--text-muted)]">{translationKey.ownerArea}</span>
                    {translationKey.description ? <span className="text-xs text-[var(--text-muted)]">{translationKey.description}</span> : null}
                  </div>

                  <div className="grid content-start gap-2 text-sm text-[var(--foreground)]" role="cell">
                    <span>{translationKey.defaultText}</span>
                    <Chip tone={statusTone(value, draftText)} size="xs">{statusLabel(value, draftText)}</Chip>
                    {value?.publishedAt ? <span className="text-xs text-[var(--text-muted)]">Версия {value.version}</span> : null}
                  </div>

                  <div role="cell">
                    <form id={draftFormId} action={saveDraftAction}>
                      <input type="hidden" name="localeId" value={selectedLocale.id} />
                      <input type="hidden" name="keyId" value={translationKey.id} />
                    </form>
                    <textarea
                      form={draftFormId}
                      name="draftText"
                      value={draftText}
                      onChange={(event) => setDrafts((current) => ({ ...current, [stateKey]: event.target.value }))}
                      rows={3}
                      aria-label={`Черновик ${translationKey.fullKey}`}
                      className="form-control min-h-[84px] resize-y text-sm"
                    />
                  </div>

                  <div className="flex flex-wrap content-start items-start gap-2" role="cell">
                    <button type="submit" form={draftFormId} className="action-button action-button--small">
                      <Save size={14} aria-hidden="true" />
                      Сохранить черновик {translationKey.fullKey}
                    </button>

                    <form id={publishFormId} action={publishAction}>
                      <input type="hidden" name="valueId" value={value?.id ?? ""} />
                    </form>
                    <button
                      type="submit"
                      form={publishFormId}
                      className="action-button action-button--primary action-button--small"
                      disabled={!canPublishOrRollback}
                    >
                      <Send size={14} aria-hidden="true" />
                      Опубликовать {translationKey.fullKey}
                    </button>

                    <form id={rollbackFormId} action={rollbackAction}>
                      <input type="hidden" name="valueId" value={value?.id ?? ""} />
                    </form>
                    <button type="submit" form={rollbackFormId} className="action-button action-button--small" disabled={!canPublishOrRollback}>
                      <RotateCcw size={14} aria-hidden="true" />
                      Откатить {translationKey.fullKey}
                    </button>
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
