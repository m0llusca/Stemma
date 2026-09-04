"use client";

import { ArrowRight, ChevronDown } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

export type QueueNextCasePreviewProps = {
  subject: string;
  description: string;
  openHref: string;
  /** Expanded context: score, priority reason, signal grid. */
  children: ReactNode;
};

/**
 * «Следующий кейс» preview — collapsed by default (contract:
 * docs/ux-queue-hotkeys-contract.md). Power users keep the open CTA; expand for
 * priority / signal context. Does not own Take-next eligibility.
 */
export function QueueNextCasePreview({
  subject,
  description,
  openHref,
  children
}: QueueNextCasePreviewProps) {
  return (
    <Card className="h-full gap-0 overflow-clip py-0" data-slot="queue-next-case-preview">
      <Collapsible className="group/preview flex h-full min-w-0 flex-col">
        <CardHeader className="gap-1.5 border-b border-border">
          <CollapsibleTrigger className="flex w-full cursor-pointer items-start justify-between gap-3 bg-transparent p-0 text-left outline-none focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-ring/50">
            <div className="min-w-0">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Следующий кейс
              </span>
              <CardTitle className="mt-1 text-base leading-snug">{subject}</CardTitle>
            </div>
            <span
              className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-md text-primary transition-transform duration-150 group-data-open/preview:rotate-180"
              aria-hidden="true"
            >
              <ChevronDown className="size-4" />
            </span>
          </CollapsibleTrigger>
          <CardDescription>{description}</CardDescription>
          <Button
            render={<Link href={openHref} />}
            nativeButton={false}
            className="mt-1 w-full"
          >
            Открыть приоритетный кейс
            <ArrowRight size={15} aria-hidden="true" data-icon="inline-end" />
          </Button>
        </CardHeader>

        <CollapsibleContent keepMounted={false} className="min-w-0 data-closed:hidden">
          <CardContent className="flex flex-col gap-4 py-4">{children}</CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
