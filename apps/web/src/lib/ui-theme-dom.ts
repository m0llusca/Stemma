import {
  appearanceRootProps,
  managedUiAppearanceCssVariableNames
} from "@/lib/ui-theme-root";
import type { UiAppearance } from "@/lib/ui-theme";

export function syncUiAppearanceToDocument(
  root: HTMLElement,
  appearance: UiAppearance
) {
  const rootProps = appearanceRootProps(appearance);

  root.dataset.theme = rootProps["data-theme"];
  root.dataset.density = rootProps["data-density"];
  root.dataset.corners = rootProps["data-corners"];
  root.dataset.contrast = rootProps["data-contrast"];
  root.classList.toggle("dark", rootProps.className === "dark");
  root.style.colorScheme = rootProps.style.colorScheme;

  for (const cssVariable of managedUiAppearanceCssVariableNames) {
    root.style.removeProperty(cssVariable);
  }

  for (const [property, value] of Object.entries(rootProps.style)) {
    if (property.startsWith("--")) {
      root.style.setProperty(property, value);
    }
  }
}
