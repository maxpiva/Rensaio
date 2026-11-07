"use client";

import * as React from "react"

import { cn } from "@/lib/utils"

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full min-w-0 rounded-md border border-rule-2 bg-paper-1 px-3 py-1 text-[13.5px] text-ink transition-[border-color,box-shadow] file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-ink-3 hover:border-ink-3 outline-none focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-accent-soft aria-[invalid=true]:border-bad disabled:cursor-not-allowed disabled:opacity-50 max-sm:h-11 max-sm:text-base",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
