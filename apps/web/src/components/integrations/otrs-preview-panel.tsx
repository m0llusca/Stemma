"use client";

import { Play, Search, UploadCloud } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  createOtrsPreviewActionState,
  queueSelectedOtrsImportActionState,
  type IntegrationImportActionState,
  type OtrsPreviewActionState
} from "@/lib/integration-actions";
import { formatArticleCount, integrationRunItemStatusLabel } from "@/lib/integrations/labels";
import { integrationRunStatusView } from "@/lib/operational-status";
import { cn } from "@/lib/utils";

const initialPreviewState: OtrsPreviewActionState = null;
const initialImportState: IntegrationImportActionState = null;

type PreviewItem = {
  id: string;
  externalId: string;
  ticketNumber: string | null;
  status: string;
  articleCount: number;
  privateArticleCount: number;
  attachmentCount: number;
  conversationId: string | null;
};

type PreviewRun = {
  id: string;
  status: string;
  requestedLimit: number;
  importedCount: number;
  errorCount: number;
  startedAt: string;
  items: PreviewItem[];
} | null;

type OtrsPreviewPanelProps = {
  integrationId: string;
  latestPreviewRun: PreviewRun;
};

function ManualPreviewButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      <Play data-icon="inline-start" aria-hidden="true" />
      {pending ? "Создаем предпросмотр" : "Предпросмотр TicketID"}
    </Button>
  );
}

function SearchPreviewButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="outline" disabled={pending}>
      <Search data-icon="inline-start" aria-hidden="true" />
      {pending ? "Ищем" : "Предпросмотр TicketSearch"}
    </Button>
  );
}

function ImportSelectedButton({ disabled = false }: { disabled?: boolean }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending || disabled}>
      <UploadCloud data-icon="inline-start" aria-hidden="true" />
      {pending ? "Ставим в очередь" : "Импортировать выбранные"}
    </Button>
  );
}

function formatDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString("ru-RU") : "Нет данных";
}

