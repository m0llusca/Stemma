"use client";

import { AlertTriangle, CheckCircle2, UploadCloud } from "lucide-react";
import { useMemo, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { importNativeHelpdeskPayload } from "@/lib/native-helpdesk-import-actions";
import { russianPlural } from "@/lib/reports/report-format";
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

export function NativeHelpdeskImportTester({ initialSource = "zendesk" }: { initialSource?: NativeHelpdeskSource }) {
  const [source, setSource] = useState<NativeHelpdeskSource>(initialSource);
  const [payload, setPayload] = useState(examplePayload(initialSource));
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
        <Field>
          <FieldLabel htmlFor="native-source">Источник</FieldLabel>
          <NativeSelect
            id="native-source"
            name="source"
            value={source}
            onChange={(event) => updateSource(event.target.value as NativeHelpdeskSource)}
            className="w-full"
          >
            {nativeHelpdeskSources.map((option) => (
              <NativeSelectOption key={option.value} value={option.value}>
                {option.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor="native-baseUrl">Base URL</FieldLabel>
          <Input
            id="native-baseUrl"
            name="baseUrl"
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="native-samplingReason">Причина выборки</FieldLabel>
          <Input
            id="native-samplingReason"
            name="samplingReason"
            value={samplingReason}
            onChange={(event) => setSamplingReason(event.target.value)}
          />
        </Field>
      </div>

      <Field>
        <FieldLabel htmlFor="native-payload">Исходный JSON</FieldLabel>
        <Textarea
          id="native-payload"
          name="payload"
          value={payload}
          onChange={(event) => setPayload(event.target.value)}
          rows={16}
          spellCheck={false}
          className="min-h-[320px] resize-y font-mono text-xs leading-5"
        />
      </Field>

      <div className="grid gap-3 rounded-lg border bg-muted/40 p-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        {preview.ok ? (
          <Alert>
            <CheckCircle2 />
            <AlertDescription>
              {russianPlural(preview.count, ["диалог", "диалога", "диалогов"])},{" "}
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
