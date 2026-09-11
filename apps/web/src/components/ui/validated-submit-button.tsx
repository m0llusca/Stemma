"use client";

import { useEffect, useRef, useState, type ComponentPropsWithoutRef } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { isFormReadyToSubmit } from "@/lib/form-validity";
import { cn } from "@/lib/utils";

type ValidatedSubmitButtonProps = Omit<ComponentPropsWithoutRef<typeof Button>, "type"> & {
  minCheckedNames?: string[];
  requireAnyValueNames?: string[];
  /** Override readiness (defaults to native checkValidity + gate). */
  isReady?: (form: HTMLFormElement) => boolean;
};

export function ValidatedSubmitButton({
  children,
  className,
  minCheckedNames = [],
  requireAnyValueNames = [],
  isReady,
  disabled,
  ...buttonProps
}: ValidatedSubmitButtonProps) {
  const hostRef = useRef<HTMLSpanElement>(null);
  const [canSubmit, setCanSubmit] = useState(false);
  const { pending } = useFormStatus();
  const minCheckedKey = minCheckedNames.join("\u0000");
  const anyValueKey = requireAnyValueNames.join("\u0000");

  useEffect(() => {
    const host = hostRef.current;
    const form = host?.closest("form") ?? host?.querySelector("button")?.form ?? null;

    if (!form) {
      return;
    }

    const update = () => {
      setCanSubmit(
        isReady
          ? isReady(form)
          : isFormReadyToSubmit(form, { minCheckedNames, requireAnyValueNames })
      );
    };

    update();
    form.addEventListener("input", update);
    form.addEventListener("change", update);
    form.addEventListener("reset", update);

    return () => {
      form.removeEventListener("input", update);
      form.removeEventListener("change", update);
      form.removeEventListener("reset", update);
    };
  }, [minCheckedKey, anyValueKey, isReady]);

  return (
    <span ref={hostRef} className="contents">
      <Button
        type="submit"
        {...buttonProps}
        className={cn(className)}
        disabled={disabled || pending || !canSubmit}
      >
        {pending ? <Spinner data-icon="inline-start" className="size-3.5" /> : null}
        {children}
      </Button>
    </span>
  );
}
