import { ListChecks, Plus } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { CoachCallout } from "@/components/guidance/coach-callout";
import { PageSkeleton } from "@/components/loading-states";
import { SamplingRuleForm } from "@/components/admin/sampling-rule-form";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { PageShell } from "@/components/ui/page-shell";
import { AdminFrame } from "@/components/admin/admin-frame";
import { getSettingCoachmark } from "@/lib/admin-setup-guidance";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { channelLabels, csatBucketLabels } from "@/lib/labels";
import { createSamplingRule, updateSamplingRuleStatus } from "@/lib/quality-actions";

export const dynamic = "force-dynamic";

type SamplingRulesPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type SamplingSection = "rules" | "create";

const samplingSections: Array<{ value: SamplingSection; label: string }> = [
  { value: "rules", label: "Правила" },
  { value: "create", label: "Новое правило" }
];

function firstParam(value: string | string[] | undefined) {
  const firstValue = Array.isArray(value) ? value[0] : value;
  return firstValue?.trim() || undefined;
}

function samplingSectionParam(
  value: string | string[] | undefined,
  newValue: string | string[] | undefined
): SamplingSection {
  if (firstParam(newValue) === "1") {
    return "create";
  }

  const section = firstParam(value);

  return samplingSections.some((item) => item.value === section) ? (section as SamplingSection) : "rules";
}

function samplingSectionHref(section: SamplingSection) {
  return `/admin/sampling?section=${section}`;
}

function parseConditions(value: string) {
  try {
    return JSON.parse(value) as Record<string, string | string[] | undefined>;
  } catch {
    return {};
  }
}

const samplingRuleTypeLabels: Record<string, string> = {
  random: "Случайная",
  csat: "CSAT",
  new_hire: "Новички",
  lead_signal: "Сигнал руководителя",
  manual: "Ручная"
};

const conditionLabels: Record<string, string> = {
  channel: "Канал",
  csatBucket: "CSAT",
  supportLine: "Линия",
  tag: "Тег"
};

function conditionValue(key: string, value: string | string[]): string {
  if (Array.isArray(value)) {
    return value.map((item) => conditionValue(key, item)).join(", ");
  }

  if (key === "channel") {
    return value in channelLabels ? channelLabels[value as keyof typeof channelLabels] : value;
  }

  if (key === "csatBucket") {
    return value in csatBucketLabels ? csatBucketLabels[value as keyof typeof csatBucketLabels] : value;
  }

  return value;
}

function formatConditions(conditions: Record<string, string | string[] | undefined>) {
  const parts = Object.entries(conditions)
    .filter(([, value]) => Boolean(value))
    .map(([key, value]) => `${conditionLabels[key] ?? key}: ${conditionValue(key, value as string | string[])}`);

  return parts.join(" · ") || "Без условий";
}

export default function SamplingRulesPage({ searchParams }: SamplingRulesPageProps) {
  return (
    <Suspense fallback={<PageSkeleton variant="admin" label="Загрузка правил отбора" />}>
      <SamplingRulesPageContent searchParams={searchParams} />
    </Suspense>
  );
}

