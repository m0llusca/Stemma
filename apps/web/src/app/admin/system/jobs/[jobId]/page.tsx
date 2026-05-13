import { ArrowLeft, Ban, Play } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { backendJobStatusView, backendJobTypeLabel, queueNameLabel } from "@/lib/operational-status";
import { cancelQueuedBackendJob, runQueuedBackendJobs } from "@/lib/system-actions";

export const dynamic = "force-dynamic";

type JobDetailsPageProps = {
  params: Promise<{ jobId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type JobDetailsSection = "summary" | "events" | "payload" | "result";

const jobDetailsSections: Array<{ value: JobDetailsSection; label: string }> = [
  { value: "summary", label: "Сводка" },
  { value: "events", label: "События" },
  { value: "payload", label: "Payload" },
  { value: "result", label: "Результат" }
];

function firstParam(value: string | string[] | undefined) {
  const firstValue = Array.isArray(value) ? value[0] : value;
  return firstValue?.trim() || undefined;
}

function jobDetailsSectionParam(value: string | string[] | undefined): JobDetailsSection {
  const section = firstParam(value);

  return jobDetailsSections.some((item) => item.value === section) ? (section as JobDetailsSection) : "summary";
}

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

export default async function JobDetailsPage({ params, searchParams }: JobDetailsPageProps) {
  const search = await searchParams;
  const activeSection = jobDetailsSectionParam(search.section);
  const user = await requireCurrentUserPermission("backend_jobs:manage");
  const { jobId } = await params;
  const jobDetailsSectionHref = (section: JobDetailsSection) => `/admin/system/jobs/${jobId}?section=${section}`;
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

  const jobStatus = backendJobStatusView(job.status);

  return (
    <section className="page-shell admin-shell">
      <div className="command-center">
        <div className="min-w-0">
          <p className="page-kicker">Фоновые задачи</p>
          <h1 className="page-title">{backendJobTypeLabel(job.type)}</h1>
          <p className="page-subtitle">
            Очередь {queueNameLabel(job.queueName)}, попытка {job.attempts}/{job.maxAttempts}, создано {formatDate(job.createdAt)}.
          </p>
          <div className="admin-actions mt-5">
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
      </div>

      <section className="ops-metric-grid" aria-label="Сводка фоновой задачи">
        <div className="ops-metric">
          <span className="ops-metric__label">Статус</span>
          <strong className="ops-metric__value">{jobStatus.label}</strong>
          <span className="ops-metric__note">Попытка {job.attempts}/{job.maxAttempts}</span>
        </div>
        <div className="ops-metric">
          <span className="ops-metric__label">Очередь</span>
          <strong className="ops-metric__value">{queueNameLabel(job.queueName)}</strong>
          <span className="ops-metric__note">Запуск: {formatDate(job.runAfter)}</span>
        </div>
        <div className="ops-metric">
          <span className="ops-metric__label">События</span>
          <strong className="ops-metric__value">{job.events.length}</strong>
          <span className="ops-metric__note">История runner</span>
        </div>
      </section>

      <nav className="ops-tabs ops-tabs--section" aria-label="Разделы фоновой задачи">
        {jobDetailsSections.map((section) => (
          <Link
            key={section.value}
            href={jobDetailsSectionHref(section.value)}
            className={`ops-tab ${activeSection === section.value ? "ops-tab--active" : ""}`}
            aria-current={activeSection === section.value ? "page" : undefined}
          >
            {section.label}
          </Link>
        ))}
      </nav>

      {activeSection === "summary" ? (
        <section className="ops-panel" aria-labelledby="job-summary-title">
          <div className="ops-panel__header">
            <div>
              <p className="ops-panel__eyebrow">Задача</p>
              <h2 id="job-summary-title" className="ops-panel__title">Сводка</h2>
              <p className="ops-panel__subtitle">Ключевые параметры фоновой задачи без технического JSON.</p>
            </div>
            <span className={`pill ${jobStatus.pillClass}`}>{jobStatus.label}</span>
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
      ) : null}

      {activeSection === "events" ? (
        <section className="ops-panel" aria-labelledby="job-events-title">
          <div className="ops-panel__header">
            <div>
              <p className="ops-panel__eyebrow">Runner</p>
              <h2 id="job-events-title" className="ops-panel__title">События</h2>
              <p className="ops-panel__subtitle">История запуска, ошибок и результатов backend runner.</p>
            </div>
          </div>
          <div className="record-list px-5">
            {job.events.length === 0 ? (
              <div className="soft-callout ops-empty text-sm text-[#64748b]">Событий пока нет.</div>
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
      ) : null}

      {activeSection === "payload" ? (
        <section className="ops-panel" aria-labelledby="job-payload-title">
          <div className="ops-panel__header">
            <div>
              <p className="ops-panel__eyebrow">JSON</p>
              <h2 id="job-payload-title" className="ops-panel__title">Payload задачи</h2>
              <p className="ops-panel__subtitle">Техническое тело задачи для отладки обработчика.</p>
            </div>
          </div>
          <pre className="max-h-[520px] overflow-auto bg-[#111827] p-5 text-xs leading-5 text-white">
            {parseJson(job.payloadJson)}
          </pre>
        </section>
      ) : null}

      {activeSection === "result" ? (
        <section className="ops-panel" aria-labelledby="job-result-title">
          <div className="ops-panel__header">
            <div>
              <p className="ops-panel__eyebrow">JSON</p>
              <h2 id="job-result-title" className="ops-panel__title">Результат</h2>
              <p className="ops-panel__subtitle">Ответ обработчика после выполнения задачи.</p>
            </div>
          </div>
          <pre className="max-h-[520px] overflow-auto bg-[#111827] p-5 text-xs leading-5 text-white">
            {parseJson(job.resultJson)}
          </pre>
        </section>
      ) : null}
    </section>
  );
}
