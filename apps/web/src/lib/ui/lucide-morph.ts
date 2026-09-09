import type { LucideIcon } from "lucide-react";
import type { IconInput, IconNode } from "morphicons/react";

type LucideAttrs = Record<string, string | number>;
type LucideChild = readonly [tag: string, attrs: LucideAttrs];
/** lucide@0.x data: `["svg", attrs, children]` — kept so raw nodes still unwrap. */
export type LucideIconNode = readonly [
  tag: string,
  attrs: LucideAttrs,
  children?: LucideChild[]
];

export type MorphableIcon = IconInput | LucideIconNode | LucideIcon;

type LucideForwardRef = {
  iconNode?: unknown;
  render: (
    props: Record<string, never>,
    ref: null
  ) => { props?: { iconNode?: unknown } };
};

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

function isLucideForwardRef(value: unknown): value is LucideForwardRef {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  if (!("render" in value)) {
    return false;
  }
  return typeof value.render === "function";
}

/**
 * lucide-react@0.468 hides the IconNode inside the forwardRef render.
 * Later lucide-react attaches `iconNode` on the component.
 */
function iconNodeFromLucideReact(icon: LucideForwardRef): IconNode {
  if (isFlatIconNode(icon.iconNode)) {
    return icon.iconNode;
  }
  const element = icon.render({}, null);
  const node = element.props?.iconNode;
  if (isFlatIconNode(node)) {
    return node;
  }
  throw new Error("MorphIcon expected Lucide IconNode data");
}

/**
 * Morphicons consumes a flat Lucide `IconNode`. Product call sites import
 * `lucide-react` (the package the stand already resolves) — unwrap those
 * components, plus any leftover 0.x svg trees.
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
  if (isLucideForwardRef(node)) {
    return iconNodeFromLucideReact(node);
  }
  throw new Error("MorphIcon expected Lucide IconNode data");
}