async function SamplingRulesPageContent({ searchParams }: SamplingRulesPageProps) {
  const params = await searchParams;
  const activeSection = samplingSectionParam(params.section, params.new);
  const user = await requireCurrentUserPermission("sampling:manage");
  const rules = await prisma.samplingRule.findMany({
    where: { workspaceId: user.workspaceId },
    orderBy: [{ isActive: "desc" }, { priority: "asc" }, { createdAt: "desc" }]
  });
  const activeRules = rules.filter((rule) => rule.isActive).length;
  const samplingSetupHint = activeRules > 0 ? null : getSettingCoachmark("sampling");

  return (
    <PageShell
      eyebrow="Администрирование"
      title="Правила выборки"
      description="Управляют тем, какие обращения попадают в ручную проверку: случайная выборка, негативный CSAT, новые сотрудники и ручные сигналы."
      actions={
        <>
          <Link href={samplingSectionHref("create")} className="action-button action-button--primary">
            <Plus size={16} aria-hidden="true" />
            Новое правило
          </Link>
          <Link href="/reviews" className="action-button">
            Очередь проверок
          </Link>
        </>
      }
    >
      <AdminFrame>
      <nav className="ops-tabs ops-tabs--section" aria-label="Разделы правил выборки">
        {samplingSections.map((section) => (
          <Link
            key={section.value}
            href={samplingSectionHref(section.value)}
            className={`ops-tab ${activeSection === section.value ? "ops-tab--active" : ""}`}
            aria-current={activeSection === section.value ? "page" : undefined}
          >
            {section.label}
          </Link>
        ))}
      </nav>

      {activeSection === "rules" ? (
        <section className="ops-panel" aria-labelledby="sampling-rules-title">
          <div className="ops-panel__header">
            <div>
              <p className="ops-panel__eyebrow">Правила</p>
              <h2 id="sampling-rules-title" className="ops-panel__title">Правила выборки</h2>
              <p className="ops-panel__subtitle">
                Активно: {activeRules} · всего: {rules.length}
              </p>
            </div>
          </div>
          <div className={samplingSetupHint ? "setup-guide-layout p-4" : "p-4"}>
            <div className={samplingSetupHint ? "setup-guide-layout__main" : ""}>
              {rules.length > 0 ? (
                <div className="admin-data-table admin-data-table--sampling" aria-label="Правила выборки">
                  <div className="admin-data-table__head">
                    <span>Правило</span>
                    <span>Тип</span>
                    <span>Условия</span>
                    <span className="admin-data-table__num">Выборка</span>
                  </div>
                  {rules.map((rule) => {
                    const conditions = parseConditions(rule.conditionsJson);

                    return (
                      <div key={rule.id} className="admin-data-table__row">
                        <span className="admin-data-table__primary admin-data-table__primary--stacked">
                          <strong>{rule.name}</strong>
                          <span className="admin-data-table__inline-actions">
                            <Chip tone={rule.isActive ? "success" : "neutral"} size="xs">
                              {rule.isActive ? "Активно" : "Выключено"}
                            </Chip>
                            <form action={updateSamplingRuleStatus}>
                              <input type="hidden" name="id" value={rule.id} />
                              <input name="isActive" type="checkbox" defaultChecked={!rule.isActive} className="hidden" />
                              <button type="submit" className="quiet-link text-sm">
                                {rule.isActive ? "Выключить" : "Включить"}
                              </button>
                            </form>
                          </span>
                        </span>
                        <span>{samplingRuleTypeLabels[rule.type] ?? rule.type}</span>
                        <span className="admin-data-table__muted">{formatConditions(conditions)}</span>
                        <span className="admin-data-table__stack admin-data-table__num">
                          <strong className="tabular-nums">{rule.targetPercent}%</strong>
                          <small className="tabular-nums">приор. {rule.priority}</small>
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyState
                  size="inline"
                  icon={<ListChecks size={20} aria-hidden="true" />}
                  title="Правил пока нет"
                  description="Добавьте правило, чтобы обращения автоматически попадали в очередь проверки."
                  action={
                    <Link href={samplingSectionHref("create")} className="action-button action-button--small">
                      Новое правило
                    </Link>
                  }
                />
              )}
            </div>
            {samplingSetupHint ? (
              <CoachCallout
                title={samplingSetupHint.title}
                body={samplingSetupHint.body}
                href={samplingSetupHint.href}
                actionLabel={samplingSetupHint.actionLabel}
                variant="spotlight"
                placement="left"
                anchorLabel="Подсказка к правилам выборки"
                stepIndex={1}
                dismissId="settings:sampling"
              />
            ) : null}
          </div>
        </section>
      ) : null}

      {activeSection === "create" ? (
        <section className="ops-panel" aria-labelledby="sampling-create-title">
          <div className="ops-panel__header">
            <div>
              <p className="ops-panel__eyebrow">Новое правило</p>
              <h2 id="sampling-create-title" className="ops-panel__title">Создание правила</h2>
              <p className="ops-panel__subtitle">Настройте условия и долю обращений для ручной проверки.</p>
            </div>
          </div>
          <div className="p-4">
            {samplingSetupHint ? (
              <div className="admin-setup-inline mb-4 rounded-[var(--radius-card)] border border-[var(--line-soft)]">
                <CoachCallout
                  title="Сэмплируйте по тому, что важно"
                  body="CSAT, канал, линия, тег и приоритет — это единый конструктор условий, а не разрозненные поля."
                  variant="spotlight"
                  placement="top"
                  anchorLabel="Подсказка к созданию правила"
                  stepIndex={2}
                  dismissId="settings:sampling"
                />
              </div>
            ) : null}
            <SamplingRuleForm
              action={createSamplingRule}
              channelOptions={Object.entries(channelLabels).map(([value, label]) => ({ value, label }))}
              csatOptions={Object.entries(csatBucketLabels).map(([value, label]) => ({ value, label }))}
              ruleTypeOptions={Object.entries(samplingRuleTypeLabels).map(([value, label]) => ({ value, label }))}
            />
          </div>
        </section>
      ) : null}
      </AdminFrame>
    </PageShell>
  );
}
