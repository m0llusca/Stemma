import Link from "next/link";
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
      <div className="admin-hero">
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

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="panel overflow-hidden">
          <div className="border-b border-[#d9e0ea] px-5 py-4">
            <h2 className="text-lg font-semibold">Правила</h2>
            <p className="mt-1 text-sm text-[#64748b]">
              Активно: {activeRules} · всего: {rules.length}
            </p>
          </div>
          <div className="record-list px-5">
            {rules.map((rule) => {
              const conditions = parseConditions(rule.conditionsJson);

              return (
                <article key={rule.id} className="record-card">
                  <div className="min-w-0">
                    <div className="record-row">
                      <div className="min-w-0">
                        <h3 className="record-title">{rule.name}</h3>
                        <p className="record-meta mt-1">
                          {samplingRuleTypeLabels[rule.type] ?? rule.type} · {rule.targetPercent}% · приоритет {rule.priority}
                        </p>
                      </div>
                      <span className={`pill ${rule.isActive ? "pill--ok" : "pill--neutral"}`}>
                        {rule.isActive ? "Активно" : "Выключено"}
                      </span>
                    </div>
                    <p className="record-meta mt-2">{formatConditions(conditions)}</p>
                  </div>
                  <div className="record-row">
                    <p className="record-meta">Правило применяется автоматически при формировании очереди.</p>
                    <form action={updateSamplingRuleStatus}>
                      <input type="hidden" name="id" value={rule.id} />
                      <input name="isActive" type="checkbox" defaultChecked={!rule.isActive} className="hidden" />
                      <button type="submit" className="action-button min-h-[36px] px-3 py-2 text-sm">
                        {rule.isActive ? "Выключить" : "Включить"}
                      </button>
                    </form>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <details id="new-rule" className="disclosure-panel panel h-fit overflow-hidden" open={shouldOpenNewRule}>
          <summary className="disclosure-summary flex cursor-pointer list-none items-center justify-between gap-4 border-b border-[#d9e0ea] px-5 py-4">
            <div>
              <h2 className="text-lg font-semibold">Новое правило</h2>
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
            <button type="submit" className="action-button action-button--primary">
              Создать правило
            </button>
          </form>
        </details>
      </div>
    </section>
  );
}
