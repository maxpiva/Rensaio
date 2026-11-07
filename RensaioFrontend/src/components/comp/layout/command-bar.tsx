"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Monitor, Moon, Search, Sun, X } from "lucide-react";
import { useTheme } from "next-themes";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Brand } from "@/components/comp/layout/brand";
import { DownloadStatus } from "@/components/comp/layout/download-status";
import { useRibbonMount } from "@/components/comp/layout/ribbon";
import {
  useIsSectionActive,
  useManageSections,
  useSections,
} from "@/components/comp/layout/section-pills";
import { UserAvatarDropdown } from "@/components/comp/layout/user-menu";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSearch } from "@/contexts/search-context";
import { cn } from "@/lib/utils";

/**
 * Command Bar — the top of the content column.
 *
 * Desktop (≥1024px, sidebar visible), 58px:
 *   [ Rensaiō / Library ]        [ ⌕ Filter series…  ⌘K ] [▾3 ⏸7 ✕2] [◐] [SV]
 *
 * Phone / tablet (<1024px), 52px with a double rule:
 *   [連 Rensaiō]                                         [⌕] [SV]
 *   The search button expands a full-width filter input over the bar.
 *
 * Below either bar sits the contextual ribbon that pages fill via
 * <RibbonSlot>. ⌘K / Ctrl+K focuses the page filter (it filters the current
 * page through SearchContext; it is not a global palette).
 */
export function CommandBar({ seriesTitle }: { seriesTitle?: string } = {}) {
  const { searchTerm, setSearchTerm, currentPage, isSearchDisabled } =
    useSearch();
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const mobileInputRef = useRef<HTMLInputElement>(null);
  const desktopInputRef = useRef<HTMLInputElement>(null);
  const pathname = usePathname();
  const { setTarget: setRibbonTarget, active: ribbonActive } = useRibbonMount();

  // Collapse the phone search when the route changes.
  useEffect(() => {
    setMobileSearchOpen(false);
  }, [pathname]);

  // Cmd/Ctrl+K focuses the search input.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        if (isSearchDisabled) return;
        e.preventDefault();
        if (window.matchMedia("(min-width: 1024px)").matches) {
          desktopInputRef.current?.focus();
          desktopInputRef.current?.select();
        } else {
          setMobileSearchOpen(true);
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isSearchDisabled]);

  // Auto-focus when the phone search expands.
  useEffect(() => {
    if (mobileSearchOpen) {
      mobileInputRef.current?.focus();
    }
  }, [mobileSearchOpen]);

  const placeholder = getSearchPlaceholder(currentPage);

  return (
    <div
      className="relative z-30 shrink-0 bg-paper/90 backdrop-blur-xl backdrop-saturate-150 supports-[backdrop-filter]:bg-paper/80"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      {/* ─── Desktop top bar (58px) ─────────────────────────────────── */}
      <div className="hidden h-[58px] items-center gap-3 border-b border-rule pl-8 pr-6 lg:flex">
        <Crumb seriesTitle={seriesTitle} />

        {!isSearchDisabled && (
          <label className="group relative ml-auto flex h-9 w-[min(360px,36%)] min-w-[220px] cursor-text items-center gap-2 rounded-md border border-rule-2 bg-paper-1 pl-3 pr-2 text-ink-3 transition-[border-color,box-shadow] hover:border-ink-3 focus-within:border-primary focus-within:ring-[3px] focus-within:ring-accent-soft">
            <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="sr-only">{placeholder}</span>
            <input
              ref={desktopInputRef}
              type="search"
              placeholder={placeholder}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              disabled={isSearchDisabled}
              className="h-full min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-3 [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none"
            />
            {searchTerm ? (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="flex h-6 w-6 items-center justify-center rounded text-ink-3 transition-colors hover:bg-hover hover:text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : (
              <kbd className="pointer-events-none rounded-[3px] border border-b-2 border-rule-2 bg-paper px-[5px] py-0.5 font-mono text-[10.5px] font-medium leading-none text-ink-3">
                ⌘K
              </kbd>
            )}
          </label>
        )}

        <div className={cn("flex shrink-0 items-center gap-2", isSearchDisabled && "ml-auto")}>
          <DownloadStatus variant="bar" />
          <ThemeToggleButton />
          <UserAvatarDropdown size="md" />
        </div>
      </div>

      {/* ─── Phone / tablet top bar (52px) ──────────────────────────── */}
      <div className="relative flex h-[52px] items-center gap-2.5 border-b-[3px] border-double border-rule-2 pl-4 pr-2.5 lg:hidden">
        <Brand compact className={cn(mobileSearchOpen && "invisible")} />

        <AnimatePresence>
          {mobileSearchOpen && !isSearchDisabled && (
            <motion.div
              key="msearch"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 12 }}
              transition={{ duration: 0.16, ease: [0.2, 0.8, 0.2, 1] }}
              className="absolute inset-y-0 left-3 right-[100px] flex items-center"
            >
              <label className="relative flex h-10 w-full items-center gap-2 rounded-md border border-rule-2 bg-paper-1 pl-3 pr-2 text-ink-3 focus-within:border-primary focus-within:ring-[3px] focus-within:ring-accent-soft">
                <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="sr-only">{placeholder}</span>
                <input
                  ref={mobileInputRef}
                  type="search"
                  placeholder={placeholder}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  disabled={isSearchDisabled}
                  className="h-full min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink-3 [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none"
                />
              </label>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          {!isSearchDisabled && (
            <Button
              size="icon"
              variant="ghost"
              className="h-11 w-11 rounded-lg text-ink-2"
              onClick={() => {
                if (mobileSearchOpen && searchTerm) setSearchTerm("");
                setMobileSearchOpen((v) => !v);
              }}
              aria-label={mobileSearchOpen ? "Close search" : "Open search"}
              aria-expanded={mobileSearchOpen}
            >
              {mobileSearchOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Search className="h-5 w-5" />
              )}
            </Button>
          )}
          <UserAvatarDropdown size="md" />
        </div>
      </div>

      {/* ─── Contextual ribbon (48px when a page has filled it) ──────── */}
      {/*
        The portal target is always rendered so RibbonSlot has somewhere to
        portal into immediately on mount; it stays hidden until a page
        registers a slot, so routes without a ribbon don't reserve space.
      */}
      <div className={ribbonActive ? "border-b border-rule" : "hidden"}>
        <div
          ref={setRibbonTarget}
          className="flex h-12 items-center gap-2 overflow-x-auto px-3 scrollbar-hide lg:px-8"
        />
      </div>
    </div>
  );
}

