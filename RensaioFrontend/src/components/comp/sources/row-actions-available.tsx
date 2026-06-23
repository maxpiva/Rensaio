"use client";

import React from 'react';
import { Plus, Loader2 } from "lucide-react";
import { type Provider } from "@/lib/api/types";

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
    <button
      className="btn-src-install"
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
    </button>
  );
}
