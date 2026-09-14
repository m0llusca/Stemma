"use client";

import { MorphIcon as MorphiconsIcon, type MorphIconProps } from "morphicons/react";
import { kineticsMorphSpring } from "@stemma/kinetics";

import { asMorphIcon, type MorphableIcon } from "@/lib/ui/lucide-morph";
import { cn } from "@/lib/utils";

export type AppMorphIconProps = Omit<MorphIconProps, "icon" | "from" | "to"> & {
  icon?: MorphableIcon;
  from?: MorphableIcon;
  to?: MorphableIcon;
};

/**
 * Product MorphIcon. lucide-react components are mapped to lucide data so
 * Morphicons sees a real `icon` identity change (Menu→X, Copy→Check).
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
  const resolvedIcon = icon === undefined ? undefined : asMorphIcon(icon);
  const resolvedFrom = from === undefined ? undefined : asMorphIcon(from);
  const resolvedTo = to === undefined ? undefined : asMorphIcon(to);

  return (
    <MorphiconsIcon
      icon={resolvedIcon}
      {...(resolvedFrom === undefined ? {} : { from: resolvedFrom })}
      {...(resolvedTo === undefined ? {} : { to: resolvedTo })}
      size={size}
      reducedMotion={reducedMotion}
      spring={spring}
      data-slot="morph-icon"
      className={cn("size-4 shrink-0", className)}
      {...props}
    />
  );
}
