"use client";

import { useEffect, useRef, useState, type ComponentPropsWithoutRef } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

type ValidatedSubmitButtonProps = Omit<ComponentPropsWithoutRef<typeof Button>, "type"> & {
  minCheckedNames?: string[];
  requireAnyValueNames?: string[];
};

function hasCheckedInput(form: HTMLFormElement, name: string) {
  return form.querySelectorAll(`input[name="${name}"]:checked`).length > 0;
}

function isValueControl(control: unknown): control is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement {
  return control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement;
}

function hasAnyNamedValue(form: HTMLFormElement, names: string[]) {
  return (
    names.length === 0 ||
    names.some((name) => {
      const control = form.elements.namedItem(name);

      if (!control) {
        return false;
      }

      if (control instanceof RadioNodeList) {
        return Array.from(control).some((item) => {
          if (!isValueControl(item)) {
            return false;
          }

          if (item instanceof HTMLInputElement && (item.type === "checkbox" || item.type === "radio")) {
            return item.checked;
          }

          return item.value.trim().length > 0;
        });
      }

      if (isValueControl(control)) {
        if (control instanceof HTMLInputElement && (control.type === "checkbox" || control.type === "radio")) {
          return control.checked;
        }

        return control.value.trim().length > 0;
      }

      return false;
    })
  );
}

export function ValidatedSubmitButton({
  children,
  className,
  minCheckedNames = [],
  requireAnyValueNames = [],
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
      const hasRequiredChecks = minCheckedNames.every((name) => hasCheckedInput(form, name));
      setCanSubmit(form.checkValidity() && hasRequiredChecks && hasAnyNamedValue(form, requireAnyValueNames));
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
  }, [minCheckedKey, anyValueKey]);

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
