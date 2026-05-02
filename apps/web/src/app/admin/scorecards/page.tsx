import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AdminScorecardsPage() {
  const user = await getCurrentUser();
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
        <p className="text-sm font-medium text-[#667085]">Admin</p>
        <h1 className="mt-1 text-2xl font-semibold">Scorecards</h1>
      </div>

      <div className="grid gap-5">
        {scorecards.map((scorecard) => (
          <article key={scorecard.id} className="panel overflow-hidden">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#d7dce5] px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold">{scorecard.name}</h2>
                <p className="mt-1 text-sm text-[#667085]">Version {scorecard.version}</p>
              </div>
              <span className="rounded-md border border-[#d7dce5] px-2 py-1 text-xs font-semibold uppercase text-[#475467]">
                {scorecard.isActive ? "Active" : "Inactive"}
              </span>
            </div>
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-[#eef4f4] text-xs uppercase text-[#475467]">
                <tr>
                  <th className="px-5 py-3 font-semibold">Order</th>
                  <th className="px-5 py-3 font-semibold">Criterion</th>
                  <th className="px-5 py-3 font-semibold">Kind</th>
                  <th className="px-5 py-3 font-semibold">Weight</th>
                  <th className="px-5 py-3 font-semibold">Required</th>
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
                    <td className="px-5 py-4 text-[#344054]">{criterion.kind}</td>
                    <td className="px-5 py-4 text-[#344054]">{criterion.weight}%</td>
                    <td className="px-5 py-4 text-[#344054]">{criterion.required ? "Yes" : "No"}</td>
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
