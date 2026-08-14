import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-[var(--radius-control)] border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-[color,background-color,border-color,box-shadow,transform,opacity] duration-[var(--motion-duration-fast)] ease-[var(--motion-ease-standard)] outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:[transform:translateY(var(--motion-distance-press))_scale(var(--motion-scale-press))] disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/80",
        outline:
          "border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-[var(--control-height)] gap-1.5 px-[var(--control-padding-inline)] has-data-[icon=inline-end]:pr-[var(--control-padding-inline)] has-data-[icon=inline-start]:pl-[var(--control-padding-inline)]",
        xs: "h-[var(--control-height-xs)] gap-1 rounded-[var(--radius-small)] px-[calc(var(--control-padding-inline)*0.75)] text-xs in-data-[slot=button-group]:rounded-[var(--radius-control)] has-data-[icon=inline-end]:pr-[calc(var(--control-padding-inline)*0.75)] has-data-[icon=inline-start]:pl-[calc(var(--control-padding-inline)*0.75)] [&_svg:not([class*='size-'])]:size-3",
        sm: "h-[var(--control-height-sm)] gap-1 rounded-[var(--radius-small)] px-[var(--control-padding-inline)] text-[0.8rem] in-data-[slot=button-group]:rounded-[var(--radius-control)] has-data-[icon=inline-end]:pr-[calc(var(--control-padding-inline)*0.75)] has-data-[icon=inline-start]:pl-[calc(var(--control-padding-inline)*0.75)] [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-[var(--control-height-lg)] gap-1.5 px-[var(--control-padding-inline)] has-data-[icon=inline-end]:pr-[var(--control-padding-inline)] has-data-[icon=inline-start]:pl-[var(--control-padding-inline)]",
        icon: "size-[var(--control-height)]",
        "icon-xs":
          "size-[var(--control-height-xs)] rounded-[var(--radius-small)] in-data-[slot=button-group]:rounded-[var(--radius-control)] [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-[var(--control-height-sm)] rounded-[var(--radius-small)] in-data-[slot=button-group]:rounded-[var(--radius-control)]",
        "icon-lg": "size-[var(--control-height-lg)]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
