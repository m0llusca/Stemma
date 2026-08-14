"use client";

import type { ReactNode, RefObject } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  triggerRef?: RefObject<HTMLElement | null>;
  className?: string;
};

/**
 * Domain modal API backed by shadcn Dialog (Base UI).
 * Keeps existing call sites; focus management and a11y come from Dialog.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className
}: ModalProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
    >
      <DialogContent className={cn(className)}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description != null ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {children != null ? <div className="flex flex-col gap-4">{children}</div> : null}
        {footer != null ? <DialogFooter>{footer}</DialogFooter> : null}
      </DialogContent>
    </Dialog>
  );
}

export function ModalCloseButton({ onClick, label = "Закрыть" }: { onClick?: () => void; label?: string }) {
  return (
    <Button type="button" variant="outline" onClick={onClick}>
      {label}
    </Button>
  );
}
