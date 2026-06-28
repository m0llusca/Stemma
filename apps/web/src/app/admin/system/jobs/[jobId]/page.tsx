import { ArrowLeft, Ban, ListChecks, Play } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/loading-states";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { StatKpi } from "@/components/ui/stat-kpi";
import { StatusBadge } from "@/components/ui/status-badge";
import type { StatusTone } from "@/lib/ui/status-tone";
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

function jobStatusTone(tone: "ok" | "warn" | "error" | "neutral"): StatusTone {
  if (tone === "ok") return "positive";
  if (tone === "warn") return "warning";
  if (tone === "error") return "negative";
  return "neutral";
}

function jobKpiTone(tone: "ok" | "warn" | "error" | "neutral"): "neutral" | "success" | "warning" | "danger" {
  if (tone === "ok") return "success";
  if (tone === "warn") return "warning";
  if (tone === "error") return "danger";
  return "neutral";
}

function parseJson(value: string) {
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value || "{}";
  }
}

export default function JobDetailsPage({ params, searchParams }: JobDetailsPageProps) {
  return (
    <Suspense fallback={<PageSkeleton variant="admin" label="Загрузка задания" />}>
      <JobDetailsPageContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function JobDetailsPageContent({ params, searchParams }: JobDetailsPageProps) {
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
        <StatKpi
          label="Статус"
          value={jobStatus.label}
          tone={jobKpiTone(jobStatus.tone)}
          hint={`Попытка ${job.attempts}/${job.maxAttempts}`}
        />
        <StatKpi label="Очередь" value={queueNameLabel(job.queueName)} hint={`Запуск: ${formatDate(job.runAfter)}`} />
        <StatKpi label="События" value={job.events.length} hint="История runner" />
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
            <StatusBadge label="Статус" value={jobStatus.label} tone={jobStatusTone(jobStatus.tone)} />
          </div>
          <div className="record-list px-5">
            <article className="record-card">
              <p className="soft-callout__label">ID задачи</p>
              <p className="record-title compact-text font-mono">{job.id}</p>
            </article>
            <article className="record-card">
              <p className="record-meta">Создал: {job.createdBy?.name ?? "Автоматика"}</p>
              <p className="record-meta tabular-nums">Запланирована: {formatDate(job.runAfter)}</p>
              <p className="record-meta tabular-nums">Старт: {formatDate(job.startedAt)}</p>
              <p className="record-meta tabular-nums">Финиш: {formatDate(job.finishedAt)}</p>
            </article>
            {job.errorMessage ? (
              <article className="record-card border-[var(--status-danger-border)] bg-[var(--status-danger-bg)]">
                <p className="font-semibold text-[var(--danger)]">Ошибка</p>
                <p className="mt-1 text-sm leading-5 text-[var(--danger)]">{job.errorMessage}</p>
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
              <EmptyState
                size="inline"
                icon={<ListChecks size={20} aria-hidden="true" />}
                title="Событий пока нет"
                description="История runner появится после запуска задачи."
              />
            ) : (
              job.events.map((event) => (
                <article key={event.id} className="record-card">
                  <div className="record-row">
                    <p className="font-semibold text-[var(--foreground)]">{event.message}</p>
                    <Chip tone="neutral" size="xs">{event.level}</Chip>
                  </div>
                  <p className="record-meta tabular-nums">{formatDate(event.createdAt)}</p>
                  <details className="compact-details mt-2">
                    <summary className="cursor-pointer list-none px-3 py-2 text-sm font-semibold text-[var(--text-body)]">Метаданные</summary>
                    <pre className="code-surface code-surface--inline max-h-[220px] overflow-auto border-t border-[var(--border)] p-3 text-xs leading-5">
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
          <pre className="code-surface max-h-[520px] overflow-auto p-5 text-xs leading-5">
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
          <pre className="code-surface max-h-[520px] overflow-auto p-5 text-xs leading-5">
            {parseJson(job.resultJson)}
          </pre>
        </section>
      ) : null}
    </section>
  );
}
