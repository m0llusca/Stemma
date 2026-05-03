import { ChevronDown } from "lucide-react";
import { ScorecardVersionForm } from "@/components/scorecards/scorecard-version-form";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { criterionKindLabels } from "@/lib/labels";

export const dynamic = "force-dynamic";

export default async function AdminScorecardsPage() {
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
    <section className="page-shell">
      <div className="mb-6">
        <p className="text-sm font-medium text-[#667085]">Администрирование</p>
        <h1 className="mt-1 text-2xl font-semibold">Формы оценки</h1>
      </div>

      <section className="panel mb-6 overflow-hidden">
        <div className="border-b border-[#d7dce5] px-5 py-4">
          <h2 className="text-lg font-semibold">Версионирование правил</h2>
          <p className="mt-1 text-sm text-[#667085]">
            Каждая завершенная проверка хранит версию формы оценки. Новая версия не переписывает старые результаты и позволяет сравнивать периоды без смешивания методик.
          </p>
        </div>
        <div className="grid gap-3 p-5 md:grid-cols-3">
          <div className="rounded-md border border-[#d7dce5] bg-[#fbfcfd] p-3">
            <p className="text-xs font-semibold uppercase text-[#667085]">Активная версия</p>
            <p className="mt-2 font-semibold text-[#17202a]">{activeScorecard ? `${activeScorecard.name} v${activeScorecard.version}` : "Нет"}</p>
          </div>
          <div className="rounded-md border border-[#d7dce5] bg-[#fbfcfd] p-3">
            <p className="text-xs font-semibold uppercase text-[#667085]">История</p>
            <p className="mt-2 font-semibold text-[#17202a]">{scorecards.length} версий</p>
          </div>
          <div className="rounded-md border border-[#d7dce5] bg-[#fbfcfd] p-3">
            <p className="text-xs font-semibold uppercase text-[#667085]">Правило изменения</p>
            <p className="mt-2 text-sm leading-5 text-[#344054]">Изменения выпускаются только новой версией формы.</p>
          </div>
        </div>
      </section>

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
              block: criterion.block,
              kind: criterion.kind,
              weight: criterion.weight,
              required: criterion.required
            }))}
          />
        </section>
      ) : null}

      <div className="grid gap-5">
        {scorecards.map((scorecard) => (
          <details key={scorecard.id} className="panel disclosure-panel overflow-hidden" open={scorecard.isActive}>
            <summary className="disclosure-summary flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold">{scorecard.name}</h2>
                <p className="mt-1 text-sm text-[#667085]">
                  Версия {scorecard.version} · критериев: {scorecard.criteria.length}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="rounded-md border border-[#d7dce5] px-2 py-1 text-xs font-semibold uppercase text-[#475467]">
                  {scorecard.isActive ? "Активна" : "Неактивна"}
                </span>
                <span
                  className="disclosure-chevron flex h-8 w-8 items-center justify-center rounded-md text-[#0b4f52]"
                  aria-hidden="true"
                >
                  <ChevronDown className="h-4 w-4" />
                </span>
              </div>
            </summary>
            <div className="border-t border-[#d7dce5]">
              <div className="scroll-area">
                <table className="table-fixed-copy w-full min-w-[760px] border-collapse text-left text-sm">
                  <thead className="bg-[#eef4f4] text-xs uppercase text-[#475467]">
                    <tr>
                      <th className="px-5 py-3 font-semibold">Порядок</th>
                      <th className="px-5 py-3 font-semibold">Блок</th>
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
                        <td className="px-5 py-4 text-[#344054]">{criterion.block}</td>
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
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
