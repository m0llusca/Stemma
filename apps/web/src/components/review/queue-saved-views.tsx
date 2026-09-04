import Link from "next/link";
import { ChevronDown, MoreHorizontal, X } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Separator } from "@/components/ui/separator";
import { ValidatedSubmitButton } from "@/components/ui/validated-submit-button";
import { createSavedQueueView, deleteSavedQueueView } from "@/lib/queue-view-actions";
import { cn } from "@/lib/utils";

type SavedView = {
  label: string;
  href: string;
  tone?: "neutral" | "success" | "warning" | "danger" | "info" | "accent";
};

const VISIBLE_VIEW_LIMIT = 8;

export function QueueSavedViews({
  currentAssigneeName,
  currentHref,
  savedViews = []
}: {
  currentAssigneeName: string;
  currentHref: string;
  savedViews?: Array<{ id: string; name: string; href: string; scope: string }>;
}) {
  const views: SavedView[] = [
    { label: "Все", href: "/reviews", tone: "neutral" },
    { label: "Мои проверки", href: `/reviews?qaAssignee=${encodeURIComponent(currentAssigneeName)}`, tone: "info" },
    {
      label: "Мои + просрочено",
      href: `/reviews?qaAssignee=${encodeURIComponent(currentAssigneeName)}&due=overdue`,
      tone: "danger"
    },
    { label: "Просрочено", href: "/reviews?due=overdue", tone: "danger" },
    { label: "Критические", href: "/reviews?process=critical", tone: "danger" },
    { label: "Переответы", href: "/reviews?process=reanswer", tone: "warning" },
    { label: "Апелляции", href: "/reviews?process=appeal", tone: "warning" },
    { label: "Негативный CSAT", href: "/reviews?csatBucket=NEGATIVE", tone: "warning" }
  ];

  const allViews: Array<SavedView & { id?: string }> = [
    ...views,
    ...savedViews.map((view) => ({
      label: view.name,
      href: view.href,
      tone: view.scope === "workspace" ? ("accent" as const) : ("info" as const),
      id: view.id
    }))
  ];
  const currentView = allViews.find((view) => currentHref === view.href);
  const visibleViews = allViews.slice(0, VISIBLE_VIEW_LIMIT);
  const overflowViews = allViews.slice(VISIBLE_VIEW_LIMIT);

  return (
    <Collapsible className="group min-w-0">
      <CollapsibleTrigger className="flex w-full min-w-0 cursor-pointer items-center justify-between gap-4 px-4 py-3.5 text-left">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">Быстрые виды</h2>
          <p className="mt-1 truncate text-sm text-muted-foreground">{currentView?.label ?? "Текущий фильтр"}</p>
        </div>
        <span className="queue-filterbar__summary-action inline-flex shrink-0 items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm font-semibold text-foreground group-data-open:border-primary/40 group-data-open:bg-primary/10 group-data-open:text-primary">
          <span className="queue-filterbar__summary-closed group-data-open:hidden">Раскрыть</span>
          <span className="queue-filterbar__summary-open hidden group-data-open:inline">Скрыть</span>
          <ChevronDown
            className="queue-filterbar__chevron size-4 transition-transform group-data-open:rotate-180"
            aria-hidden="true"
          />
        </span>
      </CollapsibleTrigger>

      <CollapsibleContent className="min-w-0 border-t border-border">
        <div className="signal-row flex flex-wrap items-center gap-1.5 px-4 py-3" aria-label="Быстрые представления очереди">
          {visibleViews.map((view, index) => {
            const isActive = currentHref === view.href;

            return (
              <span key={view.id ?? `default-${index}-${view.href}`} className="inline-flex items-center gap-1">
                <Link href={view.href}>
                  <Chip tone={isActive ? "accent" : view.tone}>{view.label}</Chip>
                </Link>
                {view.id ? (
                  <form action={deleteSavedQueueView}>
                    <input type="hidden" name="id" value={view.id} />
                    <Button
                      type="submit"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Удалить представление ${view.label}`}
                      title="Удалить представление"
                    >
                      <X aria-hidden="true" />
                    </Button>
                  </form>
                ) : null}
              </span>
            );
          })}

          {overflowViews.length > 0 ? (
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" size="sm" className="gap-1" />}>
                <MoreHorizontal data-icon="inline-start" />
                Ещё ({overflowViews.length})
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-48">
                {overflowViews.map((view, index) => {
                  const isActive = currentHref === view.href;

                  return (
                    <DropdownMenuItem
                      key={view.id ?? `overflow-${index}-${view.href}`}
                      render={<Link href={view.href} />}
                      nativeButton={false}
                      className={cn(isActive && "bg-accent text-accent-foreground")}
                    >
                      {view.label}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>

        <Separator />

        <form action={createSavedQueueView} className="grid min-w-0 gap-2 bg-muted/40 p-4">
          <input type="hidden" name="href" value={currentHref} />
          <Field className="min-w-0">
            <FieldLabel htmlFor="saved-view-name">Сохранить текущий вид</FieldLabel>
            <Input id="saved-view-name" name="name" required placeholder="Например, 2ЛП критические" />
          </Field>
          <Field className="min-w-0">
            <FieldLabel htmlFor="saved-view-scope">Доступ</FieldLabel>
            <NativeSelect id="saved-view-scope" name="scope" defaultValue="private" className="w-full">
              <NativeSelectOption value="private">Только мне</NativeSelectOption>
              <NativeSelectOption value="workspace">Всем</NativeSelectOption>
            </NativeSelect>
          </Field>
          <ValidatedSubmitButton className={cn(buttonVariants({ variant: "outline" }), "justify-self-start")}>
            Сохранить
          </ValidatedSubmitButton>
        </form>
      </CollapsibleContent>
    </Collapsible>
  );
}
