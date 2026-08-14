"use client";

import { X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type AdminDialogProps = {
  /** Подпись кнопки-триггера (например «Новый ключ»). */
  triggerLabel: ReactNode;
  triggerClassName?: string;
  title: string;
  description?: string;
  /**
   * Открыть окно сразу при монтировании — для deep-link'ов вида
   * ?section=create: страница рендерит диалог открытым, ссылка не ломается.
   * При закрытии query-хвост убирается из адреса, чтобы триггер работал снова.
   */
  defaultOpen?: boolean;
  /** Широкий вариант для длинных форм (конструктор формы оценки). */
  wide?: boolean;
  children: ReactNode;
};

/**
 * Admin settings dialog on shadcn Dialog (Base UI).
 * Replaces native <dialog> + BEM so modals work without unimported 40-admin.css.
 * Children stay server-rendered forms with server actions intact.
 */
export function AdminDialog({
  triggerLabel,
  triggerClassName,
  title,
  description,
  defaultOpen = false,
  wide = false,
  children
}: AdminDialogProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Deep-link ?section=create: clear query on close so reopen works.
        if (!next && defaultOpen && typeof window !== "undefined" && window.location.search) {
          window.history.replaceState(null, "", window.location.pathname);
        }
      }}
    >
      <DialogTrigger render={<Button type="button" className={cn(triggerClassName)} />}>
        {triggerLabel}
      </DialogTrigger>
      <DialogContent
        className={cn(
          "max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)] gap-4 overflow-hidden",
          wide ? "sm:max-w-3xl" : "sm:max-w-lg"
        )}
        showCloseButton={false}
      >
        <DialogHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pr-8">
          <div className="flex min-w-0 flex-col gap-1.5">
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </div>
          <DialogClose
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="absolute top-2 right-2"
                aria-label="Закрыть окно"
              />
            }
          >
            <X aria-hidden="true" />
          </DialogClose>
        </DialogHeader>
        <div
          data-slot="admin-dialog-body"
          className="min-h-0 overflow-y-auto overscroll-contain"
        >
          <div className="flex flex-col gap-4">{children}</div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
