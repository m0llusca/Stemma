"use client";

import type { ComponentPropsWithoutRef } from "react";

type ConfirmSubmitButtonProps = Omit<ComponentPropsWithoutRef<"button">, "type"> & {
  /** Текст подтверждения с описанием последствий необратимого действия. */
  confirmMessage: string;
};

/**
 * Сабмит-кнопка для деструктивных действий (отзыв ключа, удаление источника,
 * удаление критерия): требует явного подтверждения перед отправкой формы.
 * Единый паттерн защиты от случайного клика по необратимой операции.
 */
export function ConfirmSubmitButton({ confirmMessage, children, onClick, ...buttonProps }: ConfirmSubmitButtonProps) {
  return (
    <button
      type="submit"
      {...buttonProps}
      onClick={(event) => {
        if (!window.confirm(confirmMessage)) {
          event.preventDefault();
          return;
        }

        onClick?.(event);
      }}
    >
      {children}
    </button>
  );
}
