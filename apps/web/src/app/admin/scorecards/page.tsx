import { ChevronDown, Plus } from "lucide-react";
import Link from "next/link";
import { ScorecardVersionForm } from "@/components/scorecards/scorecard-version-form";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { criterionKindLabels } from "@/lib/labels";

export const dynamic = "force-dynamic";

type AdminScorecardsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type ScorecardSection = "overview" | "create" | "history";

const scorecardSections: Array<{ value: ScorecardSection; label: string }> = [
  { value: "overview", label: "Активная форма" },
  { value: "create", label: "Новая версия" },
  { value: "history", label: "История" }
];

function firstParam(value: string | string[] | undefined) {
  const firstValue = Array.isArray(value) ? value[0] : value;
  return firstValue?.trim() || undefined;
}

function scorecardSectionParam(
  value: string | string[] | undefined,
  newValue: string | string[] | undefined
): ScorecardSection {
  if (firstParam(newValue) === "1") {
    return "create";
  }

  const section = firstParam(value);

  return scorecardSections.some((item) => item.value === section) ? (section as ScorecardSection) : "overview";
}

function scorecardSectionHref(section: ScorecardSection) {
  return `/admin/scorecards?section=${section}`;
}

export default async function AdminScorecardsPage({ searchParams }: AdminScorecardsPageProps) {
  const params = await searchParams;
  const activeSection = scorecardSectionParam(params.section, params.new);
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

  return (
    <section className="page-shell admin-shell">
      <div className="command-center">
        <div className="min-w-0">
          <p className="page-kicker">Администрирование</p>
          <h1 className="page-title">Формы оценки</h1>
          <p className="page-subtitle">
            Активная форма видна сразу. Редактирование новой версии открывается только тогда, когда нужно изменить методику.
          </p>
          <div className="admin-actions mt-5">
            <Link href={scorecardSectionHref("create")} className="action-button action-button--primary">
              <Plus size={16} aria-hidden="true" />
              Новая версия
            </Link>
            <Link href="/reviews" className="action-button">
              Очередь проверок
            </Link>
          </div>
        </div>
      </div>

      <nav className="ops-tabs ops-tabs--section" aria-label="Разделы форм оценки">
        {scorecardSections.map((section) => (
          <Link
            key={section.value}
            href={scorecardSectionHref(section.value)}
            className={`ops-tab ${activeSection === section.value ? "ops-tab--active" : ""}`}
            aria-current={activeSection === section.value ? "page" : undefined}
          >
            {section.label}
          </Link>
        ))}
      </nav>

      {activeSection === "overview" ? (
        <section className="ops-panel" aria-labelledby="scorecard-overview-title">
          <div className="ops-panel__header">
            <div>
              <p className="ops-panel__eyebrow">Активная форма</p>
              <div className="flex min-w-0 items-center gap-2">
                <h2 id="scorecard-overview-title" className="ops-panel__title">Текущая методика оценки</h2>
                <HelpTooltip
                  label="Чем вес отличается от итоговых баллов?"
                  content="Вес критерия влияет на расчет. Итоговая оценка отображается как нормализованные баллы от 0 до 100."
                  placement="top-start"
                />
              </div>
              <p className="ops-panel__subtitle">По этой версии создаются новые проверки.</p>
            </div>
          </div>
          <div className="grid gap-2 p-4 md:grid-cols-2" aria-label="Сводка форм оценки">
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
            <div className="admin-tile admin-tile--compact">
              <span className="admin-tile__icon admin-tile__icon--plain">{scorecards.length}</span>
              <span className="admin-tile__body">
                <span className="record-title">Версий в системе</span>
                <span className="record-meta">Изменения выпускаются новой версией и не пересчитывают прошлые проверки.</span>
              </span>
            </div>
          </div>
        </section>
      ) : null}

      {activeSection === "create" ? (
        <section className="ops-panel" aria-labelledby="scorecard-create-title">
          <div className="ops-panel__header">
            <div>
              <p className="ops-panel__eyebrow">Новая версия</p>
              <h2 id="scorecard-create-title" className="ops-panel__title">Выпуск формы оценки</h2>
              <p className="ops-panel__subtitle">
                Новая версия становится активной, а исторические проверки остаются на прежней методике.
              </p>
            </div>
          </div>
          {activeScorecard ? (
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
          ) : (
            <div className="soft-callout ops-empty m-4 text-sm leading-5 text-[#64748b]">
              Новую версию можно выпустить после появления активной формы. Создайте первую форму через начальную настройку проекта.
            </div>
          )}
        </section>
      ) : null}

      {activeSection === "history" ? (
        <section className="ops-panel" aria-labelledby="scorecard-history-title">
          <div className="ops-panel__header">
            <div>
              <p className="ops-panel__eyebrow">История</p>
              <h2 id="scorecard-history-title" className="ops-panel__title">История форм</h2>
              <p className="ops-panel__subtitle">Старые версии свернуты и не смешиваются с активной методикой.</p>
            </div>
          </div>
          <div className="grid gap-2 p-4">
            {scorecards.map((scorecard) => (
              <details key={scorecard.id} className="compact-details" open={scorecard.isActive}>
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
      ) : null}
    </section>
  );
}
