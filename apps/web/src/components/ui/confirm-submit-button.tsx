"use client";

import type { ComponentPropsWithoutRef } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

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

  return (
    <Button
      type={type}
      variant="destructive"
      {...buttonProps}
      disabled={disabled || pending}
      className={cn(className)}
      onClick={(event) => {
        if (!window.confirm(confirmMessage)) {
          event.preventDefault();
          return;
        }

        onClick?.(event);
      }}
    >
      {pending ? <Spinner data-icon="inline-start" className="size-3.5" /> : null}
      {children}
    </Button>
  );
}
