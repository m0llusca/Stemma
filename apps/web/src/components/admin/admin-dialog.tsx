"use client";

import { X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";

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
 * Лёгкое всплывающее окно настроек на нативном <dialog>: браузерный focus
 * trap, Esc и затемнение бесплатно. Заменяет секции-вкладки для коротких форм
 * (создание ключа, правила, пользователя, расписания) — список остаётся на
 * экране, контекст не теряется. Содержимое (children) приходит с сервера,
 * поэтому формы с server actions работают без изменений.
 */
export function AdminDialog({
  triggerLabel,
  triggerClassName = "action-button action-button--primary",
  title,
  description,
  defaultOpen = false,
  wide = false,
  children
}: AdminDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(defaultOpen);
  const titleId = useId();

  // Нативный showModal (недоступен в jsdom) с фолбэком на атрибут open.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !open) {
      return;
    }

    if (typeof dialog.showModal === "function" && !dialog.hasAttribute("open")) {
      dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
  }, [open]);

  const close = useCallback(() => {
    const dialog = dialogRef.current;
    if (dialog && typeof dialog.close === "function") {
      dialog.close();
    }
    setOpen(false);

    // Deep-link ?section=create: после закрытия возвращаем чистый адрес,
    // иначе повторное открытие/обновление снова показывает форму.
    if (defaultOpen && typeof window !== "undefined" && window.location.search) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [defaultOpen]);

  return (
    <>
      <button type="button" className={triggerClassName} onClick={() => setOpen(true)}>
        {triggerLabel}
      </button>
      {open ? (
        <dialog
          ref={dialogRef}
          className={`admin-dialog ${wide ? "admin-dialog--wide" : ""}`}
          aria-labelledby={titleId}
          onClose={close}
          onMouseDown={(event) => {
            // Клик по подложке (сам <dialog> вне панели) закрывает окно.
            if (event.target === event.currentTarget) {
              close();
            }
          }}
        >
          <div className="admin-dialog__panel">
            <header className="admin-dialog__header">
              <div className="admin-dialog__heading">
                <h2 id={titleId} className="admin-dialog__title">{title}</h2>
                {description ? <p className="admin-dialog__description">{description}</p> : null}
              </div>
              <button type="button" className="admin-dialog__close" aria-label="Закрыть окно" onClick={close}>
                <X size={16} aria-hidden="true" />
              </button>
            </header>
            <div className="admin-dialog__body">{children}</div>
          </div>
        </dialog>
      ) : null}
    </>
  );
}
