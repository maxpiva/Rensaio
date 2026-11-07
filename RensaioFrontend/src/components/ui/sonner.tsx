"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Loader2,
  XCircle,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

/**
 * Paper toaster. Drop-in for sonner's <Toaster>; every `toast()` /
 * `toast.success()` / `toast.error()` call (and the `useToast` hook) renders
 * as a paper slip: hairline border, coloured left rule, icon + label.
 * Status is never colour-only — each variant has its own icon.
 */
export function Toaster(props: ToasterProps) {
  const { resolvedTheme } = useTheme();

  return (
    <Sonner
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      position="top-right"
      offset={{ top: 70, right: 20 }}
      mobileOffset={{ top: 64, left: 12, right: 12 }}
      gap={8}
      icons={{
        success: <CheckCircle2 className="h-4 w-4" aria-hidden="true" />,
        error: <XCircle className="h-4 w-4" aria-hidden="true" />,
        warning: <AlertTriangle className="h-4 w-4" aria-hidden="true" />,
        info: <Info className="h-4 w-4" aria-hidden="true" />,
        loading: <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />,
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "paper-toast group pointer-events-auto grid w-full grid-cols-[18px_minmax(0,1fr)_auto] [&:not(:has(>[data-icon]))]:grid-cols-[minmax(0,1fr)_auto] items-start gap-x-2.5 rounded-md border border-rule-2 border-l-[3px] border-l-ink-2 bg-paper-1 py-3 pl-3.5 pr-3 text-ink shadow-lift font-sans",
          icon: "mt-px flex h-4 w-4 items-center justify-center text-ink-2",
          content: "min-w-0",
          title: "text-[13px] font-semibold leading-snug",
          description: "mt-0.5 text-[12.5px] leading-snug text-ink-2",
          actionButton:
            "self-center rounded-[5px] bg-ink px-2.5 h-7 text-[12px] font-semibold text-paper hover:opacity-90",
          cancelButton:
            "self-center rounded-[5px] border border-rule-2 px-2.5 h-7 text-[12px] font-semibold text-ink-2 hover:bg-hover",
          closeButton:
            "!bg-paper-1 !border-rule-2 !text-ink-3 hover:!text-ink",
          success: "!border-l-ok [&_[data-icon]]:text-ok",
          error: "!border-l-bad [&_[data-icon]]:text-bad",
          warning: "!border-l-warn [&_[data-icon]]:text-warn",
          info: "!border-l-info [&_[data-icon]]:text-info",
        },
      }}
      {...props}
    />
  );
}
