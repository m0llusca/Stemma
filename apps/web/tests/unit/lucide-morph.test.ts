import { describe, expect, it } from "vitest";
import { Check, ChevronDown, Copy, Menu, X } from "lucide-react";
import { asMorphIcon } from "@/lib/ui/lucide-morph";

describe("asMorphIcon", () => {
  it("unwraps lucide-react components into a flat IconNode", () => {
    const node = asMorphIcon(Menu);
    expect(Array.isArray(node)).toBe(true);
    expect(typeof node).not.toBe("string");
    if (typeof node === "string") {
      return;
    }
    expect(node[0]?.[0]).toBe("line");
    expect(node.some((item) => item[0] === "svg")).toBe(false);
  });

  it("passes a raw d string through", () => {
    expect(asMorphIcon("M4 6h16")).toBe("M4 6h16");
  });

  it("keeps the Copy/Check and Menu/X pairs morphable", () => {
    for (const icon of [Copy, Check, Menu, X, ChevronDown]) {
      const node = asMorphIcon(icon);
      expect(Array.isArray(node)).toBe(true);
    }
  });

  it("rejects objects that are not lucide-react icons", () => {
    expect(() => asMorphIcon({ displayName: "Menu" })).toThrow(/Lucide IconNode/);
  });
});
