"use client";

import {
  Activity,
  Database,
  GitPullRequestArrow,
  Library,
  List,
  Plug,
  Settings,
  Sparkles,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type React from "react";

import { useAuth } from "@/contexts/auth-context";
import { useIsAdmin, usePermission } from "@/hooks/use-permission";
import { useDownloadsMetrics } from "@/lib/api/hooks/useDownloads";
import { useSettings } from "@/lib/api/hooks/useSettings";
import { cn } from "@/lib/utils";

/* ─── Section config ───────────────────────────────────────────────────── */

export interface SectionDef {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Numeric badge — shown as a small pill next to the label. */
  badge?: number;
  /** Badge tone. `bad` when the count includes failures. */
  badgeTone?: "accent" | "bad";
  /** When true, show a small pulsing dot (used for live activity). */
  live?: boolean;
  /** Short mono sub-line for the phone More sheet tiles. */
  hint?: string;
  /** Fixed two-digit folio, matching the page's PageHeader folio. */
  folio?: string;
}

/**
 * Hook returning the permission-gated, badge-decorated list of primary
 * sections (sidebar nav on desktop, tab bar + More sheet on phone).
 */
export function useSections(): SectionDef[] {
  const canViewLibrary = usePermission("canViewLibrary");
  const canBrowse = usePermission("canBrowseSources");
  const canViewQueue = usePermission("canViewQueue");
  const canViewStatus = usePermission("canViewStatistics");
  const isAdmin = useIsAdmin();
  const { data: metrics } = useDownloadsMetrics();

  const sections: SectionDef[] = [];

  if (canViewLibrary) {
    sections.push({ name: "Library", folio: "01", href: "/library", icon: Library, hint: "Your series" });
  }
  if (canBrowse) {
    sections.push({ name: "Just In", folio: "02", href: "/cloud-latest", icon: Sparkles, hint: "Latest releases" });
  }
  if (canViewQueue) {
    const activeCount = metrics?.downloads ?? 0;
    const failedCount = metrics?.failed ?? 0;
    sections.push({
      name: "Queue",
      folio: "03",
      href: "/queue",
      icon: List,
      badge: activeCount + failedCount > 0 ? activeCount + failedCount : undefined,
      badgeTone: failedCount > 0 ? "bad" : "accent",
      live: activeCount > 0,
      hint: activeCount > 0 ? `${activeCount} active` : "Downloads",
    });
  }
  if (canViewStatus) {
    sections.push({ name: "Status", folio: "04", href: "/status", icon: Activity, hint: "Health" });
  }
  if (isAdmin) {
    sections.push({ name: "Sources", folio: "05", href: "/providers", icon: Plug, hint: "Providers" });
  }

  return sections;
}

/**
 * The "Manage" routes. Same gating as the user-menu entries (which stay in
 * the menu too): Mappings = Manager+, Contribution = Owner with contribution
 * enabled and verified, Users = Admin+, Settings = Owner.
 */
export function useManageSections(): SectionDef[] {
  const { canManage, canAdmin, canOwner } = useAuth();
  const { data: settings } = useSettings();

  const items: SectionDef[] = [];
  if (canManage) {
    items.push({ name: "Mappings", href: "/external-mappings", icon: Database, hint: "External ids" });
  }
  if (canOwner && settings?.contributionEnabled && settings?.contributionVerified) {
    items.push({ name: "Contribution", href: "/contribution", icon: GitPullRequestArrow, hint: "Shared DB" });
  }
  if (canAdmin) {
    items.push({ name: "Users", href: "/users", icon: Users, hint: "Accounts" });
  }
  if (canOwner) {
    items.push({ name: "Settings", href: "/settings", icon: Settings, hint: "Server" });
  }
  return items;
}

export function useIsSectionActive() {
  const pathname = usePathname() ?? "";
  return (href: string) => pathname === href || pathname.startsWith(href + "/");
}

/* ─── Shared bits ──────────────────────────────────────────────────────── */

export function LiveDot({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("relative inline-flex h-[7px] w-[7px] shrink-0", className)}
    >
      <span className="absolute inset-0 rounded-full bg-ok opacity-60 motion-safe:animate-ping" />
      <span className="relative inline-flex h-[7px] w-[7px] rounded-full bg-ok" />
    </span>
  );
}

function CountBadge({
  value,
  tone = "accent",
  className,
}: {
  value: number;
  tone?: "accent" | "bad";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[3px] border px-1.5 font-mono text-[10.5px] font-semibold leading-none tabular-nums",
        tone === "bad"
          ? "border-bad/40 text-bad"
          : "border-accent-line text-accent-ink",
        className,
      )}
    >
      {value > 99 ? "99+" : value}
    </span>
  );
}

/** Mono section label with a trailing hairline (sidebar group headings). */
export function NavLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-2 pb-[7px] pt-4 font-mono text-[9.5px] font-semibold uppercase leading-none tracking-[0.18em] text-ink-3 after:h-px after:flex-1 after:bg-rule",
        className,
      )}
    >
      {children}
    </div>
  );
}

/* ─── Sidebar nav (desktop) ────────────────────────────────────────────── */

const navItemClass =
  "group relative flex h-[34px] w-full items-center gap-2.5 rounded-[5px] px-2 text-[13.5px] font-medium text-ink-2 transition-colors hover:bg-hover hover:text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[current=page]:bg-paper-2 aria-[current=page]:font-semibold aria-[current=page]:text-ink";

/** Crimson 3px bar flush with the sidebar's left edge (sidebar has 14px padding). */
const activeBar =
  "before:absolute before:-left-3.5 before:top-1.5 before:bottom-1.5 before:w-[3px] before:rounded-r-sm before:bg-primary before:opacity-0 aria-[current=page]:before:opacity-100";

export function SidebarNavItem({
  item,
  numbered,
  onNavigate,
}: {
  item: SectionDef;
  /** Show the item's folio number (primary nav only). */
  numbered?: boolean;
  onNavigate?: () => void;
}) {
  const isActive = useIsSectionActive();
  const active = isActive(item.href);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(navItemClass, activeBar)}
    >
      {numbered && item.folio ? (
        <span className="w-4 font-mono text-[10px] font-medium tabular-nums text-ink-3 group-aria-[current=page]:text-accent-ink">
          {item.folio}
        </span>
      ) : null}
      <Icon className="h-4 w-4 shrink-0 text-ink-3 transition-colors group-hover:text-ink-2 group-aria-[current=page]:text-accent-ink" />
      <span className="min-w-0 flex-1 truncate">{item.name}</span>
      {item.live && <LiveDot />}
      {item.badge && item.badge > 0 ? (
        <CountBadge value={item.badge} tone={item.badgeTone} />
      ) : null}
    </Link>
  );
}

/** Numbered primary nav + the Manage group. */
export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const sections = useSections();
  const manage = useManageSections();
  return (
    <>
      <NavLabel>Read</NavLabel>
      <nav aria-label="Primary" className="flex flex-col gap-px">
        {sections.map((s) => (
          <SidebarNavItem key={s.href} item={s} numbered onNavigate={onNavigate} />
        ))}
      </nav>
      {manage.length > 0 && (
        <>
          <NavLabel>Manage</NavLabel>
          <nav aria-label="Manage" className="flex flex-col gap-px">
            {manage.map((s) => (
              <SidebarNavItem key={s.href} item={s} onNavigate={onNavigate} />
            ))}
          </nav>
        </>
      )}
    </>
  );
}

/* ─── Section Pills ────────────────────────────────────────────────────── */

/**
 * Horizontal section pills (underline style). Kept for callers that want an
 * inline section switcher; the shell itself uses the sidebar / tab bar.
 */
export function SectionPills({ className }: { className?: string }) {
  const sections = useSections();
  const isActive = useIsSectionActive();

  return (
    <nav
      aria-label="Sections"
      className={cn("flex items-stretch gap-1 overflow-x-auto scrollbar-hide", className)}
    >
      {sections.map(({ name, href, icon: Icon, badge, badgeTone, live }) => {
        const active = isActive(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className="relative inline-flex h-10 items-center gap-1.5 whitespace-nowrap px-3 text-[13px] font-semibold text-ink-3 transition-colors hover:text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[current=page]:text-ink after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary after:opacity-0 aria-[current=page]:after:opacity-100 max-sm:h-11"
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span>{name}</span>
            {live && <LiveDot className="ml-0.5" />}
            {badge && badge > 0 ? <CountBadge value={badge} tone={badgeTone} /> : null}
          </Link>
        );
      })}
    </nav>
  );
}

/* ─── Section list (vertical) ──────────────────────────────────────────── */

/**
 * Vertical list of the primary sections. Same items as the sidebar, without
 * folio numbers; usable inside any sheet or drawer.
 */
export function SectionList({ onNavigate }: { onNavigate?: () => void }) {
  const sections = useSections();
  return (
    <nav aria-label="Primary" className="flex flex-col gap-px p-3.5">
      {sections.map((s) => (
        <SidebarNavItem key={s.href} item={s} onNavigate={onNavigate} />
      ))}
    </nav>
  );
}
