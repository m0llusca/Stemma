import { cn } from "@/lib/utils"
import { Loader2Icon } from "lucide-react"

function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <Loader2Icon
      data-slot="spinner"
      data-qc-motion="static-loop"
      role="status"
      aria-label="Загрузка"
      className={cn("size-4", className)}
      {...props}
    />
  )
}

export { Spinner }
