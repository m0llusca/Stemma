"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { MorphIcon } from "@/components/ui/morph-icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type CopyButtonProps = {
  value: string;
  label?: string;
  copiedLabel?: string;
  className?: string;
};

export function CopyButton({
  value,
  label = "Скопировать",
  copiedLabel = "Скопировано",
  className
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const resetTimerRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current);
        resetTimerRef.current = null;
      }
    };
  }, []);

  async function copyValue() {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.setAttribute("readonly", "true");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }

    if (!mountedRef.current) {
      return;
    }

    if (resetTimerRef.current !== null) {
      window.clearTimeout(resetTimerRef.current);
    }

    setCopied(true);
    resetTimerRef.current = window.setTimeout(() => {
      resetTimerRef.current = null;
      setCopied(false);
    }, 1400);
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      data-qc-motion="feedback"
      data-state={copied ? "success" : "idle"}
      onClick={copyValue}
      className={cn("gap-1.5", className)}
    >
      <MorphIcon icon={copied ? Check : Copy} data-icon="inline-start" />
      {copied ? copiedLabel : label}
    </Button>
  );
}
