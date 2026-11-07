"use client";

import React from 'react';
import { Plus, Loader2 } from "lucide-react";
import { type Provider } from "@/lib/api/types";
import { Button } from "@/components/ui/button";

interface RowActionsAvailableProps {
  extension: Provider;
  onInstall: (pkgName: string) => void;
  isLoading: boolean;
}

export function RowActionsAvailable({
  extension,
  onInstall,
  isLoading,
}: RowActionsAvailableProps) {
  return (
    <Button
      size="sm"
      className="max-sm:min-h-11 max-sm:min-w-11"
      onClick={() => onInstall(extension.package)}
      disabled={isLoading}
      aria-label={`Install ${extension.name}`}
    >
      {isLoading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Plus className="h-3.5 w-3.5" />
      )}
      <span className="hidden sm:inline">Install</span>
    </Button>
  );
}
