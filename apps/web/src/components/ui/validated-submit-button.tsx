"use client";

import { useEffect, useRef, useState, type ComponentPropsWithoutRef } from "react";

type ValidatedSubmitButtonProps = Omit<ComponentPropsWithoutRef<"button">, "type"> & {
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
  return names.length === 0 || names.some((name) => {
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
  });
}

export function ValidatedSubmitButton({
  children,
  className = "action-button action-button--primary",
  minCheckedNames = [],
  requireAnyValueNames = [],
  disabled,
  ...buttonProps
}: ValidatedSubmitButtonProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [canSubmit, setCanSubmit] = useState(false);
  const minCheckedKey = minCheckedNames.join("\u0000");
  const anyValueKey = requireAnyValueNames.join("\u0000");

  useEffect(() => {
    const form = buttonRef.current?.form;

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
    <button ref={buttonRef} type="submit" className={className} disabled={disabled || !canSubmit} {...buttonProps}>
      {children}
    </button>
  );
}
