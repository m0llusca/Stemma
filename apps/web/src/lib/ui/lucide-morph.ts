import type { LucideIcon } from "lucide-react";
import type { IconInput, IconNode } from "morphicons/react";
import {
  Activity,
  BookOpen,
  BookOpenCheck,
  ChartColumn,
  ChartSpline,
  Check,
  ChevronDown,
  ChevronUp,
  CircleEqual,
  ClipboardCheck,
  ClipboardList,
  Copy,
  Gauge,
  Menu,
  MessageSquare,
  MessageSquareReply,
  Scale,
  Search,
  Settings2,
  SlidersHorizontal,
  X
} from "lucide";

type LucideAttrs = Record<string, string | number>;
type LucideChild = readonly [tag: string, attrs: LucideAttrs];
/** lucide@0.x data: `["svg", attrs, children]` — Morphicons wants the children. */
export type LucideIconNode = readonly [
  tag: string,
  attrs: LucideAttrs,
  children?: LucideChild[]
];

export type MorphableIcon = IconInput | LucideIconNode | LucideIcon;

const iconInputCache = new WeakMap<object, IconInput>();

const lucideDataByName: Record<string, LucideIconNode> = {
  Activity: Activity as unknown as LucideIconNode,
  BookOpen: BookOpen as unknown as LucideIconNode,
  BookOpenCheck: BookOpenCheck as unknown as LucideIconNode,
  ChartColumn: ChartColumn as unknown as LucideIconNode,
  ChartSpline: ChartSpline as unknown as LucideIconNode,
  Check: Check as unknown as LucideIconNode,
  ChevronDown: ChevronDown as unknown as LucideIconNode,
  ChevronUp: ChevronUp as unknown as LucideIconNode,
  CircleEqual: CircleEqual as unknown as LucideIconNode,
  ClipboardCheck: ClipboardCheck as unknown as LucideIconNode,
  ClipboardList: ClipboardList as unknown as LucideIconNode,
  Copy: Copy as unknown as LucideIconNode,
  Gauge: Gauge as unknown as LucideIconNode,
  Menu: Menu as unknown as LucideIconNode,
  MessageSquare: MessageSquare as unknown as LucideIconNode,
  MessageSquareReply: MessageSquareReply as unknown as LucideIconNode,
  Scale: Scale as unknown as LucideIconNode,
  Search: Search as unknown as LucideIconNode,
  Settings2: Settings2 as unknown as LucideIconNode,
  SlidersHorizontal: SlidersHorizontal as unknown as LucideIconNode,
  X: X as unknown as LucideIconNode
};

type LucideForwardRef = {
  displayName?: string;
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
  return (
    typeof value === "object" &&
    value !== null &&
    "render" in value &&
    typeof (value as LucideForwardRef).render === "function"
  );
}

function stripNodeKeys(node: IconNode): IconNode {
  return node.map(([tag, attrs]) => {
    const { key: _key, ...rest } = attrs as LucideAttrs & { key?: string };
    return [tag, rest] as const;
  });
}

function unwrapTree(tree: LucideIconNode): IconNode {
  const children = tree[2] ?? [];
  return stripNodeKeys(children.map(([tag, attrs]) => [tag, attrs] as const));
}

/**
 * Morphicons morphs on IconNode identity. Official input is lucide *data*
 * (`from "lucide"`), not lucide-react components.
 */
export function asMorphIcon(node: MorphableIcon | unknown): IconInput {
  if (typeof node === "string") {
    return node;
  }
  if (typeof node === "object" && node !== null && iconInputCache.has(node)) {
    return iconInputCache.get(node)!;
  }

  let resolved: IconInput;
  if (isLucideTree(node)) {
    resolved = unwrapTree(node);
  } else if (isFlatIconNode(node)) {
    resolved = stripNodeKeys(node);
  } else if (isLucideForwardRef(node)) {
    const named = node.displayName ? lucideDataByName[node.displayName] : undefined;
    if (!named) {
      throw new Error("MorphIcon expected Lucide IconNode data");
    }
    resolved = unwrapTree(named);
  } else {
    throw new Error("MorphIcon expected Lucide IconNode data");
  }

  if (typeof node === "object" && node !== null) {
    iconInputCache.set(node, resolved);
  }
  return resolved;
}
