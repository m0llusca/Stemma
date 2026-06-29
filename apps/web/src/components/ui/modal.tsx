"use client";

import { X } from "lucide-react";
import { createPortal } from "react-dom";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type RefObject
} from "react";
import { getTabbableElements, nextTabStop } from "@/lib/ui/focus-trap";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  /** Accessible title; rendered as the dialog heading and aria-labelledby. */
  title: ReactNode;
  /** Optional supporting description rendered under the title. */
  description?: ReactNode;
  children?: ReactNode;
  /** Right-aligned footer slot (e.g. confirm/cancel actions). */
  footer?: ReactNode;
  /**
   * Element to restore focus to on close. Defaults to whatever was focused when
   * the modal opened.
   */
  triggerRef?: RefObject<HTMLElement | null>;
  /** Extra class on the dialog panel. */
  className?: string;
};

/**
 * Accessible Modal/Dialog primitive: focus-trap, body scroll-lock, ESC-to-close,
 * backdrop click-to-close, and focus restoration to the trigger. The visible
 * focus ring comes from the global :focus-visible baseline. Styling lives in
 * `src/app/styles/components/98-primitives.css` under `.modal*`.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  triggerRef,
  className
}: ModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setPortalRoot(document.body);
  }, []);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Capture the trigger and lock body scroll while open; restore both on close.
  // ESC-to-close and the Tab focus-trap are handled with a document-level
  // listener so they work regardless of where focus currently sits.
  useEffect(() => {
    if (!open) {
      return;
    }

    previouslyFocusedRef.current =
      triggerRef?.current ?? (document.activeElement as HTMLElement | null);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Move focus into the panel.
    const panel = panelRef.current;
    if (panel) {
      const tabbable = getTabbableElements(panel);
      (tabbable[0] ?? panel).focus();
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key === "Tab") {
        const activePanel = panelRef.current;
        if (!activePanel) {
          return;
        }

        const tabbable = getTabbableElements(activePanel);
        const target = nextTabStop(tabbable, document.activeElement, event.shiftKey);
        if (target) {
          event.preventDefault();
          target.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);

    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      document.body.style.overflow = previousOverflow;
      const toRestore = triggerRef?.current ?? previouslyFocusedRef.current;
      if (toRestore && typeof toRestore.focus === "function") {
        toRestore.focus();
      }
    };
  }, [open, triggerRef]);

  if (!open || portalRoot === null) {
    return null;
  }

  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        // Only close when the press starts on the backdrop itself, so a drag
        // that ends on the backdrop (text selection) does not dismiss it.
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={panelRef}
        className={className ? `modal ${className}` : "modal"}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
      >
        <header className="modal__header">
          <div className="modal__heading">
            <h2 id={titleId} className="modal__title">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="modal__description">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className="modal__close"
            aria-label="Закрыть"
            onClick={onClose}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </header>
        {children != null ? <div className="modal__body">{children}</div> : null}
        {footer != null ? <footer className="modal__footer">{footer}</footer> : null}
      </div>
    </div>,
    portalRoot
  );
}
