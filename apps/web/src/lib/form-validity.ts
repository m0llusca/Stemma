export type FormSubmitGate = {
  minCheckedNames?: string[];
  requireAnyValueNames?: string[];
};

function hasCheckedInput(form: HTMLFormElement, name: string) {
  return form.querySelectorAll(`input[name="${name}"]:checked`).length > 0;
}

function isValueControl(control: unknown): control is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement {
  return (
    control instanceof HTMLInputElement ||
    control instanceof HTMLSelectElement ||
    control instanceof HTMLTextAreaElement
  );
}

function hasNamedValue(form: HTMLFormElement, name: string) {
  const control = form.elements.namedItem(name);

  if (!control) {
    return false;
  }

  if (control instanceof RadioNodeList) {
    return Array.from(control).some((item) => controlHasValue(item));
  }

  return controlHasValue(control);
}

function controlHasValue(control: unknown) {
  if (!isValueControl(control)) {
    return false;
  }

  if (control instanceof HTMLInputElement && (control.type === "checkbox" || control.type === "radio")) {
    return control.checked;
  }

  return control.value.trim().length > 0;
}

export function hasAnyNamedValue(form: HTMLFormElement, names: string[]) {
  return names.length === 0 || names.some((name) => hasNamedValue(form, name));
}

export function isFormReadyToSubmit(form: HTMLFormElement, gate: FormSubmitGate = {}) {
  const minCheckedNames = gate.minCheckedNames ?? [];
  const requireAnyValueNames = gate.requireAnyValueNames ?? [];

  return (
    form.checkValidity() &&
    minCheckedNames.every((name) => hasCheckedInput(form, name)) &&
    hasAnyNamedValue(form, requireAnyValueNames)
  );
}

function isFocusableControl(element: HTMLElement) {
  if (element instanceof HTMLFieldSetElement) {
    return false;
  }

  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLButtonElement ||
    element.tabIndex >= 0
  );
}

function firstNamedControl(form: HTMLFormElement, name: string): HTMLElement | null {
  const control = form.elements.namedItem(name);

  if (!control) {
    return null;
  }

  if (control instanceof RadioNodeList) {
    const first = control.item(0);
    return first instanceof HTMLElement ? first : null;
  }

  return control instanceof HTMLElement ? control : null;
}

export function firstInvalidControl(form: HTMLFormElement, gate: FormSubmitGate = {}): HTMLElement | null {
  const invalid = Array.from(form.querySelectorAll<HTMLElement>(":invalid")).find(isFocusableControl);

  if (invalid) {
    return invalid;
  }

  for (const name of gate.minCheckedNames ?? []) {
    if (!hasCheckedInput(form, name)) {
      const control = firstNamedControl(form, name);
      if (control) {
        return control;
      }
    }
  }

  for (const name of gate.requireAnyValueNames ?? []) {
    if (!hasNamedValue(form, name)) {
      const control = firstNamedControl(form, name);
      if (control) {
        return control;
      }
    }
  }

  return null;
}

function openCollapsibleHost(host: HTMLElement) {
  if (host instanceof HTMLDetailsElement) {
    if (!host.open) {
      host.open = true;
    }
    return;
  }

  const trigger = host.querySelector<HTMLElement>("[data-slot='collapsible-trigger']");
  if (trigger?.getAttribute("aria-expanded") === "false") {
    trigger.click();
  }
}

export function revealCollapsedAncestors(control: HTMLElement) {
  let host: HTMLElement | null = control;

  while (host) {
    if (
      host instanceof HTMLDetailsElement ||
      host.getAttribute("data-slot") === "collapsible" ||
      host.hasAttribute("data-criterion-card")
    ) {
      openCollapsibleHost(host);
    }

    host = host.parentElement;
  }
}

export function focusFirstInvalidControl(form: HTMLFormElement, gate: FormSubmitGate = {}): HTMLElement | null {
  const control = firstInvalidControl(form, gate);

  if (!control) {
    return null;
  }

  revealCollapsedAncestors(control);

  if (typeof control.scrollIntoView === "function") {
    control.scrollIntoView({ block: "nearest" });
  }

  control.focus();
  return control;
}

export function announceToLiveRegion(region: HTMLElement, message: string) {
  region.textContent = "";
  void region.offsetHeight;
  region.textContent = message;
}
