"use client";

import {
  MorphIcon as MorphiconsIcon,
  type MorphIconProps
} from "morphicons/react";
import { kineticsMorphSpring } from "@stemma/kinetics";

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
 */
export function MorphIcon({
  icon,
  from,
  to,
  className,
  reducedMotion = "user",
  spring = kineticsMorphSpring,
  ...props
}: AppMorphIconProps) {
  return (
    <MorphiconsIcon
      icon={icon === undefined ? undefined : asMorphIcon(icon)}
      from={from === undefined ? undefined : asMorphIcon(from)}
      to={to === undefined ? undefined : asMorphIcon(to)}
      reducedMotion={reducedMotion}
      spring={spring}
      data-slot="morph-icon"
      className={cn("size-4 shrink-0", className)}
      {...props}
    />
  );
}
