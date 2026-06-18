"use client";

import React, { useState } from 'react';
import {
  Languages,
  ShieldAlert,
  ArrowDownAZ,
  MoreVertical,
  Upload,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { MultiSelect, type MultiSelectOption } from "@/components/ui/multi-select";
import { NsfwVisibility } from "@/lib/api/types";

export type SortOption = 'name-asc' | 'name-desc';

interface SourcesToolbarProps {
  hideNsfw: boolean;
  setHideNsfw: (v: boolean) => void;
  selectedLanguages: string[];
  setSelectedLanguages: (v: string[]) => void;
  availableLanguageOptions: MultiSelectOption[];
  sort: SortOption;
  setSort: (v: SortOption) => void;
  onInstallFromApk: () => void;
  nsfwVisibility: NsfwVisibility;
}

export function SourcesToolbar({
  hideNsfw,
  setHideNsfw,
  selectedLanguages,
  setSelectedLanguages,
  availableLanguageOptions,
  sort,
  setSort,
  onInstallFromApk,
  nsfwVisibility,
}: SourcesToolbarProps) {
  const [langSheetOpen, setLangSheetOpen] = useState(false);

  const sortLabel = sort === 'name-asc' ? 'A–Z' : 'Z–A';
  const langLabel =
    selectedLanguages.length === 0
      ? 'Languages'
      : selectedLanguages.length <= 3
        ? selectedLanguages.map((l) => l.toUpperCase()).join(', ')
        : `${selectedLanguages.length} langs`;

  const allLangsSelected =
    availableLanguageOptions.length > 0 &&
    selectedLanguages.length === availableLanguageOptions.length;

  const toggleAllLanguages = () => {
    if (allLangsSelected) {
      setSelectedLanguages([]);
    } else {
      setSelectedLanguages(availableLanguageOptions.map((o) => o.value));
    }
  };

  const toggleLanguage = (value: string) => {
    if (selectedLanguages.includes(value)) {
      setSelectedLanguages(selectedLanguages.filter((v) => v !== value));
    } else {
      setSelectedLanguages([...selectedLanguages, value]);
    }
  };

  return (
    <>
      {/* ── Desktop toolbar (md and up) ── */}
      <div className="hidden md:flex flex-wrap items-center gap-2 pb-4 border-b border-white/5">
        {/* Language chip → DropdownMenu with checkbox list (mirrors MultiSelect, chip-styled) */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={`src-chip${selectedLanguages.length > 0 ? ' is-on' : ''}`}
              aria-label="Filter by language"
            >
              <Languages className="h-3.5 w-3.5" />
              <span>{langLabel}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            {availableLanguageOptions.length > 1 && (
              <>
                <DropdownMenuItem
                  className="flex items-center space-x-2 cursor-pointer"
                  onSelect={(e) => {
                    e.preventDefault();
                    toggleAllLanguages();
                  }}
                >
                  <Checkbox
                    checked={allLangsSelected}
                    className="pointer-events-none"
                  />
                  <span className="text-sm font-medium">Select All</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            <div className="max-h-60 overflow-y-auto">
              {availableLanguageOptions.map((option) => (
                <DropdownMenuItem
                  key={option.value}
                  className="flex items-center space-x-2 cursor-pointer"
                  onSelect={(e) => {
                    e.preventDefault();
                    toggleLanguage(option.value);
                  }}
                >
                  <Checkbox
                    checked={selectedLanguages.includes(option.value)}
                    className="pointer-events-none"
                  />
                  <span className="text-sm flex-1">{option.label}</span>
                </DropdownMenuItem>
              ))}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* NSFW chip — hidden if AlwaysHide */}
        {nsfwVisibility !== NsfwVisibility.AlwaysHide && (
          <button
            className={`src-chip${hideNsfw ? '' : ' is-on'}`}
            onClick={() => setHideNsfw(!hideNsfw)}
            aria-pressed={!hideNsfw}
            aria-label="Toggle NSFW sources"
          >
            <ShieldAlert className="h-3.5 w-3.5" />
            <span>NSFW</span>
          </button>
        )}

        {/* Sort chip */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="src-chip" aria-label="Sort order">
              <ArrowDownAZ className="h-3.5 w-3.5" />
              <span>Sort: {sortLabel}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem
              onSelect={() => setSort('name-asc')}
              className={sort === 'name-asc' ? 'font-semibold' : ''}
            >
              Name A–Z
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => setSort('name-desc')}
              className={sort === 'name-desc' ? 'font-semibold' : ''}
            >
              Name Z–A
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex-1" />

        {/* 3-dot overflow */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:bg-white/10 hover:text-foreground transition-colors"
              aria-label="More options"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onInstallFromApk} className="gap-2">
              <Upload className="h-4 w-4" />
              Install from APK…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* ── Mobile toolbar (below md) ── */}
      <div className="md:hidden flex items-center gap-2 pb-3 border-b border-white/5 overflow-x-auto scrollbar-hide">
        {/* Language chip → sheet (safer than a floating dropdown on small screens) */}
        <button
          className={`src-chip${selectedLanguages.length > 0 ? ' is-on' : ''}`}
          onClick={() => setLangSheetOpen(true)}
          aria-label="Filter by language"
        >
          <Languages className="h-3.5 w-3.5" />
          <span>{langLabel}</span>
        </button>

        {/* NSFW chip */}
        {nsfwVisibility !== NsfwVisibility.AlwaysHide && (
          <button
            className={`src-chip${hideNsfw ? '' : ' is-on'}`}
            onClick={() => setHideNsfw(!hideNsfw)}
            aria-pressed={!hideNsfw}
            aria-label="Toggle NSFW sources"
          >
            <ShieldAlert className="h-3.5 w-3.5" />
          </button>
        )}

        {/* Sort chip (icon + label on mobile) */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="src-chip" aria-label={`Sort: ${sortLabel}`}>
              <ArrowDownAZ className="h-3.5 w-3.5" />
              <span>{sortLabel}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem
              onSelect={() => setSort('name-asc')}
              className={sort === 'name-asc' ? 'font-semibold' : ''}
            >
              Name A–Z
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => setSort('name-desc')}
              className={sort === 'name-desc' ? 'font-semibold' : ''}
            >
              Name Z–A
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex-1" />

        {/* 3-dot overflow — APK install on mobile */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:bg-white/10 hover:text-foreground transition-colors shrink-0"
              aria-label="More options"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onInstallFromApk} className="gap-2">
              <Upload className="h-4 w-4" />
              Install from APK…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* ── Mobile language sheet ── */}
      <Sheet open={langSheetOpen} onOpenChange={setLangSheetOpen}>
        <SheetContent side="bottom" className="px-4 py-6">
          <SheetHeader className="mb-4">
            <SheetTitle className="text-sm">Filter by language</SheetTitle>
          </SheetHeader>
          <MultiSelect
            options={availableLanguageOptions}
            selectedValues={selectedLanguages}
            onSelectionChange={setSelectedLanguages}
            placeholder="All languages"
          />
        </SheetContent>
      </Sheet>
    </>
  );
}