/* ─── Crumb ────────────────────────────────────────────────────────────── */

function Crumb({ seriesTitle }: { seriesTitle?: string }) {
  const sections = useSections();
  const manage = useManageSections();
  const isActive = useIsSectionActive();
  const current = [...sections, ...manage].find((s) => isActive(s.href));

  return (
    <div className="flex min-w-0 items-center gap-[7px] whitespace-nowrap text-[13px] text-ink-3">
      <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em]">
        Rensaiō
      </span>
      {current ? (
        <>
          <span aria-hidden="true" className="text-rule-2">/</span>
          <span className={seriesTitle ? "text-ink-3" : "truncate font-semibold text-ink"}>
            {current.name}
          </span>
        </>
      ) : null}
      {seriesTitle ? (
        <>
          <span aria-hidden="true" className="text-rule-2">/</span>
          <span className="truncate font-semibold text-ink">{seriesTitle}</span>
        </>
      ) : null}
    </div>
  );
}

/* ─── Theme toggle ─────────────────────────────────────────────────────── */

function ThemeToggleButton() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    // Same-size placeholder so the bar doesn't jiggle once the hook hydrates.
    return <div className="h-9 w-9" />;
  }

  const cycle = () => {
    const order = ["light", "dark", "system"] as const;
    const idx = order.findIndex((t) => t === theme);
    const next = order[(idx + 1) % order.length]!;
    setTheme(next);
  };

  const label =
    theme === "light" ? "Light" : theme === "dark" ? "Dark" : "System";
  const Icon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className="h-9 w-9"
          onClick={cycle}
          aria-label={`Theme: ${label}. Click to cycle.`}
        >
          <Icon className="h-4 w-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">Theme: {label}</TooltipContent>
    </Tooltip>
  );
}

/* ─── Helpers ──────────────────────────────────────────────────────────── */

function getSearchPlaceholder(
  currentPage:
    | "library"
    | "providers"
    | "queue"
    | "cloudLatest"
    | "settings"
    | "series"
    | "other",
): string {
  switch (currentPage) {
    case "library":
      return "Filter series...";
    case "providers":
      return "Filter sources...";
    case "queue":
      return "Filter queue...";
    case "cloudLatest":
      return "Filter latest...";
    default:
      return "Filter...";
  }
}
