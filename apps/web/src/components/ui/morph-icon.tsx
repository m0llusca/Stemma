"use client";

import {
  MorphIcon as MorphiconsIcon,
  type MorphIconProps
} from "morphicons/react";
import { kineticsMorphSpring } from "@stemma/kinetics";
import { useMemo } from "react";

import { asMorphIcon, type MorphableIcon } from "@/lib/ui/lucide-morph";
import { cn } from "@/lib/utils";

export type AppMorphIconProps = Omit<MorphIconProps, "icon" | "from" | "to"> & {
  icon?: MorphableIcon;
  from?: MorphableIcon;
  to?: MorphableIcon;
};

/**
 * Product MorphIcon. Pass lucide-react icons; `asMorphIcon` unwraps them.
 * Honors `prefers-reduced-motion` (instant swap). Spring comes from
 * `@stemma/kinetics` (`kineticsMorphSpring` ≈ morph slot / 350ms).
 *
 * IconNodes are memoized by the lucide component identity so Morphicons'
 * reference equality (`icon !== prev`) still sees a real prop change when
 * the call site swaps Menu↔X / Search↔X / idle↔active.
 */
export function MorphIcon({
  icon,
  from,
  to,
  className,
  size = 16,
  reducedMotion = "user",
  spring = kineticsMorphSpring,
  ...props
}: AppMorphIconProps) {
  const resolvedIcon = useMemo(
    () => (icon === undefined ? undefined : asMorphIcon(icon)),
    [icon]
  );
  const resolvedFrom = useMemo(
    () => (from === undefined ? undefined : asMorphIcon(from)),
    [from]
  );
  const resolvedTo = useMemo(
    () => (to === undefined ? undefined : asMorphIcon(to)),
    [to]
  );

  return (
    <MorphiconsIcon
      icon={resolvedIcon}
      from={resolvedFrom}
      to={resolvedTo}
      size={size}
      reducedMotion={reducedMotion}
      spring={spring}
      data-slot="morph-icon"
      className={cn("size-4 shrink-0", className)}
      {...props}
    />
  );
}
