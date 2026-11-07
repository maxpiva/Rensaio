"use client";

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex h-[22px] items-center gap-1 whitespace-nowrap rounded-[4px] border px-2 text-[11.5px] font-semibold leading-none transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 [&_svg]:h-3 [&_svg]:w-3 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-primary text-primary-foreground",
        primary:
          "border-rule bg-paper-1 text-ink-2",
        secondary:
          "border-rule bg-paper-2 text-ink-2",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground",
        outline: "border-rule-2 bg-transparent text-ink-2",
        poster:
          "border-transparent bg-paper-1/85 text-ink-2 backdrop-blur-sm",
        /* Paper status tags (additive). Pair with an icon: status is
           never colour-only. */
        accent: "border-accent-line bg-accent-soft text-accent-ink",
        ok: "border-transparent bg-ok-soft text-ok",
        warn: "border-transparent bg-warn-soft text-warn",
        bad: "border-transparent bg-bad-soft text-bad",
        info: "border-transparent bg-info-soft text-info",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
