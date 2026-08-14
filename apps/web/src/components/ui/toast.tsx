"use client";

import {
  createContext,
  useContext,
  useMemo,
  type ReactNode
} from "react";
import { toast as sonnerToast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import type { ToastInput } from "@/lib/ui/toast-store";

type ToastApi = {
  show: (input: ToastInput) => string;
  success: (message: string, options?: Omit<ToastInput, "tone" | "message">) => string;
  error: (message: string, options?: Omit<ToastInput, "tone" | "message">) => string;
  dismiss: (id: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

function pushToast(input: ToastInput): string {
  const description = input.title ? input.message : undefined;
  const message = input.title ?? input.message;
  const opts = {
    description,
    duration: input.duration === 0 ? Infinity : input.duration
  };

  if (input.tone === "error") {
    return String(sonnerToast.error(message, opts));
  }
  if (input.tone === "success") {
    return String(sonnerToast.success(message, opts));
  }
  return String(sonnerToast(message, opts));
}

/**
 * Root toast provider — mounts shadcn/sonner Toaster and exposes useToast().
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const api = useMemo<ToastApi>(
    () => ({
      show: (input) => pushToast(input),
      success: (message, options) => pushToast({ ...options, tone: "success", message }),
      error: (message, options) => pushToast({ ...options, tone: "error", message }),
      dismiss: (id) => {
        sonnerToast.dismiss(id);
      }
    }),
    []
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <Toaster richColors closeButton position="top-right" />
    </ToastContext.Provider>
  );
}

/**
 * Imperative toast API. Must be called under a {@link ToastProvider}.
 */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (api === null) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return api;
}
