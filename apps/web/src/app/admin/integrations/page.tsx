import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { integrationStatusLabel } from "@/lib/labels";

export const dynamic = "force-dynamic";

const roadmap = [
  {
    name: "Zendesk",
    phase: "Этап 2",
    summary: "Импорт тикетов, синхронизация диалогов и подготовка выборки для проверок."
  },
  {
    name: "Znuny / OTRS / OTOBO",
    phase: "Этап 2",
    summary: "Приоритетный open-source контур для тикетов и email-каналов."
  },
  {
    name: "Intercom / Freshdesk / HubSpot",
    phase: "Этап 3",
    summary: "Дополнительные SaaS-каналы после базового слоя коннекторов."
  }
];

function formatDate(value: Date | null) {
  if (!value) {
    return "Не синхронизировалось";
  }

  return value.toLocaleString("ru-RU");
}

export default async function AdminIntegrationsPage() {
  const user = await getCurrentUser();
  const integrations = await prisma.integration.findMany({
    where: {
      workspaceId: user.workspaceId
    },
    orderBy: {
      displayName: "asc"
    }
  });

  return (
    <section className="px-8 py-7">
      <div className="mb-6">
        <p className="text-sm font-medium text-[#667085]">Администрирование</p>
        <h1 className="mt-1 text-2xl font-semibold">Интеграции</h1>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="panel overflow-hidden">
          <div className="border-b border-[#d7dce5] px-5 py-4">
            <h2 className="text-lg font-semibold">Демо-записи</h2>
          </div>
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-[#eef4f4] text-xs uppercase text-[#475467]">
              <tr>
                <th className="px-5 py-3 font-semibold">Название</th>
                <th className="px-5 py-3 font-semibold">Источник</th>
                <th className="px-5 py-3 font-semibold">Статус</th>
                <th className="px-5 py-3 font-semibold">Последняя синхронизация</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#d7dce5]">
              {integrations.map((integration) => (
                <tr key={integration.id}>
                  <td className="px-5 py-4 font-medium text-[#17202a]">{integration.displayName}</td>
                  <td className="px-5 py-4 text-[#344054]">{integration.source}</td>
                  <td className="px-5 py-4 text-[#344054]">{integrationStatusLabel(integration.status)}</td>
                  <td className="px-5 py-4 text-[#344054]">{formatDate(integration.lastSyncedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="panel p-5">
          <h2 className="text-lg font-semibold">План интеграций</h2>
          <div className="mt-4 grid gap-3">
            {roadmap.map((item) => (
              <article key={item.name} className="rounded-md border border-[#d7dce5] p-4">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-semibold text-[#17202a]">{item.name}</h3>
                  <span className="shrink-0 rounded-md bg-[#eef4f4] px-2 py-1 text-xs font-semibold text-[#0b4f52]">
                    {item.phase}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-5 text-[#667085]">{item.summary}</p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}
