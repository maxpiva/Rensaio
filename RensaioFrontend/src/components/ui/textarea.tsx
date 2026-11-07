import * as React from "react";
import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex min-h-[80px] w-full rounded-md border border-rule-2 bg-paper-1 px-3 py-2 text-[13.5px] leading-relaxed text-ink transition-[border-color,box-shadow] placeholder:text-ink-3 hover:border-ink-3 outline-none focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-accent-soft aria-[invalid=true]:border-bad disabled:cursor-not-allowed disabled:opacity-50 max-sm:text-base",
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export { Textarea };
