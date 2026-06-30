"use client";

import { useState } from "react";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  AiProviderKeyForm,
  type AiProviderKeyExtraField,
  type AiProviderModelField
} from "@/components/admin/ai-provider-key-form";
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

export function AiProviderKeysPanel({
  providers,
  defaultProvider
}: {
  providers: AiProviderConfig[];
  defaultProvider: string;
}) {
  const fallback = providers[0]?.provider ?? "";
  const initial = providers.some((entry) => entry.provider === defaultProvider) ? defaultProvider : fallback;
  const [selected, setSelected] = useState(initial);
  const current = providers.find((entry) => entry.provider === selected) ?? providers[0];

  if (!current) {
    return null;
  }

  return (
    <div className="px-5 pb-5">
      <label className="grid max-w-sm gap-1 text-sm font-medium text-[var(--foreground)]">
        Провайдер для настройки
        <select
          className="form-control"
          value={current.provider}
          onChange={(event) => setSelected(event.target.value)}
        >
          {providers.map((entry) => (
            <option key={entry.provider} value={entry.provider}>
              {entry.name} · {entry.statusLabel}
            </option>
          ))}
        </select>
      </label>

      <article className="record-card mt-4">
        <div className="record-row">
          <div className="min-w-0">
            <h3 className="record-title">{current.name}</h3>
            <p className="record-meta mt-1">{current.summary}</p>
          </div>
          <StatusBadge label="Ключ" value={current.statusLabel} tone={current.statusTone} />
        </div>
        <AiProviderKeyForm
          key={current.provider}
          provider={current.provider}
          maskedDbKey={current.maskedDbKey}
          hasEnvKey={current.hasEnvKey}
          extraFields={current.extraFields}
          modelField={current.modelField}
        />
      </article>
    </div>
  );
}
