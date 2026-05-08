import Link from "next/link";
import { backendJobStatusView, integrationRunStatusView } from "@/lib/operational-status";

type BackendJobSummary = {
  id: string;
  status: string;
  createdAt: Date;
  runAfter: Date;
  attempts: number;
  maxAttempts: number;
};

type RunItem = {
  id: string;
  externalId: string;
  ticketNumber: string | null;
  status: string;
  articleCount: number;
  privateArticleCount: number;
  attachmentCount: number;
  conversationId: string | null;
  conversation: {
    id: string;
    subject: string;
  } | null;
};

type IntegrationRun = {
  id: string;
  status: string;
  mode: string;
  dryRun: boolean;
  requestedLimit: number;
  importedCount: number;
  errorCount: number;
  errorMessage: string | null;
  startedAt: Date;
  finishedAt: Date | null;
  items: RunItem[];
  actor: {
    name: string;
  } | null;
};

type OtrsRunHistoryProps = {
  runs: IntegrationRun[];
  jobsByRunId: Map<string, BackendJobSummary>;
};

function formatDate(value: Date | null | undefined) {
  return value ? value.toLocaleString("ru-RU") : "Нет данных";
}

export function OtrsRunHistory({ runs, jobsByRunId }: OtrsRunHistoryProps) {
  return (
    <section className="panel overflow-hidden">
      <div className="border-b border-[#d9e0ea] px-5 py-4">
        <h2 className="text-lg font-semibold">История запусков</h2>
        <p className="mt-1 text-sm leading-5 text-[#64748b]">Preview, выбранные импорты и связанные backend jobs.</p>
      </div>

      <div className="record-list px-5">
        {runs.length === 0 ? (
          <div className="soft-callout text-sm leading-5 text-[#64748b]">Запусков для этого источника пока нет.</div>
        ) : (
          runs.map((run) => {
            const runStatus = integrationRunStatusView(run.status);
            const job = jobsByRunId.get(run.id);
            const jobStatus = job ? backendJobStatusView(job.status) : null;

            return (
              <article key={run.id} className="record-card">
                <div className="record-row">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="record-title record-title--tight">{run.dryRun ? "Preview / dry-run" : "Импорт"}</span>
                      <span className={`pill ${runStatus.pillClass}`}>{runStatus.label}</span>
                    </div>
                    <p className="record-meta">
                      {run.mode} · {formatDate(run.startedAt)} · {run.actor?.name ?? "Автоматика"}
                    </p>
                  </div>
                  {job && jobStatus ? (
                    <Link href={`/admin/system/jobs/${job.id}`} className="quiet-link text-sm">
                      Job {job.id.slice(0, 8)} · {jobStatus.label}
                    </Link>
                  ) : null}
                </div>

                <div className="mt-3 grid gap-2 md:grid-cols-3">
                  <div className="soft-callout">
                    <p className="soft-callout__label">Объем</p>
                    <p className="record-meta">
                      {run.importedCount}/{run.requestedLimit} · ошибок {run.errorCount}
                    </p>
                  </div>
                  <div className="soft-callout">
                    <p className="soft-callout__label">Финиш</p>
                    <p className="record-meta">{formatDate(run.finishedAt)}</p>
                  </div>
                  <div className="soft-callout">
                    <p className="soft-callout__label">Items</p>
                    <p className="record-meta">{run.items.length} строк</p>
                  </div>
                </div>

                {run.errorMessage ? (
                  <div className="soft-callout soft-callout--warn mt-3 text-sm leading-5 text-[#b45309]">{run.errorMessage}</div>
                ) : null}

                {run.items.length > 0 ? (
                  <div className="scroll-area mt-3">
                    <table className="table-fixed-copy w-full min-w-[760px] border-collapse text-left text-sm">
                      <thead className="bg-[#edf2ff] text-xs uppercase text-[#475569]">
                        <tr>
                          <th className="px-3 py-2 font-semibold">External ID</th>
                          <th className="px-3 py-2 font-semibold">Ticket</th>
                          <th className="px-3 py-2 font-semibold">Status</th>
                          <th className="px-3 py-2 font-semibold">Articles</th>
                          <th className="px-3 py-2 font-semibold">Review queue</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#d9e0ea]">
                        {run.items.map((item) => (
                          <tr key={item.id}>
                            <td className="px-3 py-2 font-mono text-xs">{item.externalId}</td>
                            <td className="px-3 py-2 font-mono text-xs">{item.ticketNumber ?? "Нет"}</td>
                            <td className="px-3 py-2">
                              <span className={`pill ${item.status === "imported" ? "pill--ok" : "pill--neutral"}`}>
                                {item.status}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-[#334155]">
                              {item.articleCount} · private {item.privateArticleCount} · files {item.attachmentCount}
                            </td>
                            <td className="px-3 py-2">
                              {item.conversationId ? (
                                <Link href={`/reviews/${item.conversationId}`} className="quiet-link">
                                  {item.conversation?.subject ?? "Открыть /reviews"}
                                </Link>
                              ) : (
                                <span className="record-meta">Не импортировано</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
