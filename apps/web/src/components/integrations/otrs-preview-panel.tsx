"use client";

import { Play, Search, UploadCloud } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  createOtrsPreviewActionState,
  queueSelectedOtrsImportActionState,
  type IntegrationImportActionState,
  type OtrsPreviewActionState
} from "@/lib/integration-actions";

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
    <button type="submit" className="action-button action-button--primary" disabled={pending}>
      <Play size={16} aria-hidden="true" />
      {pending ? "Создаем preview" : "Preview TicketID"}
    </button>
  );
}

function SearchPreviewButton() {
  const { pending } = useFormStatus();

  return (
    <button type="submit" className="action-button" disabled={pending}>
      <Search size={16} aria-hidden="true" />
      {pending ? "Ищем" : "TicketSearch preview"}
    </button>
  );
}

function ImportSelectedButton({ disabled = false }: { disabled?: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" className="action-button action-button--primary" disabled={pending || disabled}>
      <UploadCloud size={16} aria-hidden="true" />
      {pending ? "Ставим в очередь" : "Импортировать выбранные"}
    </button>
  );
}

function formatDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString("ru-RU") : "Нет данных";
}

export function OtrsPreviewPanel({ integrationId, latestPreviewRun }: OtrsPreviewPanelProps) {
  const [previewState, previewAction] = useActionState(createOtrsPreviewActionState, initialPreviewState);
  const [importState, importAction] = useActionState(queueSelectedOtrsImportActionState, initialImportState);
  const previewedItems = latestPreviewRun?.items.filter((item) => item.status === "previewed") ?? [];

  return (
    <section className="panel overflow-hidden">
      <div className="border-b border-[var(--border)] px-5 py-4">
        <h2 className="text-lg font-semibold">Preview / импорт</h2>
        <p className="mt-1 text-sm leading-5 text-[var(--text-muted)]">
          Создайте preview по ручным TicketID или TicketSearch, затем поставьте выбранные обращения в backend-очередь.
        </p>
      </div>

      <div className="grid gap-4 p-4">
        <div className="grid gap-4 xl:grid-cols-2">
          <form action={previewAction} className="soft-callout grid gap-3">
            <input type="hidden" name="integrationId" value={integrationId} />
            <input type="hidden" name="mode" value="manual_ticket_ids" />
            <label className="grid gap-1.5 text-sm font-medium text-[var(--text-body)]">
              Manual TicketID
              <textarea
                name="manualTicketIds"
                rows={4}
                placeholder="42, 43, 44"
                className="form-control min-h-[94px] resize-y text-sm"
              />
            </label>
            <ManualPreviewButton />
          </form>

          <form action={previewAction} className="soft-callout grid gap-3">
            <input type="hidden" name="integrationId" value={integrationId} />
            <input type="hidden" name="mode" value="ticket_search" />
            <label className="grid gap-1.5 text-sm font-medium text-[var(--text-body)]">
              TicketSearch filters JSON
              <textarea
                name="filtersJson"
                rows={4}
                defaultValue={JSON.stringify({ Queues: ["Support::Refunds"], StateType: "Open" }, null, 2)}
                className="form-control min-h-[94px] resize-y font-mono text-xs"
                spellCheck={false}
              />
            </label>
            <SearchPreviewButton />
          </form>
        </div>

        {previewState ? (
          <div className={`soft-callout text-sm font-medium ${previewState.ok ? "text-[#166534]" : "text-[var(--danger)]"}`}>
            {previewState.message}
            {previewState.ok && typeof previewState.itemCount === "number" ? ` Строк: ${previewState.itemCount}.` : ""}
          </div>
        ) : null}

        {latestPreviewRun ? (
          <form action={importAction} className="grid gap-3">
            <input type="hidden" name="integrationId" value={integrationId} />
            <input type="hidden" name="integrationRunId" value={latestPreviewRun.id} />
            <div className="record-row">
              <div className="min-w-0">
                <p className="record-title record-title--tight">Последний preview-run</p>
                <p className="record-meta">
                  {latestPreviewRun.status} · {formatDate(latestPreviewRun.startedAt)} · limit {latestPreviewRun.requestedLimit}
                </p>
              </div>
              <ImportSelectedButton disabled={previewedItems.length === 0} />
            </div>

            <div className="scroll-area">
              <table className="table-fixed-copy w-full min-w-[820px] border-collapse text-left text-sm">
                <thead className="bg-[#edf2ff] text-xs uppercase text-[var(--text-subtle)]">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Выбор</th>
                    <th className="px-4 py-3 font-semibold">External ID</th>
                    <th className="px-4 py-3 font-semibold">Ticket number</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Articles</th>
                    <th className="px-4 py-3 font-semibold">Attachments</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#d9e0ea]">
                  {latestPreviewRun.items.map((item) => (
                    <tr key={item.id}>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          name="integrationRunItemIds"
                          value={item.id}
                          defaultChecked={item.status === "previewed"}
                          disabled={item.status !== "previewed"}
                          aria-label={`Выбрать ${item.externalId}`}
                        />
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{item.externalId}</td>
                      <td className="px-4 py-3 font-mono text-xs">{item.ticketNumber ?? "Нет"}</td>
                      <td className="px-4 py-3">
                        <span className={`pill ${item.status === "previewed" ? "pill--ok" : "pill--neutral"}`}>{item.status}</span>
                      </td>
                      <td className="px-4 py-3 text-[var(--text-body)]">
                        {item.articleCount} · private {item.privateArticleCount}
                      </td>
                      <td className="px-4 py-3 text-[var(--text-body)]">{item.attachmentCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {previewedItems.length === 0 ? (
              <div className="soft-callout text-sm leading-5 text-[var(--text-muted)]">
                В последнем preview-run нет строк со статусом previewed для выборочного импорта.
              </div>
            ) : null}

            {importState ? (
              <div className={`soft-callout text-sm font-medium ${importState.ok ? "text-[#166534]" : "text-[var(--danger)]"}`}>
                {importState.message}
                {importState.jobId ? ` Job: ${importState.jobId.slice(0, 8)}.` : ""}
              </div>
            ) : null}
          </form>
        ) : (
          <div className="soft-callout text-sm leading-5 text-[var(--text-muted)]">
            Preview-run еще не создан. Сначала проверьте один или несколько TicketID.
          </div>
        )}
      </div>
    </section>
  );
}
