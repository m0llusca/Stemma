import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      data-qc-motion="static-loop"
      className={cn("rounded-[var(--radius-small)] bg-muted", className)}
      {...props}
    />
  )
}

export { Skeleton }
