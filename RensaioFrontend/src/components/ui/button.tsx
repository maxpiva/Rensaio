"use client";

import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Paper button. Hairline-bordered paper slip by default; `default` is the
 * single crimson call to action. Focus ring only on keyboard focus. On phone
 * (< 640px) every size grows to a 44px touch target (sm/xs to 40px).
 *
 * Extra variants (additive): `ink` (solid ink fill), `danger` (outlined
 * destructive). Extra size: `xs`.
 */
const buttonVariants = cva(
  [
    "inline-flex shrink-0 items-center justify-center gap-[7px] whitespace-nowrap rounded-md border text-[13px] font-semibold leading-none",
    "transition-[background-color,border-color,color,box-shadow,transform,filter] duration-150 active:translate-y-px",
    "outline-none focus-visible:ring-[3px] focus-visible:ring-ring/35 focus-visible:ring-offset-1 focus-visible:ring-offset-background",
    "disabled:pointer-events-none disabled:opacity-45 disabled:shadow-none aria-disabled:pointer-events-none aria-disabled:opacity-45",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0",
  ].join(" "),
  {
    variants: {
      variant: {
        default:
          "border-primary bg-primary text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,.2),0_8px_18px_-12px_hsl(var(--primary))] hover:bg-primary hover:brightness-[1.07]",
        destructive:
          "border-destructive bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border-rule-2 bg-paper-1 text-ink hover:border-ink-3 hover:bg-paper-2",
        secondary:
          "border-rule bg-paper-2 text-ink hover:border-rule-2 hover:bg-paper-3",
        ghost:
          "border-transparent bg-transparent text-ink-2 hover:bg-hover hover:text-ink",
        link:
          "h-auto border-transparent px-0 text-accent-ink underline-offset-4 hover:underline active:translate-y-0",
        ink: "border-ink bg-ink text-paper hover:opacity-90",
        danger:
          "border-bad/35 bg-transparent text-bad hover:border-bad hover:bg-bad-soft",
      },
      size: {
        default: "h-9 px-3.5 max-sm:min-h-11",
        sm: "h-[30px] gap-1.5 rounded-[5px] px-2.5 text-[12.5px] max-sm:min-h-10",
        xs: "h-[26px] gap-[5px] rounded-[4px] px-2 text-xs max-sm:min-h-10",
        lg: "h-10 px-6 text-sm max-sm:min-h-11",
        icon: "h-9 w-9 p-0 max-sm:min-h-11 max-sm:min-w-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
