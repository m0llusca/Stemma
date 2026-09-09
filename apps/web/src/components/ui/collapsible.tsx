"use client"

import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible"

import { cn } from "@/lib/utils"

function Collapsible({ ...props }: CollapsiblePrimitive.Root.Props) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />
}

function CollapsibleTrigger({
  type = "button",
  ...props
}: CollapsiblePrimitive.Trigger.Props) {
  return (
    <CollapsiblePrimitive.Trigger
      data-slot="collapsible-trigger"
      type={type}
      {...props}
    />
  )
}

/**
 * Panel defaults to `keepMounted` so form controls stay in the document when
 * collapsed (native `<details>` always kept fields mounted). Pass
 * `keepMounted={false}` only when unmounting closed content is intentional.
 *
 * Closed panels always get `display: none` so a caller `grid`/`flex` class
 * cannot keep collapsed form chrome in the hit-test tree (dead clicks on the
 * next disclosure).
 */
function CollapsibleContent({
  keepMounted = true,
  className,
  ...props
}: CollapsiblePrimitive.Panel.Props) {
  return (
    <CollapsiblePrimitive.Panel
      data-slot="collapsible-content"
      keepMounted={keepMounted}
      className={cn("data-closed:hidden", className)}
      {...props}
    />
  )
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent }
