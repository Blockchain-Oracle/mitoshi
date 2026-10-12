// Ported from Masayume 68f7a09:web/src/components/ui/skeleton.tsx
import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("skel rounded-md", className)}
      {...props}
    />
  )
}

export { Skeleton }
