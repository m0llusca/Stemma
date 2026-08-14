import { ListChecks } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { CoachCallout } from "@/components/guidance/coach-callout";
import { PageSkeleton } from "@/components/loading-states";
import { SamplingRuleForm } from "@/components/admin/sampling-rule-form";
import { AdminDialog } from "@/components/admin/admin-dialog";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { PageShell } from "@/components/ui/page-shell";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { AdminFrame } from "@/components/admin/admin-frame";
import { statusSurfaceClass } from "@/lib/ui/status-tone";
import { cn } from "@/lib/utils";
import { adminEyebrow, adminLoadingLabel, adminSectionTitles } from "@/lib/admin-sections";
import { getSettingCoachmark } from "@/lib/admin-setup-guidance";
import { requireCurrentUserPermission } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { channelLabels, csatBucketLabels } from "@/lib/labels";
import { createSamplingRule, updateSamplingRule, updateSamplingRuleStatus } from "@/lib/quality-actions";

export const dynamic = "force-dynamic";

type SamplingRulesPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** Deep-link на открытое окно создания правила (используется и из коуч-подсказок). */
const createRuleHref = "/admin/sampling?section=create";

function firstParam(value: string | string[] | undefined) {
  const firstValue = Array.isArray(value) ? value[0] : value;
  return firstValue?.trim() || undefined;
}

// ?section=create и ?new=1 открывают окно создания поверх списка; любой другой
// хвост (включая исторический ?section=rules) просто показывает страницу.
function createDialogRequested(params: Record<string, string | string[] | undefined>) {
  return firstParam(params.new) === "1" || firstParam(params.section) === "create";
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

/** Условие из JSON в значение поля формы: форма редактирует одиночные строки. */
function conditionFieldValue(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value) || undefined;
}

export default function SamplingRulesPage({ searchParams }: SamplingRulesPageProps) {
  return (
    <Suspense fallback={<PageSkeleton variant="admin" label={adminLoadingLabel("/admin/sampling")} />}>
      <SamplingRulesPageContent searchParams={searchParams} />
    </Suspense>
  );
}

