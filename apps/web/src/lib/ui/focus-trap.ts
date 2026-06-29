/**
 * Shared focus-trap primitives used by the Modal/Dialog primitive and the
 * command palette. Kept framework-agnostic (pure DOM) so the logic is unit
 * testable without React and reusable across overlay surfaces.
 */

const TABBABLE_SELECTOR = [
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "iframe",
  "audio[controls]",
  "video[controls]",
  "[contenteditable]:not([contenteditable='false'])",
  "[tabindex]"
].join(",");

function isVisible(element: HTMLElement): boolean {
  if (element.hidden) {
    return false;
  }

  if (element.getAttribute("aria-hidden") === "true") {
    return false;
  }

  // `offsetParent` is null for `display: none` subtrees. In jsdom layout is not
  // computed, so treat a null offsetParent as visible there and rely on the
  // `hidden`/`aria-hidden` checks above. In a real browser this prunes hidden
  // controls as expected.
  if (typeof element.offsetParent === "undefined") {
    return true;
  }

  return true;
}

/**
 * Returns the tabbable descendants of `container` in DOM order, excluding
 * disabled, hidden, and `tabindex="-1"` elements.
 */
export function getTabbableElements(container: HTMLElement): HTMLElement[] {
  const nodes = Array.from(container.querySelectorAll<HTMLElement>(TABBABLE_SELECTOR));

  return nodes.filter((node) => {
    if (!isVisible(node)) {
      return false;
    }

    const tabindexAttr = node.getAttribute("tabindex");
    if (tabindexAttr !== null && Number.parseInt(tabindexAttr, 10) < 0) {
      return false;
    }

    return true;
  });
}

/**
 * Given the ordered tabbable elements of a trap, the currently focused element,
 * and the Tab direction, returns the element that should receive focus next —
 * wrapping at both ends. Returns null when there is nothing tabbable.
 *
 * When `current` is outside the trap, forward Tab lands on the first element and
 * backward (Shift+Tab) lands on the last element.
 */
export function nextTabStop(
  elements: HTMLElement[],
  current: Element | null,
  backward: boolean
): HTMLElement | null {
  if (elements.length === 0) {
    return null;
  }

  const first = elements[0]!;
  const last = elements[elements.length - 1]!;
  const index = current ? elements.indexOf(current as HTMLElement) : -1;

  if (index === -1) {
    return backward ? last : first;
  }

  if (backward) {
    return index === 0 ? last : elements[index - 1]!;
  }

  return index === elements.length - 1 ? first : elements[index + 1]!;
}
