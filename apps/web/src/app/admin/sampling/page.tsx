import Link from "next/link";
import { ValidatedSubmitButton } from "@/components/ui/validated-submit-button";
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

export default async function SamplingRulesPage({ searchParams }: SamplingRulesPageProps) {
  const params = await searchParams;
  const activeSection = samplingSectionParam(params.section, params.new);
  const user = await requireCurrentUserPermission("sampling:manage");
  const rules = await prisma.samplingRule.findMany({
    where: { workspaceId: user.workspaceId },
    orderBy: [{ isActive: "desc" }, { priority: "asc" }, { createdAt: "desc" }]
  });
  const activeRules = rules.filter((rule) => rule.isActive).length;

  return (
    <section className="page-shell admin-shell">
      <div className="command-center">
        <div className="min-w-0">
          <p className="page-kicker">Администрирование</p>
          <h1 className="page-title">Правила выборки</h1>
          <p className="page-subtitle">
            Управляют тем, какие обращения попадают в ручную проверку: случайная выборка, негативный CSAT, новые сотрудники и ручные сигналы.
          </p>
          <div className="admin-actions mt-5">
            <Link href={samplingSectionHref("create")} className="action-button action-button--primary">
              Новое правило
            </Link>
            <Link href="/reviews" className="action-button">
              Очередь проверок
            </Link>
          </div>
        </div>
      </div>

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
          <div className="grid gap-2 p-4">
            {rules.length > 0 ? (
              rules.map((rule) => {
                const conditions = parseConditions(rule.conditionsJson);

                return (
                  <div key={rule.id} className="admin-tile admin-tile--compact">
                    <span className="admin-tile__icon admin-tile__icon--plain">{rule.priority}</span>
                    <div className="admin-tile__body">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="record-title record-title--tight">{rule.name}</span>
                        <span className={`pill ${rule.isActive ? "pill--ok" : "pill--neutral"}`}>
                          {rule.isActive ? "Активно" : "Выключено"}
                        </span>
                      </span>
                      <span className="record-meta">
                        {samplingRuleTypeLabels[rule.type] ?? rule.type} · {rule.targetPercent}% · приоритет {rule.priority}
                      </span>
                      <span className="record-meta">{formatConditions(conditions)}</span>
                      <form action={updateSamplingRuleStatus} className="mt-1">
                        <input type="hidden" name="id" value={rule.id} />
                        <input name="isActive" type="checkbox" defaultChecked={!rule.isActive} className="hidden" />
                        <button type="submit" className="quiet-link text-sm">
                          {rule.isActive ? "Выключить" : "Включить"}
                        </button>
                      </form>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="soft-callout ops-empty text-sm leading-5 text-[#64748b]">
                Правил пока нет. Добавьте правило, чтобы обращения автоматически попадали в очередь проверки.
              </div>
            )}
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
          <form action={createSamplingRule} className="grid gap-3 p-5">
            <label className="grid gap-1 text-sm font-medium text-[#334155]">
              Название
              <input name="name" required className="form-control" />
            </label>
            <label className="grid gap-1 text-sm font-medium text-[#334155]">
              Тип
              <select name="type" defaultValue="random" className="form-control">
                <option value="random">Случайная</option>
                <option value="csat">CSAT</option>
                <option value="new_hire">Новички</option>
                <option value="lead_signal">Сигнал руководителя</option>
                <option value="manual">Ручная</option>
              </select>
            </label>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1 text-sm font-medium text-[#334155]">
                Канал
                <select name="channel" defaultValue="" className="form-control">
                  <option value="">Любой</option>
                  {Object.entries(channelLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm font-medium text-[#334155]">
                CSAT
                <select name="csatBucket" defaultValue="" className="form-control">
                  <option value="">Любой</option>
                  {Object.entries(csatBucketLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1 text-sm font-medium text-[#334155]">
                Линия
                <input name="supportLine" placeholder="1ЛП" className="form-control" />
              </label>
              <label className="grid gap-1 text-sm font-medium text-[#334155]">
                Тег
                <input name="tag" placeholder="new_hire" className="form-control" />
              </label>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1 text-sm font-medium text-[#334155]">
                Доля, %
                <input name="targetPercent" type="number" min="1" max="100" defaultValue="10" className="form-control" />
              </label>
              <label className="grid gap-1 text-sm font-medium text-[#334155]">
                Приоритет
                <input name="priority" type="number" defaultValue="100" className="form-control" />
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm font-medium text-[#334155]">
              <input name="isActive" type="checkbox" defaultChecked />
              Включить сразу
            </label>
            <div className="flex justify-end">
              <ValidatedSubmitButton>
                Создать правило
              </ValidatedSubmitButton>
            </div>
          </form>
        </section>
      ) : null}
    </section>
  );
}
