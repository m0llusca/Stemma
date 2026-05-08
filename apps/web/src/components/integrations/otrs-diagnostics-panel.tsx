"use client";

import { Activity, AlertTriangle, CheckCircle2, Play } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { runOtrsDiagnosticsActionState, type OtrsDiagnosticsActionState } from "@/lib/integration-actions";

const initialState: OtrsDiagnosticsActionState = null;

type DiagnosticStep = {
  id: string;
  key: string;
  position: number;
  status: string;
  durationMs: number;
  remediationHint: string | null;
};

type DiagnosticRun = {
  id: string;
  status: string;
  mode: string;
  startedAt: string;
  finishedAt: string | null;
  redactedEndpoint: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  steps: DiagnosticStep[];
} | null;

type OtrsDiagnosticsPanelProps = {
  integrationId: string;
  latestDiagnostic: DiagnosticRun;
};

function statusClass(status: string) {
  if (["succeeded", "ok"].includes(status)) {
    return "pill--ok";
  }

  if (["failed", "error"].includes(status)) {
    return "pill--warn";
  }

  return "pill--neutral";
}

function statusIcon(status: string) {
  if (["succeeded", "ok"].includes(status)) {
    return <CheckCircle2 size={16} className="text-[#15803d]" aria-hidden="true" />;
  }

  if (["failed", "error"].includes(status)) {
    return <AlertTriangle size={16} className="text-[#b91c1c]" aria-hidden="true" />;
  }

  return <Activity size={16} className="text-[#64748b]" aria-hidden="true" />;
}

function formatDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString("ru-RU") : "Нет данных";
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" className="action-button action-button--primary" disabled={pending}>
      <Play size={16} aria-hidden="true" />
      {pending ? "Запускаем" : "Запустить диагностику"}
    </button>
  );
}

export function OtrsDiagnosticsPanel({ integrationId, latestDiagnostic }: OtrsDiagnosticsPanelProps) {
  const [state, formAction] = useActionState(runOtrsDiagnosticsActionState, initialState);

  return (
    <section className="panel overflow-hidden">
      <div className="border-b border-[#d9e0ea] px-5 py-4">
        <h2 className="text-lg font-semibold">Диагностика</h2>
        <p className="mt-1 text-sm leading-5 text-[#64748b]">
          Проверяет конфиг, GenericInterface endpoint, авторизацию, TicketGet и безопасный dry-run.
        </p>
      </div>

      <div className="grid gap-4 p-4">
        <form action={formAction} className="soft-callout grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <input type="hidden" name="integrationId" value={integrationId} />
          <label className="grid gap-1.5 text-sm font-medium text-[#334155]">
            Manual TicketID для TicketGet
            <input name="manualTicketId" placeholder="42" className="form-control h-10 text-sm" />
          </label>
          <SubmitButton />
        </form>

        {state ? (
          <div className={`soft-callout text-sm font-medium ${state.ok ? "text-[#166534]" : "text-[#b91c1c]"}`}>
            {state.message}
            {state.status ? ` Статус: ${state.status}.` : ""}
          </div>
        ) : null}

        {latestDiagnostic ? (
          <div className="grid gap-3">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="soft-callout">
                <p className="soft-callout__label">Статус</p>
                <p className="record-title record-title--tight">
                  <span className={`pill ${statusClass(latestDiagnostic.status)}`}>{latestDiagnostic.status}</span>
                </p>
              </div>
              <div className="soft-callout">
                <p className="soft-callout__label">Запуск</p>
                <p className="record-meta">{formatDate(latestDiagnostic.startedAt)}</p>
              </div>
              <div className="soft-callout">
                <p className="soft-callout__label">Endpoint</p>
                <p className="record-meta compact-text">{latestDiagnostic.redactedEndpoint ?? "Нет данных"}</p>
              </div>
            </div>

            <div className="scroll-area">
              <table className="table-fixed-copy w-full min-w-[720px] border-collapse text-left text-sm">
                <thead className="bg-[#edf2ff] text-xs uppercase text-[#475569]">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Step</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Duration</th>
                    <th className="px-4 py-3 font-semibold">Remediation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#d9e0ea]">
                  {latestDiagnostic.steps.map((step) => (
                    <tr key={step.id}>
                      <td className="px-4 py-3 font-mono text-xs">{step.key}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-2">
                          {statusIcon(step.status)}
                          <span className={`pill ${statusClass(step.status)}`}>{step.status}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[#334155]">{step.durationMs} ms</td>
                      <td className="px-4 py-3 text-[#334155]">{step.remediationHint ?? "Нет подсказки."}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {latestDiagnostic.errorMessage ? (
              <div className="soft-callout soft-callout--warn text-sm leading-5 text-[#b45309]">
                {latestDiagnostic.errorCode ? `${latestDiagnostic.errorCode}: ` : ""}
                {latestDiagnostic.errorMessage}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="soft-callout text-sm leading-5 text-[#64748b]">
            Диагностика еще не запускалась. Первый запуск создаст redacted endpoint и пошаговый отчет.
          </div>
        )}
      </div>
    </section>
  );
}
