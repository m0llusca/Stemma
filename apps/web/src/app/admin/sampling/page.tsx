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
          <div className="border-b border-[#d7dce5] px-5 py-4">
            <h2 className="text-lg font-semibold">Правила</h2>
            <p className="mt-1 text-sm text-[#667085]">
              Активно: {activeRules} · всего: {rules.length}
            </p>
          </div>
          <div className="grid gap-3 p-5">
            {rules.map((rule) => {
              const conditions = parseConditions(rule.conditionsJson);

              return (
                <article key={rule.id} className="grid gap-3 rounded-md border border-[#d7dce5] bg-[#fbfcfd] p-4 md:grid-cols-[minmax(0,1fr)_160px_auto] md:items-center">
                  <div className="min-w-0">
                    <p className="font-semibold text-[#17202a]">{rule.name}</p>
                    <p className="mt-1 text-sm text-[#667085]">
                      {rule.type} · {rule.targetPercent}% · приоритет {rule.priority}
                    </p>
                    <p className="mt-2 text-xs text-[#667085]">
                      {Object.entries(conditions)
                        .filter(([, value]) => Boolean(value))
                        .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : value}`)
                        .join(" · ") || "Без условий"}
                    </p>
                  </div>
                  <span className="w-fit rounded-md bg-white px-2 py-1 text-xs font-semibold uppercase text-[#475467]">
                    {rule.isActive ? "Активно" : "Выключено"}
                  </span>
                  <form action={updateSamplingRuleStatus} className="md:justify-self-end">
                    <input type="hidden" name="id" value={rule.id} />
                    <label className="flex items-center gap-2 text-sm text-[#344054]">
                      <input name="isActive" type="checkbox" defaultChecked={!rule.isActive} className="hidden" />
                      <button type="submit" className="rounded border border-[#d7dce5] bg-white px-3 py-2 text-sm font-semibold text-[#344054] hover:bg-[#eef4f4]">
                        {rule.isActive ? "Выключить" : "Включить"}
                      </button>
                    </label>
                  </form>
                </article>
              );
            })}
          </div>
        </section>

        <details id="new-rule" className="disclosure-panel panel h-fit overflow-hidden" open={shouldOpenNewRule}>
          <summary className="disclosure-summary flex cursor-pointer list-none items-center justify-between gap-4 border-b border-[#d7dce5] px-5 py-4">
            <div>
              <h2 className="text-lg font-semibold">Новое правило</h2>
              <p className="mt-1 text-sm text-[#667085]">Форма создания скрыта, пока вы не добавляете правило.</p>
            </div>
            <span className="shrink-0 text-sm font-semibold text-[#0b4f52]">Открыть</span>
          </summary>
          <form action={createSamplingRule} className="grid gap-3 p-5">
            <label className="grid gap-1 text-sm font-medium text-[#344054]">
              Название
              <input name="name" required className="form-control" />
            </label>
            <label className="grid gap-1 text-sm font-medium text-[#344054]">
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
              <label className="grid gap-1 text-sm font-medium text-[#344054]">
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
              <label className="grid gap-1 text-sm font-medium text-[#344054]">
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
              <label className="grid gap-1 text-sm font-medium text-[#344054]">
                Линия
                <input name="supportLine" placeholder="1ЛП" className="form-control" />
              </label>
              <label className="grid gap-1 text-sm font-medium text-[#344054]">
                Тег
                <input name="tag" placeholder="new_hire" className="form-control" />
              </label>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1 text-sm font-medium text-[#344054]">
                Доля, %
                <input name="targetPercent" type="number" min="1" max="100" defaultValue="10" className="form-control" />
              </label>
              <label className="grid gap-1 text-sm font-medium text-[#344054]">
                Приоритет
                <input name="priority" type="number" defaultValue="100" className="form-control" />
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm font-medium text-[#344054]">
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
