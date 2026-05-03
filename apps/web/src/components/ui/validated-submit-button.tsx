"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

type ValidatedSubmitButtonProps = {
  children: ReactNode;
  className?: string;
  minCheckedNames?: string[];
};

function hasCheckedInput(form: HTMLFormElement, name: string) {
  return form.querySelectorAll(`input[name="${name}"]:checked`).length > 0;
}

export function ValidatedSubmitButton({
  children,
  className = "action-button action-button--primary",
  minCheckedNames = []
}: ValidatedSubmitButtonProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [canSubmit, setCanSubmit] = useState(false);

  useEffect(() => {
    const form = buttonRef.current?.form;

    if (!form) {
      return;
    }

    const update = () => {
      const hasRequiredChecks = minCheckedNames.every((name) => hasCheckedInput(form, name));
      setCanSubmit(form.checkValidity() && hasRequiredChecks);
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
  }, [minCheckedNames]);

  return (
    <button ref={buttonRef} type="submit" className={className} disabled={!canSubmit}>
      {children}
    </button>
  );
}
