import { ScorecardVersionForm } from "@/components/scorecards/scorecard-version-form";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { criterionKindLabels } from "@/lib/labels";

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
    <section className="page-shell">
      <div className="mb-6">
        <p className="text-sm font-medium text-[#667085]">Администрирование</p>
        <h1 className="mt-1 text-2xl font-semibold">Формы оценки</h1>
      </div>

      {activeScorecard ? (
        <section className="panel mb-6 overflow-hidden">
          <div className="border-b border-[#d7dce5] px-5 py-4">
            <h2 className="text-lg font-semibold">Новая версия формы оценки</h2>
            <p className="mt-1 text-sm text-[#667085]">
              Создает новую активную форму и оставляет исторические проверки на прежних версиях.
            </p>
          </div>
          <ScorecardVersionForm
            initialName={activeScorecard.name}
            initialCriteria={activeScorecard.criteria.map((criterion) => ({
              id: criterion.id,
              key: criterion.key,
              label: criterion.label,
              kind: criterion.kind,
              weight: criterion.weight,
              required: criterion.required
            }))}
          />
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
            <div className="scroll-area">
              <table className="table-fixed-copy w-full min-w-[760px] border-collapse text-left text-sm">
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
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
