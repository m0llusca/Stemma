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
      <div className="command-center">
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

      <section className="admin-group-grid admin-group-grid--wide" aria-label="Сводка форм оценки">
        <div className="admin-group">
          <div className="admin-group__header admin-group__header--compact">
            <h2 className="text-base font-semibold text-[#111827]">Активная форма</h2>
            <p className="text-sm leading-5 text-[#64748b]">По ней сейчас оцениваются новые проверки.</p>
          </div>
          <div className="admin-tile admin-tile--compact">
            <span className="admin-tile__icon admin-tile__icon--plain">V</span>
            <span className="admin-tile__body">
              <span className="record-title record-title--tight">
                {activeScorecard ? `${activeScorecard.name} v${activeScorecard.version}` : "Нет активной формы"}
              </span>
              <span className="record-meta">
                {activeScorecard ? `${activeScorecard.criteria.length} критериев` : "Создайте первую версию формы оценки"}
              </span>
            </span>
          </div>
        </div>
        <div className="admin-group">
          <div className="admin-group__header admin-group__header--compact">
            <h2 className="text-base font-semibold text-[#111827]">История версий</h2>
            <p className="text-sm leading-5 text-[#64748b]">Старые проверки не пересчитываются при изменении методики.</p>
          </div>
          <div className="admin-tile admin-tile--compact">
            <span className="admin-tile__icon admin-tile__icon--plain">{scorecards.length}</span>
            <span className="admin-tile__body">
              <span className="record-title">Версий в системе</span>
              <span className="record-meta">Изменения выпускаются только новой версией формы.</span>
            </span>
          </div>
        </div>
      </section>

      {activeScorecard ? (
        <details id="new-version" className="disclosure-panel admin-group overflow-hidden" open={openNewVersion}>
          <summary className="disclosure-summary flex cursor-pointer list-none items-center justify-between gap-4 border-b border-[#d9e0ea] px-5 py-4">
            <div>
              <h2 className="text-base font-semibold">Новая версия формы оценки</h2>
              <p className="mt-1 text-sm text-[#64748b]">
                Создает новую активную форму и оставляет исторические проверки на прежних версиях.
              </p>
            </div>
            <span className="shrink-0 text-sm font-semibold text-[#1d3fae]">Открыть</span>
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

      <section className="admin-group">
        <div className="admin-group__header admin-group__header--compact">
          <h2 className="text-base font-semibold text-[#111827]">История форм</h2>
          <p className="text-sm leading-5 text-[#64748b]">Старые версии свернуты и не смешиваются с активной методикой.</p>
        </div>
        <div className="grid gap-2">
          {scorecards.map((scorecard) => (
            <details key={scorecard.id} className="compact-details disclosure-panel" open={scorecard.isActive}>
              <summary className="disclosure-summary version-summary cursor-pointer list-none">
                <span className="admin-tile__icon admin-tile__icon--plain">{scorecard.version}</span>
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="record-title">{scorecard.name}</span>
                    <span className={`pill ${scorecard.isActive ? "pill--ok" : "pill--neutral"}`}>
                      {scorecard.isActive ? "Активна" : "Неактивна"}
                    </span>
                  </span>
                  <span className="record-meta mt-1 block">
                    Версия {scorecard.version} · критериев: {scorecard.criteria.length}
                  </span>
                </span>
                <span
                  className="disclosure-chevron flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#1d3fae]"
                  aria-hidden="true"
                >
                  <ChevronDown className="h-4 w-4" />
                  </span>
                </summary>
              <div className="border-t border-[#d9e0ea] p-3">
                <div className="grid gap-2">
                  {scorecard.criteria.map((criterion) => (
                    <article key={criterion.id} className="soft-callout">
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
