import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { channelLabels, csatBucketLabels } from "@/lib/labels";
import { createSamplingRule, updateSamplingRuleStatus } from "@/lib/quality-actions";

export const dynamic = "force-dynamic";

function parseConditions(value: string) {
  try {
    return JSON.parse(value) as Record<string, string | string[] | undefined>;
  } catch {
    return {};
  }
}

export default async function SamplingRulesPage() {
  const user = await requireCurrentUserPermission("sampling:manage");
  const rules = await prisma.samplingRule.findMany({
    where: { workspaceId: user.workspaceId },
    orderBy: [{ isActive: "desc" }, { priority: "asc" }, { createdAt: "desc" }]
  });

  return (
    <section className="page-shell">
      <div className="mb-6">
        <p className="text-sm font-medium text-[#667085]">Администрирование</p>
        <h1 className="mt-1 text-2xl font-semibold">Правила выборки</h1>
        <p className="mt-1 max-w-3xl text-sm leading-5 text-[#667085]">
          Управляют тем, какие обращения попадают в ручную проверку: случайная выборка, негативный CSAT, новые сотрудники и ручные сигналы.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="panel overflow-hidden">
          <div className="border-b border-[#d7dce5] px-5 py-4">
            <h2 className="text-lg font-semibold">Активные и архивные правила</h2>
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

        <form action={createSamplingRule} className="panel h-fit overflow-hidden">
          <div className="border-b border-[#d7dce5] px-5 py-4">
            <h2 className="text-lg font-semibold">Новое правило</h2>
          </div>
          <div className="grid gap-3 p-5">
            <label className="grid gap-1 text-sm font-medium text-[#344054]">
              Название
              <input name="name" required className="rounded border border-[#d7dce5] px-3 py-2" />
            </label>
            <label className="grid gap-1 text-sm font-medium text-[#344054]">
              Тип
              <select name="type" defaultValue="random" className="rounded border border-[#d7dce5] bg-white px-3 py-2">
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
                <select name="channel" defaultValue="" className="rounded border border-[#d7dce5] bg-white px-3 py-2">
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
                <select name="csatBucket" defaultValue="" className="rounded border border-[#d7dce5] bg-white px-3 py-2">
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
                <input name="supportLine" placeholder="1ЛП" className="rounded border border-[#d7dce5] px-3 py-2" />
              </label>
              <label className="grid gap-1 text-sm font-medium text-[#344054]">
                Тег
                <input name="tag" placeholder="new_hire" className="rounded border border-[#d7dce5] px-3 py-2" />
              </label>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1 text-sm font-medium text-[#344054]">
                Доля, %
                <input name="targetPercent" type="number" min="1" max="100" defaultValue="10" className="rounded border border-[#d7dce5] px-3 py-2" />
              </label>
              <label className="grid gap-1 text-sm font-medium text-[#344054]">
                Приоритет
                <input name="priority" type="number" defaultValue="100" className="rounded border border-[#d7dce5] px-3 py-2" />
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm font-medium text-[#344054]">
              <input name="isActive" type="checkbox" defaultChecked />
              Включить сразу
            </label>
            <button type="submit" className="rounded bg-[#116466] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0b4f52]">
              Создать правило
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
