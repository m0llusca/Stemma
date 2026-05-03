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

function firstParam(value: string | string[] | undefined) {
  const firstValue = Array.isArray(value) ? value[0] : value;
  return firstValue?.trim() || undefined;
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
  const user = await requireCurrentUserPermission("sampling:manage");
  const rules = await prisma.samplingRule.findMany({
    where: { workspaceId: user.workspaceId },
    orderBy: [{ isActive: "desc" }, { priority: "asc" }, { createdAt: "desc" }]
  });
  const activeRules = rules.filter((rule) => rule.isActive).length;
  const shouldOpenNewRule = firstParam(params.new) === "1";

  return (
    <section className="page-shell admin-shell">
      <div className="command-center">
        <div className="min-w-0">
          <p className="page-kicker">Администрирование</p>
          <h1 className="page-title">Правила выборки</h1>
          <p className="page-subtitle">
            Управляют тем, какие обращения попадают в ручную проверку: случайная выборка, негативный CSAT, новые сотрудники и ручные сигналы.
          </p>
        </div>
        <div className="admin-actions">
          <Link href="/admin/sampling?new=1#new-rule" className="action-button action-button--primary">
            Новое правило
          </Link>
          <Link href="/reviews" className="action-button">
            Очередь проверок
          </Link>
        </div>
      </div>

      <section className="admin-group-grid admin-group-grid--two" aria-label="Правила выборки">
        <div className="admin-group">
          <div className="admin-group__header admin-group__header--compact">
            <h2 className="text-base font-semibold text-[#111827]">Правила</h2>
            <p className="text-sm leading-5 text-[#64748b]">
              Активно: {activeRules} · всего: {rules.length}
            </p>
          </div>
          <div className="grid gap-2">
            {rules.map((rule) => {
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
            })}
          </div>
        </div>

        <details id="new-rule" className="disclosure-panel admin-group h-fit" open={shouldOpenNewRule}>
          <summary className="disclosure-summary flex cursor-pointer list-none items-center justify-between gap-4 border-b border-[#d9e0ea] px-5 py-4">
            <div>
              <h2 className="text-base font-semibold">Новое правило</h2>
              <p className="mt-1 text-sm text-[#64748b]">Форма создания скрыта, пока вы не добавляете правило.</p>
            </div>
            <span className="shrink-0 text-sm font-semibold text-[#1d3fae]">Открыть</span>
          </summary>
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
            <ValidatedSubmitButton>
              Создать правило
            </ValidatedSubmitButton>
          </form>
        </details>
      </section>
    </section>
  );
}
