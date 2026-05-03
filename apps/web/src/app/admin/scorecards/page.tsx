import { ChevronDown, Plus } from "lucide-react";
import Link from "next/link";
import { ScorecardVersionForm } from "@/components/scorecards/scorecard-version-form";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { criterionKindLabels } from "@/lib/labels";

export const dynamic = "force-dynamic";

type AdminScorecardsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined) {
  const firstValue = Array.isArray(value) ? value[0] : value;
  return firstValue?.trim() || undefined;
}

export default async function AdminScorecardsPage({ searchParams }: AdminScorecardsPageProps) {
  const params = await searchParams;
  const user = await requireCurrentUserPermission("scorecards:manage");
  const activeScorecard = await prisma.scorecard.findFirst({
    where: {
      workspaceId: user.workspaceId,
      isActive: true
    },
    include: {
      criteria: {
        orderBy: {
          order: "asc"
        }
      }
    }
  });
  const scorecards = await prisma.scorecard.findMany({
    where: {
      workspaceId: user.workspaceId
    },
    include: {
      criteria: {
        orderBy: {
          order: "asc"
        }
      }
    },
    orderBy: [
      {
        isActive: "desc"
      },
      {
        updatedAt: "desc"
      }
    ]
  });
  const openNewVersion = firstParam(params.new) === "1";

  return (
    <section className="page-shell admin-shell">
      <div className="admin-hero">
        <div className="min-w-0">
          <p className="page-kicker">Администрирование</p>
          <h1 className="page-title">Формы оценки</h1>
          <p className="page-subtitle">
            Активная форма видна сразу. Редактирование новой версии открывается только тогда, когда нужно изменить методику.
          </p>
        </div>
        <div className="admin-actions">
          <Link href="/admin/scorecards?new=1#new-version" className="action-button action-button--primary">
            <Plus size={16} aria-hidden="true" />
            Новая версия
          </Link>
          <Link href="/reviews" className="action-button">
            Очередь проверок
          </Link>
        </div>
      </div>

      <section className="panel overflow-hidden">
        <div className="border-b border-[#d7dce5] px-5 py-4">
          <h2 className="text-lg font-semibold">Версионирование правил</h2>
          <p className="mt-1 text-sm text-[#667085]">
            Каждая завершенная проверка хранит версию формы оценки. Новая версия не переписывает старые результаты и позволяет сравнивать периоды без смешивания методик.
          </p>
        </div>
        <div className="metric-strip m-5">
          <div className="metric-strip__item">
            <p className="metric-strip__label">Активная версия</p>
            <p className="metric-strip__value text-base">{activeScorecard ? `${activeScorecard.name} v${activeScorecard.version}` : "Нет"}</p>
          </div>
          <div className="metric-strip__item">
            <p className="metric-strip__label">История</p>
            <p className="metric-strip__value">{scorecards.length}</p>
          </div>
          <div className="metric-strip__item">
            <p className="metric-strip__label">Правило изменения</p>
            <p className="mt-2 text-sm leading-5 text-[#344054]">Изменения выпускаются только новой версией формы.</p>
          </div>
        </div>
      </section>

      {activeScorecard ? (
        <details id="new-version" className="disclosure-panel panel overflow-hidden" open={openNewVersion}>
          <summary className="disclosure-summary flex cursor-pointer list-none items-center justify-between gap-4 border-b border-[#d7dce5] px-5 py-4">
            <div>
              <h2 className="text-lg font-semibold">Новая версия формы оценки</h2>
              <p className="mt-1 text-sm text-[#667085]">
                Создает новую активную форму и оставляет исторические проверки на прежних версиях.
              </p>
            </div>
            <span className="shrink-0 text-sm font-semibold text-[#0b4f52]">Открыть</span>
          </summary>
          <ScorecardVersionForm
            initialName={activeScorecard.name}
            initialCriteria={activeScorecard.criteria.map((criterion) => ({
              id: criterion.id,
              key: criterion.key,
              label: criterion.label,
              block: criterion.block,
              kind: criterion.kind,
              weight: criterion.weight,
              required: criterion.required
            }))}
          />
        </details>
      ) : null}

      <section className="panel overflow-hidden">
        <div className="border-b border-[#d7dce5] px-5 py-4">
          <h2 className="text-lg font-semibold">История форм</h2>
          <p className="mt-1 text-sm text-[#667085]">Старые версии свернуты и не смешиваются с активной методикой.</p>
        </div>
        <div className="record-list px-5">
          {scorecards.map((scorecard) => (
            <details key={scorecard.id} className="record-card disclosure-panel" open={scorecard.isActive}>
              <summary className="disclosure-summary flex cursor-pointer list-none items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="record-title">{scorecard.name}</h3>
                    <span className={`pill ${scorecard.isActive ? "pill--ok" : "pill--neutral"}`}>
                      {scorecard.isActive ? "Активна" : "Неактивна"}
                    </span>
                  </div>
                  <p className="record-meta mt-1">
                    Версия {scorecard.version} · критериев: {scorecard.criteria.length}
                  </p>
                </div>
                <span
                  className="disclosure-chevron flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#0b4f52]"
                  aria-hidden="true"
                >
                  <ChevronDown className="h-4 w-4" />
                </span>
              </summary>
              <div className="mt-3 border-t border-[#d7dce5] pt-1">
                <div className="record-list">
                  {scorecard.criteria.map((criterion) => (
                    <article key={criterion.id} className="record-card">
                      <div className="record-row">
                        <div className="min-w-0">
                          <h4 className="record-title">{criterion.label}</h4>
                          <p className="record-meta mt-1">
                            {criterion.block} · {criterionKindLabels[criterion.kind]} · ключ: {criterion.key}
                          </p>
                        </div>
                        <span className="pill pill--neutral">Вес {criterion.weight}%</span>
                      </div>
                      <p className="record-meta">
                        Порядок: {criterion.order} · обязательный критерий: {criterion.required ? "да" : "нет"}
                      </p>
                    </article>
                  ))}
                </div>
              </div>
            </details>
          ))}
        </div>
      </section>
    </section>
  );
}
