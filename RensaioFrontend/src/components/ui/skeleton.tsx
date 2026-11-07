import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Paper skeleton: a soft paper-3 block with a slow shimmer (disabled under
 * prefers-reduced-motion). Size it with utilities, e.g.
 * `<Skeleton className="h-4 w-32" />`.
 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn("skeleton-shimmer rounded-md", className)}
      {...props}
    />
  )
}

export { Skeleton }
