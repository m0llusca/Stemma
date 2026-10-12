"use client";

import { useEffect, useRef, useState, type ComponentPropsWithoutRef } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from "@/components/ui/alert-dialog";

type ConfirmSubmitButtonProps = Omit<ComponentPropsWithoutRef<typeof Button>, "type"> & {
  /** Текст подтверждения с описанием последствий необратимого действия. */
  confirmMessage: string;
  /** По умолчанию type="submit"; для внеформенных действий передайте type="button". */
  type?: "submit" | "button" | "reset";
};

/**
 * Сабмит-кнопка для деструктивных действий (отзыв ключа, удаление источника,
 * удаление критерия): требует явного подтверждения перед отправкой формы.
 * Единый паттерн защиты от случайного клика по необратимой операции.
 */
export function ConfirmSubmitButton({
  confirmMessage,
  children,
  onClick,
  type = "submit",
  className,
  disabled,
  ...buttonProps
}: ConfirmSubmitButtonProps) {
  const { pending } = useFormStatus();
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmedClick = useRef(false);
  const confirming = useRef(false);

  useEffect(() => setReady(true), []);

  function confirm() {
    const button = buttonRef.current;
    if (!open || confirming.current || !button || button.disabled) return;
    confirming.current = true;
    setOpen(false);
    try {
      // Re-dispatch the original button click: its fresh event, validation,
      // submitter name/value and formAction must survive the confirmation.
      confirmedClick.current = true;
      button.click();
    } finally {
      confirmedClick.current = false;
      confirming.current = false;
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <Button
        ref={buttonRef}
        type={type}
        variant="destructive"
        {...buttonProps}
        disabled={disabled || pending || !ready}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-busy={pending || !ready}
        className={cn(className)}
        onClick={(event) => {
          if (confirmedClick.current) {
            confirmedClick.current = false;
            onClick?.(event);
            return;
          }
          event.preventDefault();
          const button = buttonRef.current;
          if (type === "submit" && button?.form && !button.formNoValidate && !button.form.noValidate && !button.form.reportValidity()) return;
          setOpen(true);
        }}
      >
        {pending ? <Spinner data-icon="inline-start" className="size-3.5" /> : null}
        {children}
      </Button>
      <AlertDialogContent initialFocus={cancelRef} finalFocus={buttonRef}>
        <AlertDialogHeader>
          <AlertDialogTitle>Подтвердите действие</AlertDialogTitle>
          <AlertDialogDescription>{confirmMessage}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel ref={cancelRef} type="button">Отмена</AlertDialogCancel>
          <AlertDialogAction type="button" variant="destructive" disabled={pending || !open} onClick={confirm}>
            Подтвердить
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
