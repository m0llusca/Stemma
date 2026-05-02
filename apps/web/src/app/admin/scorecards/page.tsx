import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { criterionKindLabels } from "@/lib/labels";
import { createScorecardVersion } from "@/lib/scorecard-actions";

export const dynamic = "force-dynamic";

export default async function AdminScorecardsPage() {
  const user = await getCurrentUser();
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
    <section className="px-8 py-7">
      <div className="mb-6">
        <p className="text-sm font-medium text-[#667085]">Администрирование</p>
        <h1 className="mt-1 text-2xl font-semibold">Скоркарты</h1>
      </div>

      {activeScorecard ? (
        <section className="panel mb-6 overflow-hidden">
          <div className="border-b border-[#d7dce5] px-5 py-4">
            <h2 className="text-lg font-semibold">Новая версия скоркарты</h2>
            <p className="mt-1 text-sm text-[#667085]">
              Создает новую активную версию и оставляет исторические проверки на прежней версии.
            </p>
          </div>
          <form action={createScorecardVersion} className="grid gap-4 p-5">
            <input type="hidden" name="criterionCount" value={activeScorecard.criteria.length} />
            <label className="grid max-w-xl gap-1 text-sm font-medium text-[#344054]">
              Название
              <input
                name="name"
                defaultValue={activeScorecard.name}
                required
                className="rounded border border-[#d7dce5] bg-white px-3 py-2"
              />
            </label>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] border-collapse text-left text-sm">
                <thead className="bg-[#eef4f4] text-xs uppercase text-[#475467]">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Ключ</th>
                    <th className="px-4 py-3 font-semibold">Название</th>
                    <th className="px-4 py-3 font-semibold">Тип</th>
                    <th className="px-4 py-3 font-semibold">Вес</th>
                    <th className="px-4 py-3 font-semibold">Обязателен</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#d7dce5]">
                  {activeScorecard.criteria.map((criterion, index) => (
                    <tr key={criterion.id}>
                      <td className="px-4 py-3">
                        <input
                          name={`criterion.${index}.key`}
                          defaultValue={criterion.key}
                          required
                          pattern="[a-z0-9_]+"
                          className="w-full rounded border border-[#d7dce5] px-3 py-2 font-mono text-xs"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          name={`criterion.${index}.label`}
                          defaultValue={criterion.label}
                          required
                          className="w-full rounded border border-[#d7dce5] px-3 py-2"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <select
                          name={`criterion.${index}.kind`}
                          defaultValue={criterion.kind}
                          className="w-full rounded border border-[#d7dce5] bg-white px-3 py-2"
                        >
                          <option value="SCALE_1_3">Шкала 1-3</option>
                          <option value="PASS_FAIL">Зачет/незачет</option>
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <input
                          name={`criterion.${index}.weight`}
                          defaultValue={criterion.weight}
                          required
                          type="number"
                          min="1"
                          max="100"
                          className="w-24 rounded border border-[#d7dce5] px-3 py-2"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <label className="flex items-center gap-2">
                          <input name={`criterion.${index}.required`} type="checkbox" defaultChecked={criterion.required} />
                          Да
                        </label>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between gap-4">
              <p className="text-sm text-[#667085]">Сумма весов должна быть ровно 100%.</p>
              <button type="submit" className="rounded bg-[#116466] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0b4f52]">
                Создать новую версию
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <div className="grid gap-5">
        {scorecards.map((scorecard) => (
          <article key={scorecard.id} className="panel overflow-hidden">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#d7dce5] px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold">{scorecard.name}</h2>
                <p className="mt-1 text-sm text-[#667085]">Версия {scorecard.version}</p>
              </div>
              <span className="rounded-md border border-[#d7dce5] px-2 py-1 text-xs font-semibold uppercase text-[#475467]">
                {scorecard.isActive ? "Активна" : "Неактивна"}
              </span>
            </div>
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-[#eef4f4] text-xs uppercase text-[#475467]">
                <tr>
                  <th className="px-5 py-3 font-semibold">Порядок</th>
                  <th className="px-5 py-3 font-semibold">Критерий</th>
                  <th className="px-5 py-3 font-semibold">Тип</th>
                  <th className="px-5 py-3 font-semibold">Вес</th>
                  <th className="px-5 py-3 font-semibold">Обязателен</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#d7dce5]">
                {scorecard.criteria.map((criterion) => (
                  <tr key={criterion.id}>
                    <td className="px-5 py-4 text-[#344054]">{criterion.order}</td>
                    <td className="px-5 py-4">
                      <div className="font-medium text-[#17202a]">{criterion.label}</div>
                      <div className="mt-1 text-xs text-[#667085]">{criterion.key}</div>
                    </td>
                    <td className="px-5 py-4 text-[#344054]">{criterionKindLabels[criterion.kind]}</td>
                    <td className="px-5 py-4 text-[#344054]">{criterion.weight}%</td>
                    <td className="px-5 py-4 text-[#344054]">{criterion.required ? "Да" : "Нет"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </article>
        ))}
      </div>
    </section>
  );
}