async function SamplingRulesPageContent({ searchParams }: SamplingRulesPageProps) {
  const params = await searchParams;
  // Deep-link ?section=create (или ?new=1) открывает окно создания поверх списка правил.
  const createDialogOpen = createDialogRequested(params);
  const user = await requireCurrentUserPermission("sampling:manage");
  const rules = await prisma.samplingRule.findMany({
    where: { workspaceId: user.workspaceId },
    orderBy: [{ isActive: "desc" }, { priority: "asc" }, { createdAt: "desc" }]
  });
  const activeRules = rules.filter((rule) => rule.isActive).length;
  const samplingSetupHint = activeRules > 0 ? null : getSettingCoachmark("sampling");

  // Общие наборы опций для формы создания и построчных форм редактирования.
  const channelOptions = Object.entries(channelLabels).map(([value, label]) => ({ value, label }));
  const csatOptions = Object.entries(csatBucketLabels).map(([value, label]) => ({ value, label }));
  const ruleTypeOptions = Object.entries(samplingRuleTypeLabels).map(([value, label]) => ({ value, label }));

  return (
    <PageShell
      eyebrow={adminEyebrow}
      title={adminSectionTitles["/admin/sampling"]}
      description="Управляют тем, какие обращения попадают в ручную проверку: случайная выборка, негативный CSAT, новые сотрудники и ручные сигналы."
    >
      <AdminFrame>
        <Card aria-labelledby="sampling-rules-title">
          <CardHeader className="border-b">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Правила</p>
                <CardTitle id="sampling-rules-title">Правила выборки</CardTitle>
                <CardDescription>
                  Активно: {activeRules} · всего: {rules.length}
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <AdminDialog
                  triggerLabel="Новое правило"
                  triggerClassName={buttonVariants()}
                  title="Новое правило выборки"
                  description="Настройте условия и долю обращений для ручной проверки."
                  defaultOpen={createDialogOpen}
                >
                  {samplingSetupHint ? (
                    <div className="mb-4 rounded-xl border border-border">
                      <CoachCallout
                        title="Сэмплируйте по тому, что важно"
                        body="CSAT, канал, линия, тег и приоритет — это единый конструктор условий, а не разрозненные поля."
                        variant="spotlight"
                        placement="top"
                        anchorLabel="Подсказка к созданию правила"
                        stepIndex={2}
                        dismissId="settings:sampling"
                      />
                    </div>
                  ) : null}
                  <SamplingRuleForm
                    action={createSamplingRule}
                    channelOptions={channelOptions}
                    csatOptions={csatOptions}
                    ruleTypeOptions={ruleTypeOptions}
                  />
                </AdminDialog>
                <Link href="/reviews" className={buttonVariants({ variant: "outline" })}>
                  Очередь проверок
                </Link>
              </div>
            </div>
          </CardHeader>
          <CardContent className={cn("pt-4", samplingSetupHint ? "setup-guide-layout" : undefined)}>
            <div className={samplingSetupHint ? "setup-guide-layout__main" : undefined}>
              {rules.length > 0 ? (
                <Table aria-label="Правила выборки">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Правило</TableHead>
                      <TableHead>Тип</TableHead>
                      <TableHead>Условия</TableHead>
                      <TableHead className="text-right">Выборка</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rules.map((rule) => {
                      const conditions = parseConditions(rule.conditionsJson);

                      return (
                        <TableRow key={rule.id}>
                          <TableCell className="whitespace-normal">
                            <div className="flex min-w-0 flex-col gap-1.5">
                              <strong className="font-medium text-foreground">{rule.name}</strong>
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge
                                  variant={rule.isActive ? "outline" : "secondary"}
                                  className={
                                    rule.isActive
                                      ? cn("border-transparent", statusSurfaceClass("positive"))
                                      : undefined
                                  }
                                >
                                  {rule.isActive ? "Активно" : "Выключено"}
                                </Badge>
                                <form action={updateSamplingRuleStatus}>
                                  <input type="hidden" name="id" value={rule.id} />
                                  <Checkbox
                                    name="isActive"
                                    value="on"
                                    defaultChecked={!rule.isActive}
                                    className="sr-only"
                                    tabIndex={-1}
                                    aria-hidden="true"
                                  />
                                  <Button type="submit" variant="link" size="sm" className="h-auto px-0">
                                    {rule.isActive ? "Выключить" : "Включить"}
                                  </Button>
                                </form>
                                {/* Тумблер рядом — link-кнопка, поэтому и «Изменить» в том же стиле. */}
                                <AdminDialog
                                  triggerLabel="Изменить"
                                  triggerClassName={buttonVariants({ variant: "link", size: "sm", className: "h-auto px-0" })}
                                  title={`Правило: ${rule.name}`}
                                  description="Обновите условия и долю обращений для ручной проверки."
                                >
                                  <SamplingRuleForm
                                    action={updateSamplingRule}
                                    rule={{
                                      id: rule.id,
                                      name: rule.name,
                                      type: rule.type,
                                      channel: conditionFieldValue(conditions.channel),
                                      csatBucket: conditionFieldValue(conditions.csatBucket),
                                      supportLine: conditionFieldValue(conditions.supportLine),
                                      tag: conditionFieldValue(conditions.tag),
                                      targetPercent: rule.targetPercent,
                                      priority: rule.priority,
                                      isActive: rule.isActive
                                    }}
                                    channelOptions={channelOptions}
                                    csatOptions={csatOptions}
                                    ruleTypeOptions={ruleTypeOptions}
                                  />
                                </AdminDialog>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>{samplingRuleTypeLabels[rule.type] ?? rule.type}</TableCell>
                          <TableCell className="max-w-[18rem] whitespace-normal text-muted-foreground">
                            {formatConditions(conditions)}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex flex-col items-end gap-0.5">
                              <strong className="tabular-nums">{rule.targetPercent}%</strong>
                              <span className="text-xs tabular-nums text-muted-foreground">приор. {rule.priority}</span>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              ) : (
                <EmptyState
                  size="inline"
                  icon={<ListChecks size={20} aria-hidden="true" />}
                  title="Правил пока нет"
                  description="Добавьте правило, чтобы обращения автоматически попадали в очередь проверки."
                  action={
                    <Link href={createRuleHref} className={buttonVariants({ size: "sm" })}>
                      Новое правило
                    </Link>
                  }
                />
              )}
            </div>
            {samplingSetupHint ? (
              <CoachCallout
                title={samplingSetupHint.title}
                body={samplingSetupHint.body}
                href={samplingSetupHint.href}
                actionLabel={samplingSetupHint.actionLabel}
                variant="spotlight"
                placement="left"
                anchorLabel="Подсказка к правилам выборки"
                stepIndex={1}
                dismissId="settings:sampling"
              />
            ) : null}
          </CardContent>
        </Card>
      </AdminFrame>
    </PageShell>
  );
}