export function OtrsPreviewPanel({ integrationId, latestPreviewRun }: OtrsPreviewPanelProps) {
  const flashKey = `otrs-preview-result:${integrationId}`;
  const [actionPreviewState, previewAction] = useActionState(createOtrsPreviewActionState, initialPreviewState);
  const [actionImportState, importAction] = useActionState(queueSelectedOtrsImportActionState, initialImportState);
  // Bridged results feed the alerts when the client router drops the action
  // commit; a successful preview reloads the page so the new run's items
  // render from the server, with the flash keeping the message across it.
  const [bridgedPreviewState, setBridgedPreviewState] = useState<OtrsPreviewActionState>(null);
  const [bridgedImportState, setBridgedImportState] = useState<IntegrationImportActionState>(null);
  const previewState = bridgedPreviewState ?? actionPreviewState;
  const importState = bridgedImportState ?? actionImportState;
  const previewedItems = latestPreviewRun?.items.filter((item) => item.status === "previewed") ?? [];

  useEffect(() => {
    const raw = sessionStorage.getItem(flashKey);
    if (raw) {
      sessionStorage.removeItem(flashKey);
      try {
        setBridgedPreviewState(JSON.parse(raw) as OtrsPreviewActionState);
      } catch {
        // A malformed flash entry is simply dropped.
      }
    }
  }, [flashKey]);

  const handlePreviewResult = (value: unknown) => {
    const result = value as OtrsPreviewActionState;
    if (!result) return;
    if (result.ok) {
      sessionStorage.setItem(flashKey, JSON.stringify(result));
      actionFlowNavigation.reload();
      return;
    }
    setBridgedPreviewState(result);
  };

  return (
    <Card
      className="overflow-clip"
      role="region"
      aria-labelledby="otrs-preview-title"
    >
      <CardHeader className="border-b">
        <CardTitle id="otrs-preview-title">Предпросмотр / импорт</CardTitle>
        <CardDescription>
          Создайте предпросмотр по ручным TicketID или TicketSearch, затем поставьте выбранные обращения в backend-очередь.
        </CardDescription>
      </CardHeader>

      <CardContent className="grid gap-4 pt-(--card-spacing)">
        <div className="grid gap-4 xl:grid-cols-2">
          <form action={previewAction} className="grid gap-3 rounded-lg border p-3">
            <ActionFlowGuard onResult={handlePreviewResult} />
            <input type="hidden" name="integrationId" value={integrationId} />
            <input type="hidden" name="mode" value="manual_ticket_ids" />
            <Field>
              <FieldLabel htmlFor="otrs-manualTicketIds">TicketID вручную</FieldLabel>
              <Textarea
                id="otrs-manualTicketIds"
                name="manualTicketIds"
                rows={4}
                placeholder="42, 43, 44"
                className="min-h-[94px] resize-y"
              />
            </Field>
            <ManualPreviewButton />
          </form>

          <form action={previewAction} className="grid gap-3 rounded-lg border p-3">
            <ActionFlowGuard onResult={handlePreviewResult} />
            <input type="hidden" name="integrationId" value={integrationId} />
            <input type="hidden" name="mode" value="ticket_search" />
            <Field>
              <FieldLabel htmlFor="otrs-filtersJson">Фильтры TicketSearch (JSON)</FieldLabel>
              <Textarea
                id="otrs-filtersJson"
                name="filtersJson"
                rows={4}
                defaultValue={JSON.stringify({ Queues: ["Support::Refunds"], StateType: "Open" }, null, 2)}
                className="min-h-[94px] resize-y font-mono text-xs"
                spellCheck={false}
              />
            </Field>
            <SearchPreviewButton />
          </form>
        </div>

        {previewState ? (
          <Alert variant={previewState.ok ? "default" : "destructive"}>
            <AlertDescription>
              {previewState.message}
              {previewState.ok && typeof previewState.itemCount === "number" ? ` Строк: ${previewState.itemCount}.` : ""}
            </AlertDescription>
          </Alert>
        ) : null}

        {latestPreviewRun ? (
          <form action={importAction} className="grid gap-3">
            <ActionFlowGuard
              onResult={(value) => {
                const result = value as IntegrationImportActionState;
                if (result) setBridgedImportState(result);
              }}
            />
            <input type="hidden" name="integrationId" value={integrationId} />
            <input type="hidden" name="integrationRunId" value={latestPreviewRun.id} />
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">Последний запуск предпросмотра</p>
                <p className="text-sm text-muted-foreground">
                  {integrationRunStatusView(latestPreviewRun.status).label} · {formatDate(latestPreviewRun.startedAt)} · лимит {latestPreviewRun.requestedLimit}
                </p>
              </div>
              <ImportSelectedButton disabled={previewedItems.length === 0} />
            </div>

            <Table className="min-w-[820px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Выбор</TableHead>
                  <TableHead>Внешний ID</TableHead>
                  <TableHead>Номер тикета</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Статьи</TableHead>
                  <TableHead>Вложения</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {latestPreviewRun.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <Checkbox
                        name="integrationRunItemIds"
                        value={item.id}
                        defaultChecked={item.status === "previewed"}
                        disabled={item.status !== "previewed"}
                        aria-label={`Выбрать ${item.externalId}`}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-xs">{item.externalId}</TableCell>
                    <TableCell className="font-mono text-xs">{item.ticketNumber ?? "Нет"}</TableCell>
                    <TableCell>
                      <Badge
                        variant={item.status === "previewed" ? "secondary" : "outline"}
                        className={cn(
                          "font-normal",
                          item.status === "previewed" &&
                            "border-transparent bg-emerald-500/15 text-emerald-800 dark:text-emerald-300"
                        )}
                      >
                        {integrationRunItemStatusLabel(item.status)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {formatArticleCount(item.articleCount)} · приватных {item.privateArticleCount}
                    </TableCell>
                    <TableCell>{item.attachmentCount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {previewedItems.length === 0 ? (
              <Alert>
                <AlertDescription>
                  В последнем запуске предпросмотра нет строк, доступных для выборочного импорта.
                </AlertDescription>
              </Alert>
            ) : null}

            {importState ? (
              <Alert variant={importState.ok ? "default" : "destructive"}>
                <AlertDescription>
                  {importState.message}
                  {importState.jobId ? ` Job: ${importState.jobId.slice(0, 8)}.` : ""}
                </AlertDescription>
              </Alert>
            ) : null}
          </form>
        ) : (
          <Alert>
            <AlertDescription>Запуск предпросмотра еще не создан. Сначала проверьте один или несколько TicketID.</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
