"use client";

import * as React from "react";
import Link from "next/link";
import { Bookmark, Check, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Separator } from "@/components/ui/separator";
import { ValidatedSubmitButton } from "@/components/ui/validated-submit-button";
import {
  createSavedReportView,
  deleteSavedReportView
} from "@/lib/saved-report-view-actions";
import { reportPageLocalLinkProps } from "@/lib/reports/report-evidence-links";
import type { SavedReportViewSummary } from "@/lib/saved-report-view";

const presetViews = [
  {
    label: "Обзор",
    href:
      "/reports?view=overview&period=vk-current&compare=previous&grain=day&chartView=graph&series=score%2Cvolume%2Cprevious%2Ctarget"
  },
  {
    label: "Исполнение",
    href:
      "/reports?view=performance&period=vk-current&compare=previous&grain=day&chartView=graph&series=score%2Cvolume%2Cprevious%2Ctarget"
  },
  {
    label: "Процесс",
    href:
      "/reports?view=process&period=vk-current&compare=previous&grain=day&chartView=graph&series=score%2Cvolume%2Cprevious%2Ctarget"
  },
  {
    label: "Разрезы",
    href:
      "/reports?view=details&period=vk-current&compare=previous&grain=day&chartView=graph&series=score%2Cvolume%2Cprevious%2Ctarget"
  }
] as const;

export function ReportSavedViews({
  currentHref,
  savedViews = []
}: {
  currentHref: string;
  savedViews?: SavedReportViewSummary[];
}) {
  const [saveOpen, setSaveOpen] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const pendingSaveRef = React.useRef(false);
  const pendingDialogTimerRef = React.useRef<number | null>(null);
  const nameInputRef = React.useRef<HTMLInputElement>(null);
  const current =
    savedViews.find((view) => view.href === currentHref)?.name ??
    presetViews.find((view) => view.href === currentHref)?.label ??
    "Текущий вид";

  React.useEffect(() => {
    return () => {
      if (pendingDialogTimerRef.current !== null) {
        window.clearTimeout(pendingDialogTimerRef.current);
      }
    };
  }, []);

  return (
    <>
      <DropdownMenu
        open={menuOpen}
        onOpenChange={(open) => {
          if (open && pendingDialogTimerRef.current !== null) {
            window.clearTimeout(pendingDialogTimerRef.current);
            pendingDialogTimerRef.current = null;
          }
          setMenuOpen(open);
          if (!open && pendingSaveRef.current) {
            pendingSaveRef.current = false;
            pendingDialogTimerRef.current = window.setTimeout(() => {
              pendingDialogTimerRef.current = null;
              setSaveOpen(true);
            }, 0);
          }
        }}
      >
        <DropdownMenuTrigger
          render={
            <Button
              variant="outline"
              size="sm"
              aria-label={`Сохранённый вид: ${current}`}
            />
          }
        >
          <Bookmark data-icon="inline-start" aria-hidden="true" />
          <span className="max-w-40 truncate">{current}</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Сохранённые представления</DropdownMenuLabel>
            {savedViews.map((view) => (
              <DropdownMenuItem
                key={view.id}
                render={
                  <Link
                    href={view.href}
                    {...reportPageLocalLinkProps(view.href)}
                  />
                }
                nativeButton={false}
              >
                <span className="min-w-0 flex-1 truncate">{view.name}</span>
                {view.href === currentHref ? (
                  <Check aria-hidden="true" />
                ) : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
          {savedViews.length > 0 ? <DropdownMenuSeparator /> : null}
          <DropdownMenuGroup>
            <DropdownMenuLabel>Базовые виды</DropdownMenuLabel>
            {presetViews.map((view) => (
              <DropdownMenuItem
                key={view.href}
                render={
                  <Link
                    href={view.href}
                    {...reportPageLocalLinkProps(view.href)}
                  />
                }
                nativeButton={false}
              >
                {view.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem
              onClick={() => {
                pendingSaveRef.current = true;
              }}
            >
              Сохранить текущий вид
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent initialFocus={nameInputRef}>
          <DialogHeader>
            <DialogTitle>Сохранить текущий вид</DialogTitle>
            <DialogDescription>
              Сохраните текущий период, сравнение и фильтры без выбранного
              фрагмента данных.
            </DialogDescription>
          </DialogHeader>
          <form action={createSavedReportView}>
            <input type="hidden" name="href" value={currentHref} />
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="saved-view-name">Название</FieldLabel>
                <Input
                  id="saved-view-name"
                  ref={nameInputRef}
                  name="name"
                  required
                  autoFocus
                  placeholder="Например, HIGH+ за квартал"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="saved-view-scope">Доступ</FieldLabel>
                <NativeSelect
                  id="saved-view-scope"
                  name="scope"
                  defaultValue="private"
                >
                  <NativeSelectOption value="private">
                    Только мне
                  </NativeSelectOption>
                  <NativeSelectOption value="shared">Всем</NativeSelectOption>
                </NativeSelect>
              </Field>
              <ValidatedSubmitButton>Сохранить</ValidatedSubmitButton>
            </FieldGroup>
          </form>
          {savedViews.length > 0 ? (
            <>
              <Separator />
              <section
                aria-labelledby="saved-view-management-title"
                className="flex flex-col gap-2"
              >
                <h3
                  id="saved-view-management-title"
                  className="text-sm font-medium"
                >
                  Управление представлениями
                </h3>
                {savedViews.map((view) => (
                  <div
                    key={view.id}
                    className="flex min-w-0 items-center justify-between gap-2"
                  >
                    <span className="truncate text-sm">{view.name}</span>
                    <form action={deleteSavedReportView}>
                      <input type="hidden" name="id" value={view.id} />
                      <Button
                        type="submit"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Удалить представление ${view.name}`}
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </form>
                  </div>
                ))}
              </section>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
