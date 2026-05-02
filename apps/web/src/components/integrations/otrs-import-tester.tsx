"use client";

import { AlertTriangle, CheckCircle2, UploadCloud } from "lucide-react";
import { useMemo, useState } from "react";
import { importOtrsFamilyTicketGet } from "@/lib/otrs-import-actions";
import {
  extractOtrsFamilyTickets,
  isOtrsFamilyTicketLike,
  normalizeOtrsFamilyTicket,
  otrsFamilyTicketGetExample,
  type OtrsFamilySource,
  type OtrsFamilyTicketGetResponse
} from "@/lib/normalizers/otrs-family";

const defaultPayload = JSON.stringify(otrsFamilyTicketGetExample, null, 2);

const sourceOptions = [
  { value: "znuny", label: "Znuny" },
  { value: "otrs", label: "OTRS CE 6" },
  { value: "otobo", label: "OTOBO" },
  { value: "otrs_family", label: "OTRS-family" }
] as const satisfies ReadonlyArray<{ value: OtrsFamilySource; label: string }>;

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
  const [baseUrl, setBaseUrl] = useState("https://support.example.com/otrs");
  const [samplingReason, setSamplingReason] = useState("Тестовый native импорт OTRS-family.");
  const preview = useMemo(
    () => buildPreview(payload, source, baseUrl, samplingReason),
    [baseUrl, payload, samplingReason, source]
  );

  return (
    <form action={importOtrsFamilyTicketGet} className="grid gap-4">
      <div className="grid gap-4 lg:grid-cols-[220px_1fr_1fr]">
        <label className="grid gap-1 text-sm font-medium text-[#344054]">
          Источник
          <select
            name="source"
            value={source}
            onChange={(event) => setSource(event.target.value as OtrsFamilySource)}
            className="rounded border border-[#d7dce5] bg-white px-3 py-2"
          >
            {sourceOptions.map((option) => (
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
        TicketGet JSON
        <textarea
          name="payload"
          value={payload}
          onChange={(event) => setPayload(event.target.value)}
          rows={14}
          spellCheck={false}
          className="resize-y rounded border border-[#d7dce5] bg-white px-3 py-2 font-mono text-xs leading-5"
        />
      </label>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[#d7dce5] bg-[#f7f8fb] px-4 py-3">
        {preview.ok ? (
          <div className="flex items-center gap-3 text-sm text-[#344054]">
            <CheckCircle2 size={18} className="text-[#116466]" aria-hidden="true" />
            <span>
              {preview.count} тикет(ов), {preview.messageCount} сообщени(й), первый: {preview.firstExternalId} ·{" "}
              {preview.firstSubject}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-3 text-sm text-[#b54708]">
            <AlertTriangle size={18} aria-hidden="true" />
            <span>{preview.error}</span>
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
