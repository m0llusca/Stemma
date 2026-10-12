"use client";

import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { useGroupRef, type Layout, type LayoutChangedMeta } from "react-resizable-panels";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";

const STORAGE_KEY = "stemma:review-workbench:layout";
const INITIAL_LAYOUT = { "review-dialog": 50, "review-score": 50 };
const NARROW_QUERY = "(max-width: 1023px)";

function subscribeViewport(onChange: () => void) {
  const media = window.matchMedia?.(NARROW_QUERY);
  media?.addEventListener("change", onChange);
  return () => media?.removeEventListener("change", onChange);
}

function isNarrowViewport() {
  return window.matchMedia?.(NARROW_QUERY).matches ?? true;
}

function readLayout(): Layout | undefined {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Object.keys(value).length !== 2) return;
    const layout = value as Layout;
    const dialog = layout["review-dialog"];
    const score = layout["review-score"];
    if (Number.isFinite(dialog) && Number.isFinite(score) && dialog > 0 && score > 0 && Math.abs(dialog + score - 100) < 0.01) {
      return layout;
    }
  } catch {
    // Layout preferences are optional when storage is blocked or corrupted.
  }
}

function saveLayout(layout: Layout, { isUserInteraction }: LayoutChangedMeta) {
  if (!isUserInteraction) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // The workbench remains usable without persistent browser storage.
  }
}

/** One mounted transcript/form tree: resizing and mobile switching retain drafts. */
export function WorkbenchLayout({ dialog, score }: { dialog: ReactNode; score: ReactNode }) {
  const groupRef = useGroupRef();
  const narrow = useSyncExternalStore(subscribeViewport, isNarrowViewport, () => true);

  useEffect(() => {
    if (narrow) return;
    const layout = readLayout();
    if (layout) groupRef.current?.setLayout(layout);
  }, [groupRef, narrow]);

  return (
    <ResizablePanelGroup
      id="review-workbench-panels"
      data-slot="master-detail"
      orientation="horizontal"
      groupRef={groupRef}
      defaultLayout={INITIAL_LAYOUT}
      onLayoutChanged={saveLayout}
      disabled={narrow}
      resizeTargetMinimumSize={{ coarse: 36, fine: 16 }}
      className="min-w-0 scroll-mt-[calc(var(--app-topbar-height)+1rem)] gap-3 lg:!h-[calc(100dvh-var(--app-topbar-height)-3rem)] max-lg:!block max-lg:!h-auto max-lg:!overflow-visible max-lg:[&>[data-panel]]:!w-full max-lg:[&>[data-panel]]:!flex-none"
    >
      <ResizablePanel
        id="review-dialog"
        data-slot="master-detail-list"
        defaultSize="50%"
        minSize={320}
        className="min-w-0 !overflow-visible max-lg:!max-h-none"
      >
        <WorkbenchScrollArea label="Диалог обращения">{dialog}</WorkbenchScrollArea>
      </ResizablePanel>
      <ResizableHandle withHandle aria-label="Ширина диалога и оценки" className="max-lg:hidden" />
      <ResizablePanel
        id="review-score"
        data-slot="master-detail-detail"
        defaultSize="50%"
        minSize={380}
        className="min-w-0 !overflow-visible max-lg:!max-h-none"
      >
        <WorkbenchScrollArea label="Оценка обращения">{score}</WorkbenchScrollArea>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

function WorkbenchScrollArea({ label, children }: { label: string; children: ReactNode }) {
  return (
    <ScrollArea
      role="region"
      aria-label={label}
      className="h-full min-w-0 max-lg:h-auto max-lg:[&>[data-slot=scroll-area-viewport]]:!overflow-visible max-lg:[&>[data-slot=scroll-area-viewport]]:!h-auto max-lg:[&>[data-slot=scroll-area-scrollbar]]:hidden"
    >
      <div className="min-w-0 pb-1 lg:pr-3">{children}</div>
    </ScrollArea>
  );
}
