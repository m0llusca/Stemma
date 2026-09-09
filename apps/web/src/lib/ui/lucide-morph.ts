import type { IconInput, IconNode } from "morphicons/react";

type LucideAttrs = Record<string, string | number>;
type LucideChild = readonly [tag: string, attrs: LucideAttrs];
/** lucide@0.x data: `["svg", attrs, children]` — not exported from the package. */
export type LucideIconNode = readonly [
  tag: string,
  attrs: LucideAttrs,
  children?: LucideChild[]
];

export type MorphableIcon = IconInput | LucideIconNode;

function isLucideTree(value: unknown): value is LucideIconNode {
  return (
    Array.isArray(value) &&
    value.length >= 3 &&
    value[0] === "svg" &&
    Array.isArray(value[2])
  );
}

function isFlatIconNode(value: unknown): value is IconNode {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    Array.isArray(value[0]) &&
    typeof value[0][0] === "string"
  );
}

/**
 * Morphicons consumes a flat Lucide `IconNode`. The 0.x `lucide` package
 * ships the older tree (`["svg", attrs, children]`); unwrap it so the
 * helper stays aligned with `lucide-react@0.468`.
 */
export function asMorphIcon(node: MorphableIcon | unknown): IconInput {
  if (typeof node === "string") {
    return node;
  }
  if (isLucideTree(node)) {
    const children = node[2] ?? [];
    return children.map(([tag, attrs]) => [tag, attrs] as const);
  }
  if (isFlatIconNode(node)) {
    return node;
  }
  throw new Error("MorphIcon expected Lucide IconNode data");
}
