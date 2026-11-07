"use client";

import React, { useState } from 'react';
import { Check, Settings, MoreVertical, Loader2, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProviderPreferencesRequester } from "@/components/comp/provider-preferences-requester";
import { type Provider } from "@/lib/api/types";

interface RowActionsInstalledProps {
  extension: Provider;
  onUninstall: (pkgName: string) => void;
  isLoading: boolean;
}

export function RowActionsInstalled({
  extension,
  onUninstall,
  isLoading,
}: RowActionsInstalledProps) {
  const [preferencesOpen, setPreferencesOpen] = useState(false);

  const desktopMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="inline-flex h-[30px] items-center gap-1.5 rounded-[5px] border border-ok/30 bg-ok-soft px-2.5 text-[12.5px] font-semibold text-ok transition-colors hover:border-ok/60 outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50"
          disabled={isLoading}
          aria-label={`${extension.name} — installed options`}
        >
          {isLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5" />
          )}
          <span>Installed</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem
          onSelect={() => onUninstall(extension.package)}
          disabled={isLoading}
          className="gap-2 text-destructive focus:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
          Uninstall
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const mobileMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="inline-flex h-11 w-11 items-center justify-center rounded-md text-ink-2 transition-colors hover:bg-hover hover:text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          disabled={isLoading}
          aria-label={`${extension.name} options`}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <MoreVertical className="h-4 w-4" />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem
          onSelect={() => setPreferencesOpen(true)}
          className="gap-2"
        >
          <Settings className="h-4 w-4" />
          Settings…
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => onUninstall(extension.package)}
          disabled={isLoading}
          className="gap-2 text-destructive focus:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
          Uninstall
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <>
      {/* Desktop: settings icon + installed pill dropdown */}
      <div className="hidden md:flex items-center gap-1.5">
        <button
          className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-[5px] text-ink-3 transition-colors hover:bg-hover hover:text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          onClick={() => setPreferencesOpen(true)}
          aria-label={`${extension.name} settings`}
        >
          <Settings className="h-4 w-4" />
        </button>
        {desktopMenu}
      </div>

      {/* Mobile: single more-vertical button with full menu */}
      <div className="md:hidden">
        {mobileMenu}
      </div>

      {/* Preferences dialog / drawer (shared) */}
      <ProviderPreferencesRequester
        open={preferencesOpen}
        onOpenChange={setPreferencesOpen}
        pkgName={extension.package}
        providerName={extension.name}
      />
    </>
  );
}
