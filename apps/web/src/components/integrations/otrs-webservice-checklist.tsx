import { DataTable, Surface } from "@/components/integrations/integration-ui";
import { buildOtrsWebServiceBaseUrl, type OtrsConnectorConfig } from "@/lib/integrations/otrs-family/config";
import { otrsFamilyProfiles } from "@/lib/integrations/otrs-family/profiles";

type OtrsWebserviceChecklistProps = {
  baseUrl: string | null;
  config: OtrsConnectorConfig;
};

export function OtrsWebserviceChecklist({ baseUrl, config }: OtrsWebserviceChecklistProps) {
  const profile = otrsFamilyProfiles[config.product];
  const genericInterfaceUrl = buildOtrsWebServiceBaseUrl({
    baseUrl: baseUrl ?? undefined,
    basePath: config.basePath,
    webServiceName: config.webServiceName
  });
  const usesSession = config.auth.ticketSearch === "session" || config.auth.ticketGet === "session";
  const operations = [
    ...(usesSession
      ? [
          {
            name: "SessionCreate",
            method: config.auth.sessionCreateMethod,
            route: config.auth.sessionCreatePath,
            required: "Создание SessionID для операций, где выбран session-flow."
          }
        ]
      : []),
    {
      name: "TicketSearch",
      method: config.routes.ticketSearchMethod,
      route: config.routes.ticketSearchPath,
      required: "Preview по фильтрам и ограниченный поиск перед импортом."
    },
    {
      name: "TicketGet",
      method: config.routes.ticketGetMethod,
      route: config.routes.ticketGetPath,
      required: "Диагностика, manual TicketID preview и загрузка выбранных обращений."
    }
  ];

  return (
    <Surface
      title="WebService checklist"
      description="Параметры, которые должны совпадать с GenericInterface в OTRS/Znuny/OTOBO."
    >
      <div className="grid gap-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="soft-callout">
            <p className="soft-callout__label">Продукт</p>
            <p className="record-title record-title--tight">{profile.label}</p>
          </div>
          <div className="soft-callout">
            <p className="soft-callout__label">WebService name</p>
            <p className="record-title record-title--tight font-mono">{config.webServiceName}</p>
          </div>
          <div className="soft-callout">
            <p className="soft-callout__label">Base path</p>
            <p className="record-title record-title--tight font-mono">{config.basePath}</p>
          </div>
          <div className="soft-callout">
            <p className="soft-callout__label">Route overrides</p>
            <p className="record-title record-title--tight">
              {config.advanced.routeOverridesEnabled ? "Включены" : "Профильные маршруты"}
            </p>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="soft-callout">
            <p className="soft-callout__label">TicketSearch auth</p>
            <p className="record-title record-title--tight">
              {config.auth.ticketSearch === "session" ? "SessionCreate + SessionID" : "UserLogin + Password"}
            </p>
          </div>
          <div className="soft-callout">
            <p className="soft-callout__label">TicketGet auth</p>
            <p className="record-title record-title--tight">
              {config.auth.ticketGet === "session" ? "SessionCreate + SessionID" : "UserLogin + Password"}
            </p>
          </div>
        </div>

        <div className="soft-callout">
          <p className="soft-callout__label">GenericInterface URL pattern</p>
          <code className="mt-1 block break-all text-xs text-[var(--text-body)]">
            {genericInterfaceUrl || "/nph-genericinterface.pl/Webservice/<WebService>"}
          </code>
        </div>

        <DataTable minWidth="min-w-[680px]">
          <thead className="bg-[#edf2ff] text-xs uppercase text-[var(--text-subtle)]">
            <tr>
              <th className="px-4 py-3 font-semibold">Operation</th>
              <th className="px-4 py-3 font-semibold">Method</th>
              <th className="px-4 py-3 font-semibold">Route template</th>
              <th className="px-4 py-3 font-semibold">Зачем нужна</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#d9e0ea]">
            {operations.map((operation) => (
              <tr key={operation.name}>
                <td className="px-4 py-3 font-semibold text-[var(--foreground)]">{operation.name}</td>
                <td className="px-4 py-3 font-mono text-xs">{operation.method}</td>
                <td className="px-4 py-3 font-mono text-xs">{operation.route}</td>
                <td className="px-4 py-3 text-[var(--text-body)]">{operation.required}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      </div>
    </Surface>
  );
}
