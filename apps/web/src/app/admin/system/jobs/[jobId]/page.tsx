import type { BackendJobStatus } from "@prisma/client";
import { ArrowLeft, Ban, Play } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { cancelQueuedBackendJob, runQueuedBackendJobs } from "@/lib/system-actions";

export const dynamic = "force-dynamic";

type JobDetailsPageProps = {
  params: Promise<{ jobId: string }>;
};

function formatDate(value: Date | null | undefined) {
  return value ? value.toLocaleString("ru-RU") : "Нет данных";
}

function parseJson(value: string) {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value || "{}";
  }
}

function jobStatusLabel(status: BackendJobStatus) {
  const labels: Record<BackendJobStatus, string> = {
    QUEUED: "В очереди",
    RUNNING: "Выполняется",
    SUCCEEDED: "Готово",
    FAILED: "Ошибка",
    CANCELLED: "Отменено"
  };

  return labels[status];
}

function jobTypeLabel(type: string) {
  const labels: Record<string, string> = {
    DIRECTORY_SYNC: "Синхронизация каталога",
    INTEGRATION_IMPORT: "Импорт обращений",
    REPORT_EXPORT: "Экспорт отчета",
    RETENTION_CLEANUP: "Очистка данных"
  };

  return labels[type] ?? type;
}

function statusTone(status: BackendJobStatus) {
  if (status === "SUCCEEDED") return "pill--ok";
  if (status === "FAILED") return "pill--warn";
  if (status === "RUNNING" || status === "QUEUED") return "pill--neutral";
  return "pill--neutral";
}

export default async function JobDetailsPage({ params }: JobDetailsPageProps) {
  const user = await requireCurrentUserPermission("backend_jobs:manage");
  const { jobId } = await params;
  const job = await prisma.backendJob.findFirst({
    where: {
      id: jobId,
      workspaceId: user.workspaceId
    },
    include: {
      createdBy: {
        select: {
          name: true,
          email: true
        }
      },
      events: {
        orderBy: [{ createdAt: "asc" }]
      }
    }
  });

  if (!job) {
    notFound();
  }

  return (
    <section className="page-shell admin-shell">
      <div className="command-center command-center--split">
        <div className="min-w-0">
          <p className="page-kicker">Фоновые задачи</p>
          <h1 className="page-title">{jobTypeLabel(job.type)}</h1>
          <p className="page-subtitle">
            Очередь {job.queueName}, попытка {job.attempts}/{job.maxAttempts}, создано {formatDate(job.createdAt)}.
          </p>
        </div>
        <div className="admin-actions xl:justify-end">
          <Link href="/admin/system" className="action-button">
            <ArrowLeft size={16} aria-hidden="true" />
            К системе
          </Link>
          {job.status === "QUEUED" ? (
            <form action={cancelQueuedBackendJob}>
              <input type="hidden" name="jobId" value={job.id} />
              <button type="submit" className="action-button">
                <Ban size={16} aria-hidden="true" />
                Отменить
              </button>
            </form>
          ) : null}
          <form action={runQueuedBackendJobs}>
            <input type="hidden" name="limit" value="1" />
            <button type="submit" className="action-button action-button--primary">
              <Play size={16} aria-hidden="true" />
              Запустить очередь
            </button>
          </form>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <section className="panel overflow-hidden">
          <div className="border-b border-[#d9e0ea] px-5 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`pill ${statusTone(job.status)}`}>{jobStatusLabel(job.status)}</span>
              <h2 className="text-lg font-semibold">Сводка</h2>
            </div>
          </div>
          <div className="record-list px-5">
            <article className="record-card">
              <p className="soft-callout__label">ID задачи</p>
              <p className="record-title compact-text font-mono">{job.id}</p>
            </article>
            <article className="record-card">
              <p className="record-meta">Создал: {job.createdBy?.name ?? "Автоматика"}</p>
              <p className="record-meta">Запланирована: {formatDate(job.runAfter)}</p>
              <p className="record-meta">Старт: {formatDate(job.startedAt)}</p>
              <p className="record-meta">Финиш: {formatDate(job.finishedAt)}</p>
            </article>
            {job.errorMessage ? (
              <article className="record-card border-[#fecaca] bg-[#fef2f2]">
                <p className="font-semibold text-[#b91c1c]">Ошибка</p>
                <p className="mt-1 text-sm leading-5 text-[#b91c1c]">{job.errorMessage}</p>
              </article>
            ) : null}
          </div>
        </section>

        <section className="panel overflow-hidden">
          <div className="border-b border-[#d9e0ea] px-5 py-4">
            <h2 className="text-lg font-semibold">События</h2>
            <p className="mt-1 text-sm text-[#64748b]">История запуска, ошибок и результатов backend runner.</p>
          </div>
          <div className="record-list px-5">
            {job.events.length === 0 ? (
              <div className="soft-callout text-sm text-[#64748b]">Событий пока нет.</div>
            ) : (
              job.events.map((event) => (
                <article key={event.id} className="record-card">
                  <div className="record-row">
                    <p className="font-semibold text-[#111827]">{event.message}</p>
                    <span className="pill pill--neutral">{event.level}</span>
                  </div>
                  <p className="record-meta">{formatDate(event.createdAt)}</p>
                  <details className="compact-details mt-2">
                    <summary className="cursor-pointer list-none px-3 py-2 text-sm font-semibold text-[#334155]">Метаданные</summary>
                    <pre className="max-h-[220px] overflow-auto border-t border-[#d9e0ea] bg-[#111827] p-3 text-xs leading-5 text-white">
                      {parseJson(event.metadata)}
                    </pre>
                  </details>
                </article>
              ))
            )}
          </div>
        </section>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <details className="disclosure-panel panel overflow-hidden">
          <summary className="disclosure-summary cursor-pointer list-none border-b border-[#d9e0ea] px-5 py-4">
            <h2 className="text-lg font-semibold">Payload задачи</h2>
          </summary>
          <pre className="max-h-[420px] overflow-auto bg-[#111827] p-5 text-xs leading-5 text-white">
            {parseJson(job.payloadJson)}
          </pre>
        </details>
        <details className="disclosure-panel panel overflow-hidden">
          <summary className="disclosure-summary cursor-pointer list-none border-b border-[#d9e0ea] px-5 py-4">
            <h2 className="text-lg font-semibold">Результат</h2>
          </summary>
          <pre className="max-h-[420px] overflow-auto bg-[#111827] p-5 text-xs leading-5 text-white">
            {parseJson(job.resultJson)}
          </pre>
        </details>
      </div>
    </section>
  );
}
