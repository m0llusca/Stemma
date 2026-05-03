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
        <div className="grid gap-3 p-5 md:grid-cols-3">
          <div className="rounded-md border border-[#d7dce5] bg-[#fbfcfd] p-3">
            <p className="text-xs font-semibold uppercase text-[#667085]">Активная версия</p>
            <p className="mt-2 font-semibold text-[#17202a]">{activeScorecard ? `${activeScorecard.name} v${activeScorecard.version}` : "Нет"}</p>
          </div>
          <div className="rounded-md border border-[#d7dce5] bg-[#fbfcfd] p-3">
            <p className="text-xs font-semibold uppercase text-[#667085]">История</p>
            <p className="mt-2 font-semibold text-[#17202a]">{scorecards.length} версий</p>
          </div>
          <div className="rounded-md border border-[#d7dce5] bg-[#fbfcfd] p-3">
            <p className="text-xs font-semibold uppercase text-[#667085]">Правило изменения</p>
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

      <div className="grid gap-5">
        {scorecards.map((scorecard) => (
          <details key={scorecard.id} className="panel disclosure-panel overflow-hidden" open={scorecard.isActive}>
            <summary className="disclosure-summary flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold">{scorecard.name}</h2>
                <p className="mt-1 text-sm text-[#667085]">
                  Версия {scorecard.version} · критериев: {scorecard.criteria.length}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="rounded-md border border-[#d7dce5] px-2 py-1 text-xs font-semibold uppercase text-[#475467]">
                  {scorecard.isActive ? "Активна" : "Неактивна"}
                </span>
                <span
                  className="disclosure-chevron flex h-8 w-8 items-center justify-center rounded-md text-[#0b4f52]"
                  aria-hidden="true"
                >
                  <ChevronDown className="h-4 w-4" />
                </span>
              </div>
            </summary>
            <div className="border-t border-[#d7dce5]">
              <div className="record-list p-5">
                {scorecard.criteria.map((criterion) => (
                  <article key={criterion.id} className="record-card">
                    <div className="record-row">
                      <div className="min-w-0">
                        <h3 className="record-title">{criterion.label}</h3>
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
  );
}
