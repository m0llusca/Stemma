"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import { toast as sonnerToast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import type { ToastInput } from "@/lib/ui/toast-store";

export type ToastTheme = "light" | "dark";

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
 * Toaster chrome waits for the client effect: Sonner reads `document.dir` /
 * theme on first render (`data-sonner-theme`, `dir`) and mismatches SSR.
 */
export function ToastProvider({
  children,
  theme = "light"
}: {
  children: ReactNode;
  theme?: ToastTheme;
}) {
  const [mounted, setMounted] = useState(false);
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

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {mounted ? (
        <Toaster theme={theme} richColors closeButton position="top-right" offset={64} />
      ) : null}
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

/** Same API when a provider exists; `null` in isolated unit trees (timeline, draft store). */
export function useToastOptional(): ToastApi | null {
  return useContext(ToastContext);
}
