"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";

/**
 * Create-user dialog with deep-link support (?section=create / ?create=1).
 * Clears the query string on close so reopening the trigger works without a
 * forced re-mount. Server-rendered form children keep server actions intact.
 */
export function CreateUserDialog({
  defaultOpen = false,
  triggerLabel,
  title,
  description,
  children
}: {
  defaultOpen?: boolean;
  triggerLabel: ReactNode;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next && defaultOpen && typeof window !== "undefined" && window.location.search) {
          window.history.replaceState(null, "", window.location.pathname);
        }
      }}
    >
      <DialogTrigger render={<Button className="gap-1.5" />}>{triggerLabel}</DialogTrigger>
      <DialogContent className="sm:max-w-3xl" showCloseButton>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
