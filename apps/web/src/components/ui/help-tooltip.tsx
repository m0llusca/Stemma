"use client";

import { CircleHelp } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type HelpTooltipPlacement = "top" | "top-start" | "top-end";

/**
 * Help icon + tooltip composed from base-ui Tooltip (shadcn wrapper).
 * Uses TooltipTrigger `render` to compose with Button — positioning/portal
 * come from base-ui, not manual createPortal/fixed math.
 *
 * Tooltip chrome mounts after the client effect so Trigger/Portal attributes
 * do not mismatch the SSR HTML on /admin/tokens.
 */
export function HelpTooltip({
  label,
  content,
  className,
  placement = "top"
}: {
  label: string;
  content: ReactNode;
  className?: string;
  placement?: HelpTooltipPlacement;
}) {
  const side = "top" as const;
  const align = placement === "top-start" ? "start" : placement === "top-end" ? "end" : "center";
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const triggerButton = (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      className={cn("text-muted-foreground", className)}
      data-placement={placement}
    >
      <CircleHelp aria-hidden="true" />
      {/*
        The label lives as real (visually hidden) button content, not only
        aria-label: an icon-only ghost trigger has no background, border, or
        text, so contrast tooling finds zero measurable identifier and
        reports 0:1. With the label in content, the measured foreground is
        the button's text-muted-foreground — the icon's own currentColor.
      */}
      <span className="sr-only">{label}</span>
    </Button>
  );

  if (!mounted) {
    return triggerButton;
  }

  return (
    <Tooltip>
      <TooltipTrigger
        delay={0}
        closeDelay={120}
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className={cn("text-muted-foreground", className)}
            data-placement={placement}
          />
        }
      >
        <CircleHelp aria-hidden="true" />
        <span className="sr-only">{label}</span>
      </TooltipTrigger>
      <TooltipContent side={side} align={align} className="max-w-xs text-left" role="tooltip">
        {content}
      </TooltipContent>
    </Tooltip>
  );
}
