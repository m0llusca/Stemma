"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  AiProviderKeyForm,
  type AiProviderKeyExtraField,
  type AiProviderModelField
} from "@/components/admin/ai-provider-key-form";
import { saveAiScoringProvider } from "@/lib/ai-scoring-settings-actions";
import type { StatusTone } from "@/lib/ui/status-tone";

export type AiProviderConfig = {
  provider: string;
  name: string;
  summary: string;
  statusLabel: string;
  statusTone: StatusTone;
  maskedDbKey: string | null;
  hasEnvKey: boolean;
  extraFields: AiProviderKeyExtraField[];
  modelField?: AiProviderModelField;
};

const ENGINE_OPTIONS = [
  { value: "auto", label: "Авто (первый настроенный)" },
  { value: "yandexgpt", label: "YandexGPT" },
  { value: "anthropic", label: "Claude (Anthropic)" },
  { value: "openai", label: "ChatGPT (OpenAI)" },
  { value: "deterministic", label: "Детерминированный (без сети)" }
];

function EngineSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" className="action-button action-button--primary" disabled={pending}>
      {pending ? "Сохраняем..." : "Сохранить движок"}
    </button>
  );
}

export function AiScoringEnginePanel({
  currentEngine,
  providers
}: {
  currentEngine: string;
  providers: AiProviderConfig[];
}) {
  const [selected, setSelected] = useState(currentEngine);
  const provider = providers.find((entry) => entry.provider === selected);

  return (
    <div className="px-5 pb-5">
      <p className="text-sm leading-5 text-[var(--text-muted)]">
        Выберите движок — ниже откроются его настройки. «Авто» берёт первый настроенный провайдер в порядке YandexGPT → Claude → ChatGPT, иначе детерминированный fallback.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-sm font-medium text-[var(--foreground)]">
          Движок оценки
          <select
            className="form-control"
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
          >
            {ENGINE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <form action={saveAiScoringProvider}>
          <input type="hidden" name="provider" value={selected} />
          <EngineSubmitButton />
        </form>
      </div>

      {provider ? (
        <article className="record-card mt-4">
          <div className="record-row">
            <div className="min-w-0">
              <h3 className="record-title">Ключ и модель — {provider.name}</h3>
              <p className="record-meta mt-1">{provider.summary}</p>
            </div>
            <StatusBadge label="Ключ" value={provider.statusLabel} tone={provider.statusTone} />
          </div>
          <AiProviderKeyForm
            key={provider.provider}
            provider={provider.provider}
            maskedDbKey={provider.maskedDbKey}
            hasEnvKey={provider.hasEnvKey}
            extraFields={provider.extraFields}
            modelField={provider.modelField}
          />
        </article>
      ) : selected === "auto" ? (
        <p className="record-meta mt-4">
          Режим «Авто» использует первый настроенный провайдер. Чтобы задать ключ конкретного провайдера, выберите его в списке выше.
        </p>
      ) : (
        <p className="record-meta mt-4">Детерминированный режим работает офлайн и не требует ключа.</p>
      )}
    </div>
  );
}
