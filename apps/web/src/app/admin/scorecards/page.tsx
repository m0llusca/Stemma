import { ChevronDown, Plus } from "lucide-react";
import Link from "next/link";
import { CoachCallout } from "@/components/guidance/coach-callout";
import { ScorecardVersionForm } from "@/components/scorecards/scorecard-version-form";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { getSettingCoachmark } from "@/lib/admin-setup-guidance";
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

function activeScorecardEditHref(editing: boolean) {
  return editing ? "/admin/scorecards?section=overview" : "/admin/scorecards?section=overview&edit=1";
}

export default async function AdminScorecardsPage({ searchParams }: AdminScorecardsPageProps) {
  const params = await searchParams;
  const activeSection = scorecardSectionParam(params.section, params.new);
  const isEditingActiveScorecard = activeSection === "overview" && firstParam(params.edit) === "1";
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
  const scorecardSetupHint = activeScorecard ? null : getSettingCoachmark("scorecards");

  return (
    <section className="page-shell admin-shell">
      <div className="command-center">
        <div className="min-w-0">
          <p className="page-kicker">Администрирование</p>
          <h1 className="page-title">Формы оценки</h1>
          <p className="page-subtitle">
            Активную форму можно править точечно, а новую версию выпускать, когда нужно сохранить историческую методику без пересчета.
          </p>
          <div className="admin-actions mt-5">
            <Link href={scorecardSectionHref("create")} className="action-button">
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
            {activeScorecard ? (
              <div className="admin-actions">
                <Link
                  href={activeScorecardEditHref(isEditingActiveScorecard)}
                  className={isEditingActiveScorecard ? "action-button" : "action-button action-button--primary"}
                >
                  {isEditingActiveScorecard ? "Отмена" : "Редактировать текущую"}
                </Link>
              </div>
            ) : null}
          </div>
          {isEditingActiveScorecard && activeScorecard ? (
            <ScorecardVersionForm
              mode="edit"
              scorecardId={activeScorecard.id}
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
            <div className={scorecardSetupHint ? "setup-guide-layout p-4" : "p-4"}>
              <div className={scorecardSetupHint ? "setup-guide-layout__main" : ""}>
                <div className="grid gap-2 md:grid-cols-2" aria-label="Сводка форм оценки">
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
                      <span className="record-meta">Точечная правка меняет активную форму, новая версия сохраняет историю методики.</span>
                    </span>
                  </div>
                </div>
                {activeScorecard ? (
                  <div className="admin-data-table admin-data-table--compact mt-3" aria-label="Критерии активной формы">
                    <div className="admin-data-table__head">
                      <span>Критерий</span>
                      <span>Блок</span>
                      <span>Тип</span>
                      <span>Вес</span>
                    </div>
                    {activeScorecard.criteria.slice(0, 6).map((criterion) => (
                      <div key={criterion.id} className="admin-data-table__row">
                        <strong>{criterion.label}</strong>
                        <span>{criterion.block}</span>
                        <span>{criterionKindLabels[criterion.kind]}</span>
                        <span>{criterion.weight}%</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
              {scorecardSetupHint ? (
                <CoachCallout
                  title={scorecardSetupHint.title}
                  body={scorecardSetupHint.body}
                  href={scorecardSetupHint.href}
                  actionLabel={scorecardSetupHint.actionLabel}
                  variant="spotlight"
                  placement="left"
                  anchorLabel="Подсказка к форме оценки"
                  stepIndex={1}
                  dismissId="settings:scorecards"
                />
              ) : null}
            </div>
          )}
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
            <div className="p-4">
              <div className="setup-stepper" aria-label="Шаги выпуска формы оценки">
                <span className="setup-step setup-step--done">1. Критерии</span>
                <span className="setup-step setup-step--active">2. Веса и шкалы</span>
                <span className="setup-step">3. Выпуск версии</span>
              </div>
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
            </div>
          ) : (
            <div className="soft-callout ops-empty m-4 text-sm leading-5 text-[var(--text-muted)]">
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
                <div className="border-t border-[var(--border)] p-3">
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
