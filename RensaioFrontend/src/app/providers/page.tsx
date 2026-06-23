"use client";

import { Plug } from "lucide-react";
import React from 'react';

import { RibbonSlot } from "@/components/comp/layout/ribbon";
import { SourcesList } from "@/components/comp/sources/sources-list";
import { useSearch } from "@/contexts/search-context";

export default function ProvidersPage() {
  const { searchTerm, clearSearch } = useSearch();

  return (
    <div className="space-y-6">
      <RibbonSlot>
        <div className="flex w-full items-center gap-2">
          <Plug className="h-4 w-4 text-muted-foreground shrink-0" />
          <h2 className="truncate text-sm font-semibold text-foreground">
            Sources
          </h2>
          <span className="hidden sm:inline truncate text-xs text-muted-foreground">
            · Install, enable, and health-check Mihon extensions
          </span>
        </div>
      </RibbonSlot>

      <SourcesList searchTerm={searchTerm} clearSearch={clearSearch} />
    </div>
  );
}
