"use client";

import { Inbox, X } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * Brief, dismissible "queue is empty" banner shown when `takeNext` (or
 * "завершить и взять следующий") finds nothing left to grade and redirects to
 * `/reviews?empty=1`. Rendered only when the param is present; the reviewer can
 * dismiss it, and dismissing also strips `empty` from the URL so a refresh does
 * not bring the banner back.
 */
export function QueueEmptyBanner() {
  const [visible, setVisible] = useState(true);

  // Defensive: if the page ever renders this with the param already gone, hide.
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    if (!params.has("empty")) {
      setVisible(false);
    }
  }, []);

  function dismiss() {
    setVisible(false);

    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("empty");
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    }
  }

  if (!visible) {
    return null;
  }

  return (
    <div className="queue-empty-banner" role="status">
      <span className="queue-empty-banner__icon" aria-hidden="true">
        <Inbox size={18} />
      </span>
      <p className="queue-empty-banner__text">Свободных обращений в очереди нет.</p>
      <button
        type="button"
        className="queue-empty-banner__close"
        onClick={dismiss}
        aria-label="Скрыть уведомление"
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
