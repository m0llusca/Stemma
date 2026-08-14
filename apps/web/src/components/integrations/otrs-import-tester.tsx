"use client";

import { AlertTriangle, CheckCircle2, UploadCloud } from "lucide-react";
import { useMemo, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { importOtrsFamilyTicketGet } from "@/lib/otrs-import-actions";
import { russianPlural } from "@/lib/reports/report-format";
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
        <Field>
          <FieldLabel htmlFor="otrs-import-source">Источник</FieldLabel>
          <NativeSelect
            id="otrs-import-source"
            name="source"
            value={source}
            onChange={(event) => updateSource(event.target.value as OtrsFamilySource)}
            className="w-full"
          >
            {otrsFamilySourceOptions.map((option) => (
              <NativeSelectOption key={option.value} value={option.value}>
                {option.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor="otrs-import-baseUrl">Base URL</FieldLabel>
          <Input
            id="otrs-import-baseUrl"
            name="baseUrl"
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="otrs-import-samplingReason">Причина выборки</FieldLabel>
          <Input
            id="otrs-import-samplingReason"
            name="samplingReason"
            value={samplingReason}
            onChange={(event) => setSamplingReason(event.target.value)}
          />
        </Field>
      </div>

      <Field>
        <FieldLabel htmlFor="otrs-import-payload">TicketGet JSON</FieldLabel>
        <Textarea
          id="otrs-import-payload"
          name="payload"
          value={payload}
          onChange={(event) => setPayload(event.target.value)}
          rows={14}
          spellCheck={false}
          className="min-h-[280px] resize-y font-mono text-xs leading-5"
        />
      </Field>

      <div className="grid gap-3 rounded-lg border bg-muted/40 p-3">
        {preview.ok ? (
          <Alert>
            <CheckCircle2 />
            <AlertDescription>
              {russianPlural(preview.count, ["тикет", "тикета", "тикетов"])},{" "}
              {russianPlural(preview.messageCount, ["сообщение", "сообщения", "сообщений"])}, первый:{" "}
              {preview.firstExternalId} · {preview.firstSubject}
            </AlertDescription>
          </Alert>
        ) : (
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertDescription>{preview.error}</AlertDescription>
          </Alert>
        )}

        <Button type="submit" disabled={!preview.ok}>
          <UploadCloud data-icon="inline-start" aria-hidden="true" />
          Импортировать в очередь
        </Button>
      </div>
    </form>
  );
}
