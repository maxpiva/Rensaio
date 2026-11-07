"use client";

import React from "react";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RibbonSlot } from "@/components/comp/layout/ribbon";

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
          className="-ml-1 h-8 gap-1.5 px-2 text-ink-2 hover:text-ink max-sm:h-11 max-sm:min-w-11"
          aria-label="Back to Library"
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
            className="pointer-events-auto truncate font-serif text-[15px] italic text-ink-2"
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
