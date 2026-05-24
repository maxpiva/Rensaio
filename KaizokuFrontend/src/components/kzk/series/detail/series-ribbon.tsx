"use client";

import React from "react";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RibbonSlot } from "@/components/kzk/layout/ribbon";

interface SeriesRibbonProps {
  seriesTitle: string;
  onBack: () => void;
}

export function SeriesRibbon({ seriesTitle, onBack }: SeriesRibbonProps) {
  return (
    <RibbonSlot>
      <div className="relative flex w-full items-center gap-3">
        {/* Left: back button (in normal flow) */}
        <Button
          onClick={onBack}
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 px-2 -ml-1"
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Back to Library</span>
        </Button>

        {/* Center: title — absolutely centered against the ribbon container
            so it lines up with the command bar's nav pills above (which
            use the same absolute-center technique). Using flex-1 +
            justify-center centers within the post-back-button space and
            drifts off-axis. */}
        <div className="hidden lg:flex absolute left-1/2 -translate-x-1/2 pointer-events-none max-w-[60vw] min-w-0">
          <span
            className="pointer-events-auto truncate text-sm font-medium text-foreground/80"
            title={seriesTitle}
          >
            {seriesTitle}
          </span>
        </div>

        {/* Mobile spacer (keeps back button left-anchored on small screens) */}
        <div className="flex-1 lg:hidden" />
      </div>
    </RibbonSlot>
  );
}
