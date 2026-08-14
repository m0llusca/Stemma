import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
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
      required: "Предпросмотр по фильтрам и ограниченный поиск перед импортом."
    },
    {
      name: "TicketGet",
      method: config.routes.ticketGetMethod,
      route: config.routes.ticketGetPath,
      required: "Диагностика, предпросмотр по ручным TicketID и загрузка выбранных обращений."
    }
  ];

  return (
    <Card className="overflow-clip">
      <CardHeader className="border-b">
        <h2 className="font-heading text-base leading-snug font-medium">
          Чек-лист WebService
        </h2>
        <CardDescription>Параметры, которые должны совпадать с GenericInterface в OTRS/Znuny/OTOBO.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 pt-(--card-spacing)">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border p-3">
            <p className="text-xs font-medium text-muted-foreground">Продукт</p>
            <p className="text-sm font-medium">{profile.label}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs font-medium text-muted-foreground">Имя WebService</p>
            <p className="font-mono text-sm font-medium">{config.webServiceName}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs font-medium text-muted-foreground">Базовый путь</p>
            <p className="font-mono text-sm font-medium">{config.basePath}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs font-medium text-muted-foreground">Переопределения маршрутов</p>
            <Badge variant={config.advanced.routeOverridesEnabled ? "secondary" : "outline"} className="mt-1 font-normal">
              {config.advanced.routeOverridesEnabled ? "Включены" : "Профильные маршруты"}
            </Badge>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-lg border p-3">
            <p className="text-xs font-medium text-muted-foreground">Авторизация TicketSearch</p>
            <p className="text-sm font-medium">
              {config.auth.ticketSearch === "session" ? "SessionCreate + SessionID" : "UserLogin + Password"}
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs font-medium text-muted-foreground">Авторизация TicketGet</p>
            <p className="text-sm font-medium">
              {config.auth.ticketGet === "session" ? "SessionCreate + SessionID" : "UserLogin + Password"}
            </p>
          </div>
        </div>

        <div className="rounded-lg border p-3">
          <p className="text-xs font-medium text-muted-foreground">Шаблон URL GenericInterface</p>
          <code className="mt-1 block break-all text-xs text-muted-foreground">
            {genericInterfaceUrl || "/nph-genericinterface.pl/Webservice/<WebService>"}
          </code>
        </div>

        <Table className="min-w-[680px]">
          <TableHeader>
            <TableRow>
              <TableHead>Операция</TableHead>
              <TableHead>Метод</TableHead>
              <TableHead>Шаблон маршрута</TableHead>
              <TableHead>Зачем нужна</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {operations.map((operation) => (
              <TableRow key={operation.name}>
                <TableCell className="font-semibold">{operation.name}</TableCell>
                <TableCell className="font-mono text-xs">{operation.method}</TableCell>
                <TableCell className="font-mono text-xs">{operation.route}</TableCell>
                <TableCell className="max-w-[320px] whitespace-normal">{operation.required}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
