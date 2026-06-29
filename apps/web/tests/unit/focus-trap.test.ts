import { afterEach, describe, expect, it } from "vitest";
import { getTabbableElements, nextTabStop } from "@/lib/ui/focus-trap";

function mount(html: string) {
  const container = document.createElement("div");
  container.innerHTML = html;
  document.body.appendChild(container);
  return container;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("getTabbableElements", () => {
  it("collects focusable elements in DOM order and skips disabled/hidden ones", () => {
    const container = mount(`
      <button id="a">A</button>
      <button id="b" disabled>B</button>
      <a id="c" href="/x">C</a>
      <input id="d" />
      <div id="e" tabindex="0">E</div>
      <div id="f" tabindex="-1">F</div>
      <input id="g" hidden />
    `);

    const ids = getTabbableElements(container).map((node) => node.id);
    expect(ids).toEqual(["a", "c", "d", "e"]);
  });

  it("returns an empty list when nothing is tabbable", () => {
    const container = mount(`<p>no controls</p>`);
    expect(getTabbableElements(container)).toEqual([]);
  });
});

describe("nextTabStop", () => {
  it("wraps from the last element to the first on a forward Tab", () => {
    const container = mount(`
      <button id="a">A</button>
      <button id="b">B</button>
      <button id="c">C</button>
    `);
    const elements = getTabbableElements(container);
    const last = container.querySelector<HTMLElement>("#c")!;

    expect(nextTabStop(elements, last, false)?.id).toBe("a");
  });

  it("wraps from the first element to the last on a backward (shift) Tab", () => {
    const container = mount(`
      <button id="a">A</button>
      <button id="b">B</button>
      <button id="c">C</button>
    `);
    const elements = getTabbableElements(container);
    const first = container.querySelector<HTMLElement>("#a")!;

    expect(nextTabStop(elements, first, true)?.id).toBe("c");
  });

  it("moves to the first element when focus is currently outside the trap", () => {
    const container = mount(`
      <button id="a">A</button>
      <button id="b">B</button>
    `);
    const elements = getTabbableElements(container);
    const outside = document.createElement("button");

    expect(nextTabStop(elements, outside, false)?.id).toBe("a");
    expect(nextTabStop(elements, outside, true)?.id).toBe("b");
  });

  it("returns null when there are no tabbable elements", () => {
    expect(nextTabStop([], document.createElement("button"), false)).toBeNull();
  });
});
