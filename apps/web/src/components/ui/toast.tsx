"use client";

import { X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode
} from "react";
import {
  createToastStore,
  type ToastInput,
  type ToastStore
} from "@/lib/ui/toast-store";

type ToastApi = {
  /** Push an arbitrary toast. Returns the toast id. */
  show: (input: ToastInput) => string;
  /** Convenience: push a success toast. */
  success: (message: string, options?: Omit<ToastInput, "tone" | "message">) => string;
  /** Convenience: push an error toast. */
  error: (message: string, options?: Omit<ToastInput, "tone" | "message">) => string;
  /** Dismiss a toast by id. */
  dismiss: (id: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

/**
 * Mounts the accessible, polite aria-live region and exposes the imperative
 * toast API through context. Mounted once near the root of the app. This is the
 * PRIMITIVE only — existing flows are not rewired here.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  // One store per provider instance, stable across renders.
  const storeRef = useRef<ToastStore | null>(null);
  if (storeRef.current === null) {
    storeRef.current = createToastStore();
  }
  const store = storeRef.current;

  const toasts = useSyncExternalStore(
    store.subscribe,
    store.getToasts,
    store.getToasts
  );

  const api = useMemo<ToastApi>(
    () => ({
      show: (input) => store.push(input),
      success: (message, options) => store.push({ ...options, tone: "success", message }),
      error: (message, options) => store.push({ ...options, tone: "error", message }),
      dismiss: (id) => store.dismiss(id)
    }),
    [store]
  );

  const dismiss = useCallback((id: string) => store.dismiss(id), [store]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-region" role="region" aria-label="Уведомления">
        <ol className="toast-region__list" aria-live="polite" aria-atomic="false">
          {toasts.map((toast) => (
            <li key={toast.id} className="toast" data-tone={toast.tone}>
              <div className="toast__body">
                {toast.title ? <p className="toast__title">{toast.title}</p> : null}
                <p className="toast__message">{toast.message}</p>
              </div>
              <button
                type="button"
                className="toast__close"
                aria-label="Закрыть уведомление"
                onClick={() => dismiss(toast.id)}
              >
                <X size={15} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ol>
      </div>
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
