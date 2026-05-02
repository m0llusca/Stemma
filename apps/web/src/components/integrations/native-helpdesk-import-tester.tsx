"use client";

import { AlertTriangle, CheckCircle2, UploadCloud } from "lucide-react";
import { useMemo, useState } from "react";
import { importNativeHelpdeskPayload } from "@/lib/native-helpdesk-import-actions";
import {
  nativeHelpdeskImportExamples,
  nativeHelpdeskSources,
  normalizeNativeHelpdeskPayload,
  type NativeHelpdeskSource
} from "@/lib/normalizers/native-helpdesk";

type PreviewState =
  | {
      ok: true;
      count: number;
      messageCount: number;
      firstSubject: string;
      firstExternalId: string;
    }
  | {
      ok: false;
      error: string;
    };

function examplePayload(source: NativeHelpdeskSource) {
  return JSON.stringify(nativeHelpdeskImportExamples[source], null, 2);
}

function buildPreview(payload: string, source: NativeHelpdeskSource, baseUrl: string, samplingReason: string): PreviewState {
  try {
    const parsed = JSON.parse(payload) as unknown;
    const conversations = normalizeNativeHelpdeskPayload(parsed, {
      source,
      baseUrl: baseUrl.trim() || undefined,
      samplingReason: samplingReason.trim() || undefined
    });

    if (conversations.length === 0) {
      return { ok: false, error: "Не найден ticket/conversation в поддерживаемом формате." };
    }

    return {
      ok: true,
      count: conversations.length,
      messageCount: conversations.reduce((sum, conversation) => sum + conversation.messages.length, 0),
      firstSubject: conversations[0]?.subject ?? "Без темы",
      firstExternalId: conversations[0]?.externalId ?? "unknown"
    };
  } catch {
    return { ok: false, error: "JSON не разбирается." };
  }
}

export function NativeHelpdeskImportTester() {
  const [source, setSource] = useState<NativeHelpdeskSource>("zendesk");
  const [payload, setPayload] = useState(examplePayload("zendesk"));
  const [baseUrl, setBaseUrl] = useState("https://support.example.com");
  const [samplingReason, setSamplingReason] = useState("Тестовый native импорт helpdesk.");
  const preview = useMemo(
    () => buildPreview(payload, source, baseUrl, samplingReason),
    [baseUrl, payload, samplingReason, source]
  );

  function updateSource(nextSource: NativeHelpdeskSource) {
    setSource(nextSource);
    setPayload(examplePayload(nextSource));
  }

  return (
    <form action={importNativeHelpdeskPayload} className="grid gap-4">
      <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)_minmax(0,1fr)]">
        <label className="grid gap-1 text-sm font-medium text-[#344054]">
          Источник
          <select
            name="source"
            value={source}
            onChange={(event) => updateSource(event.target.value as NativeHelpdeskSource)}
            className="rounded border border-[#d7dce5] bg-white px-3 py-2"
          >
            {nativeHelpdeskSources.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-[#344054]">
          Base URL
          <input
            name="baseUrl"
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
            className="rounded border border-[#d7dce5] bg-white px-3 py-2"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-[#344054]">
          Причина выборки
          <input
            name="samplingReason"
            value={samplingReason}
            onChange={(event) => setSamplingReason(event.target.value)}
            className="rounded border border-[#d7dce5] bg-white px-3 py-2"
          />
        </label>
      </div>

      <label className="grid gap-1 text-sm font-medium text-[#344054]">
        Native JSON
        <textarea
          name="payload"
          value={payload}
          onChange={(event) => setPayload(event.target.value)}
          rows={16}
          spellCheck={false}
          className="min-h-[320px] resize-y rounded border border-[#d7dce5] bg-white px-3 py-2 font-mono text-xs leading-5"
        />
      </label>

      <div className="grid gap-3 rounded-md border border-[#d7dce5] bg-[#f7f8fb] px-4 py-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        {preview.ok ? (
          <div className="flex min-w-0 items-start gap-3 text-sm text-[#344054]">
            <CheckCircle2 size={18} className="text-[#116466]" aria-hidden="true" />
            <span className="min-w-0 break-words">
              {preview.count} диалог(ов), {preview.messageCount} сообщени(й), первый: {preview.firstExternalId} ·{" "}
              {preview.firstSubject}
            </span>
          </div>
        ) : (
          <div className="flex min-w-0 items-start gap-3 text-sm text-[#b54708]">
            <AlertTriangle size={18} aria-hidden="true" />
            <span className="min-w-0 break-words">{preview.error}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={!preview.ok}
          className="inline-flex items-center gap-2 rounded bg-[#116466] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0b4f52] disabled:cursor-not-allowed disabled:bg-[#98a2b3]"
        >
          <UploadCloud size={16} aria-hidden="true" />
          Импортировать в очередь
        </button>
      </div>
    </form>
  );
}
