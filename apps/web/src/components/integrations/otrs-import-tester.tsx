"use client";

import { AlertTriangle, CheckCircle2, UploadCloud } from "lucide-react";
import { useMemo, useState } from "react";
import { importOtrsFamilyTicketGet } from "@/lib/otrs-import-actions";
import {
  extractOtrsFamilyTickets,
  isOtrsFamilyTicketLike,
  normalizeOtrsFamilyTicket,
  otrsFamilyProfileForSource,
  otrsFamilySourceOptions,
  otrsFamilyTicketGetExample,
  type OtrsFamilySource,
  type OtrsFamilyTicketGetResponse
} from "@/lib/normalizers/otrs-family";

const defaultPayload = JSON.stringify(otrsFamilyTicketGetExample, null, 2);

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

function buildPreview(
  payload: string,
  source: OtrsFamilySource,
  baseUrl: string,
  samplingReason: string
): PreviewState {
  try {
    const parsed = JSON.parse(payload) as OtrsFamilyTicketGetResponse;
    const tickets = extractOtrsFamilyTickets(parsed);

    if (tickets.length === 0 || tickets.some((ticket) => !isOtrsFamilyTicketLike(ticket))) {
      return { ok: false, error: "Не найден TicketGet-ответ с тикетом или статьями." };
    }

    const conversations = tickets.map((ticket) =>
      normalizeOtrsFamilyTicket(ticket, {
        source,
        baseUrl: baseUrl.trim() || undefined,
        samplingReason: samplingReason.trim() || undefined
      })
    );

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

export function OtrsImportTester() {
  const [payload, setPayload] = useState(defaultPayload);
  const [source, setSource] = useState<OtrsFamilySource>("znuny");
  const [baseUrl, setBaseUrl] = useState<string>(otrsFamilyProfileForSource("znuny").exampleBaseUrl);
  const [samplingReason, setSamplingReason] = useState("Тестовый native импорт OTRS-family.");
  const preview = useMemo(
    () => buildPreview(payload, source, baseUrl, samplingReason),
    [baseUrl, payload, samplingReason, source]
  );

  function updateSource(nextSource: OtrsFamilySource) {
    setSource(nextSource);
    setBaseUrl(otrsFamilyProfileForSource(nextSource).exampleBaseUrl);
  }

  return (
    <form action={importOtrsFamilyTicketGet} className="grid gap-4">
      <div className="grid gap-4">
        <label className="grid gap-1 text-sm font-medium text-[var(--text-body)]">
          Источник
          <select
            name="source"
            value={source}
            onChange={(event) => updateSource(event.target.value as OtrsFamilySource)}
            className="w-full min-w-0 rounded border border-[var(--border)] bg-[var(--panel)] px-3 py-2"
          >
            {otrsFamilySourceOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium text-[var(--text-body)]">
          Base URL
          <input
            name="baseUrl"
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
            className="w-full min-w-0 rounded border border-[var(--border)] bg-[var(--panel)] px-3 py-2"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium text-[var(--text-body)]">
          Причина выборки
          <input
            name="samplingReason"
            value={samplingReason}
            onChange={(event) => setSamplingReason(event.target.value)}
            className="w-full min-w-0 rounded border border-[var(--border)] bg-[var(--panel)] px-3 py-2"
          />
        </label>
      </div>

      <label className="grid gap-1 text-sm font-medium text-[var(--text-body)]">
        TicketGet JSON
        <textarea
          name="payload"
          value={payload}
          onChange={(event) => setPayload(event.target.value)}
          rows={14}
          spellCheck={false}
          className="min-h-[280px] w-full min-w-0 resize-y rounded border border-[var(--border)] bg-[var(--panel)] px-3 py-2 font-mono text-xs leading-5"
        />
      </label>

      <div className="grid gap-3 rounded-md border border-[var(--border)] bg-[var(--panel-muted)] px-4 py-3">
        {preview.ok ? (
          <div className="flex min-w-0 items-start gap-3 text-sm text-[var(--text-body)]">
            <CheckCircle2 size={18} className="text-[#3157d5]" aria-hidden="true" />
            <span className="min-w-0 break-words">
              {preview.count} тикет(ов), {preview.messageCount} сообщени(й), первый: {preview.firstExternalId} ·{" "}
              {preview.firstSubject}
            </span>
          </div>
        ) : (
          <div className="flex min-w-0 items-start gap-3 text-sm text-[var(--warning)]">
            <AlertTriangle size={18} aria-hidden="true" />
            <span className="min-w-0 break-words">{preview.error}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={!preview.ok}
          className="action-button action-button--primary"
        >
          <UploadCloud size={16} aria-hidden="true" />
          Импортировать в очередь
        </button>
      </div>
    </form>
  );
}
