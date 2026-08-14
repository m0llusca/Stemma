"use client";

import { Activity, AlertTriangle, CheckCircle2, Play } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { ActionFlowGuard } from "@/components/action-flow-guard";
import { actionFlowNavigation } from "@/lib/action-result-bridge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { runOtrsDiagnosticsActionState, type OtrsDiagnosticsActionState } from "@/lib/integration-actions";
import { cn } from "@/lib/utils";

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

function statusBadgeClass(status: string) {
  if (["succeeded", "ok"].includes(status)) {
    return "border-transparent bg-emerald-500/15 text-emerald-800 dark:text-emerald-300";
  }

  if (["failed", "error"].includes(status)) {
    return "border-transparent bg-destructive/15 text-destructive";
  }

  return "";
}

function statusIcon(status: string) {
  if (["succeeded", "ok"].includes(status)) {
    return <CheckCircle2 size={16} className="text-emerald-600" aria-hidden="true" />;
  }

  if (["failed", "error"].includes(status)) {
    return <AlertTriangle size={16} className="text-destructive" aria-hidden="true" />;
  }

  return <Activity size={16} className="text-muted-foreground" aria-hidden="true" />;
}

function formatDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString("ru-RU") : "Нет данных";
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      <Play data-icon="inline-start" aria-hidden="true" />
      {pending ? "Запускаем" : "Запустить диагностику"}
    </Button>
  );
}

export function OtrsDiagnosticsPanel({ integrationId, latestDiagnostic }: OtrsDiagnosticsPanelProps) {
  const flashKey = `otrs-diagnostics-result:${integrationId}`;
  const [actionState, formAction] = useActionState(runOtrsDiagnosticsActionState, initialState);
  // The bridged result feeds the alert when the client router drops the
  // action commit; on success the page reloads so the fresh diagnostic run
  // renders from the server, and the flash keeps the message across it.
  const [bridgedState, setBridgedState] = useState<OtrsDiagnosticsActionState>(null);
  const state = bridgedState ?? actionState;

  useEffect(() => {
    const raw = sessionStorage.getItem(flashKey);
    if (raw) {
      sessionStorage.removeItem(flashKey);
      try {
        setBridgedState(JSON.parse(raw) as OtrsDiagnosticsActionState);
      } catch {
        // A malformed flash entry is simply dropped.
      }
    }
  }, [flashKey]);

  return (
    <Card
      className="overflow-clip"
      role="region"
      aria-labelledby="otrs-diagnostics-title"
    >
      <CardHeader className="border-b">
        <CardTitle id="otrs-diagnostics-title">Диагностика</CardTitle>
        <CardDescription>
          Проверяет конфиг, GenericInterface endpoint, авторизацию, TicketGet и безопасный dry-run.
        </CardDescription>
      </CardHeader>

      <CardContent className="grid gap-4 pt-(--card-spacing)">
        <form action={formAction} className="grid gap-3 rounded-lg border p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <ActionFlowGuard
            onResult={(value) => {
              const result = value as OtrsDiagnosticsActionState;
              if (!result) return;
              if (result.ok) {
                sessionStorage.setItem(flashKey, JSON.stringify(result));
                actionFlowNavigation.reload();
                return;
              }
              setBridgedState(result);
            }}
          />
          <input type="hidden" name="integrationId" value={integrationId} />
          <Field>
            <FieldLabel htmlFor="otrs-manualTicketId">Manual TicketID для TicketGet</FieldLabel>
            <Input id="otrs-manualTicketId" name="manualTicketId" placeholder="42" />
          </Field>
          <SubmitButton />
        </form>

        {state ? (
          <Alert variant={state.ok ? "default" : "destructive"}>
            <AlertDescription>
              {state.message}
              {state.status ? ` Статус: ${state.status}.` : ""}
            </AlertDescription>
          </Alert>
        ) : null}

        {latestDiagnostic ? (
          <div className="grid gap-3">
            <div className="grid gap-3 md:grid-cols-3">
              <Card size="sm">
                <CardContent className="grid gap-1">
                  <p className="text-xs font-medium text-muted-foreground">Статус</p>
                  <Badge
                    variant={["succeeded", "ok"].includes(latestDiagnostic.status) ? "secondary" : "outline"}
                    className={cn("font-normal", statusBadgeClass(latestDiagnostic.status))}
                  >
                    {latestDiagnostic.status}
                  </Badge>
                </CardContent>
              </Card>
              <Card size="sm">
                <CardContent className="grid gap-1">
                  <p className="text-xs font-medium text-muted-foreground">Запуск</p>
                  <p className="text-sm text-muted-foreground">{formatDate(latestDiagnostic.startedAt)}</p>
                </CardContent>
              </Card>
              <Card size="sm">
                <CardContent className="grid gap-1">
                  <p className="text-xs font-medium text-muted-foreground">Endpoint</p>
                  <p className="break-all text-sm text-muted-foreground">
                    {latestDiagnostic.redactedEndpoint ?? "Нет данных"}
                  </p>
                </CardContent>
              </Card>
            </div>

            <Table className="min-w-[720px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Шаг</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Длительность</TableHead>
                  <TableHead>Подсказка</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {latestDiagnostic.steps.map((step) => (
                  <TableRow key={step.id}>
                    <TableCell className="font-mono text-xs">{step.key}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-2">
                        {statusIcon(step.status)}
                        <Badge
                          variant={["succeeded", "ok"].includes(step.status) ? "secondary" : "outline"}
                          className={cn("font-normal", statusBadgeClass(step.status))}
                        >
                          {step.status}
                        </Badge>
                      </span>
                    </TableCell>
                    <TableCell>{step.durationMs} ms</TableCell>
                    <TableCell className="max-w-[280px] whitespace-normal">
                      {step.remediationHint ?? "Нет подсказки."}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {latestDiagnostic.errorMessage ? (
              <Alert variant="destructive">
                <AlertDescription>
                  {latestDiagnostic.errorCode ? `${latestDiagnostic.errorCode}: ` : ""}
                  {latestDiagnostic.errorMessage}
                </AlertDescription>
              </Alert>
            ) : null}
          </div>
        ) : (
          <Alert>
            <AlertDescription>
              Диагностика еще не запускалась. Первый запуск создаст redacted endpoint и пошаговый отчет.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
