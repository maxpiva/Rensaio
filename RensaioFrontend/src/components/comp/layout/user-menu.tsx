"use client";

import { useState } from "react";
import {
  Check,
  Copy,
  Database,
  Download,
  Edit,
  LogOut,
  Medal,
  Monitor,
  Moon,
  Radio,
  Route,
  Settings,
  Sun,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useTheme } from "next-themes";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/contexts/auth-context";
import { useSettings } from "@/lib/api/hooks/useSettings";
import { useImportWizard } from "@/components/providers/import-wizard-provider";
import { EditUserDialog } from "@/components/comp/users/user-dialog";
import { UserTrackerRequester } from "@/components/comp/scrobbler/user-tracker-requester";
import { ExternalLinks } from "@/components/comp/layout/external-links";
import { UserLevel } from "@/lib/api/types";
import { cn } from "@/lib/utils";

export const LEVEL_LABEL: Record<UserLevel, string> = {
  [UserLevel.User]: "User",
  [UserLevel.Manager]: "Manager",
  [UserLevel.Admin]: "Admin",
  [UserLevel.Owner]: "Owner",
};

export const LEVEL_BADGE: Record<UserLevel, string> = {
  [UserLevel.User]: "bg-info-soft text-info",
  [UserLevel.Manager]: "bg-ok-soft text-ok",
  [UserLevel.Admin]: "bg-warn-soft text-warn",
  [UserLevel.Owner]: "bg-accent-soft text-accent-ink",
};

/**
 * Round avatar: the user's uploaded image, or initials on the Paper
 * amber→crimson gradient. Presentational only (no menu).
 */
export function UserAvatar({
  username,
  avatarBase64,
  avatarContentType,
  className,
}: {
  username?: string | null;
  avatarBase64?: string | null;
  avatarContentType?: string | null;
  /** Size + text size, e.g. "h-10 w-10 text-[13px]". Default 30px. */
  className?: string;
}) {
  const initials = (username ?? "?").slice(0, 2).toUpperCase();
  return (
    <span
      className={cn(
        "grid h-[30px] w-[30px] shrink-0 place-items-center overflow-hidden rounded-full bg-[linear-gradient(135deg,#d97706,#be123c)] text-[11px] font-bold tracking-[0.02em] text-white",
        className,
      )}
    >
      {avatarBase64 ? (
        // eslint-disable-next-line @next/next/no-img-element -- data: URI not supported by next/image
        <img
          src={`data:${avatarContentType ?? "image/png"};base64,${avatarBase64}`}
          alt=""
          className="h-full w-full object-cover"
        />
      ) : (
        initials
      )}
    </span>
  );
}

const THEME_CYCLE = ["light", "dark", "system"] as const;

function themeIcon(theme: string | undefined) {
  switch (theme) {
    case "light":
      return <Sun className="h-4 w-4" />;
    case "system":
      return <Monitor className="h-4 w-4" />;
    default:
      return <Moon className="h-4 w-4" />;
  }
}

function themeLabel(theme: string | undefined) {
  switch (theme) {
    case "light":
      return "Light";
    case "system":
      return "System";
    default:
      return "Dark";
  }
}

/**
 * User avatar dropdown — extracted from the old header.tsx so both desktop
 * command bar and mobile chrome can share a single source of truth.
 *
 * Carries the full 2.0 menu (OPDS path, avatar edit, trackers, theme cycle)
 * alongside the fork's extras (Users, Settings, Import Series). Theme cycling
 * lives here too because the standalone toggle in the command bar is
 * desktop-only (`hidden lg:flex`), so this is the sole theme control on mobile.
 */
export function UserAvatarDropdown({ size = "md" }: { size?: "sm" | "md" }) {
  const { user, logout, canManage, canAdmin, canOwner, refreshAuth } = useAuth();
  const { startWizard } = useImportWizard();
  const { data: settings } = useSettings();
  const { theme, setTheme } = useTheme();

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isTrackerOpen, setIsTrackerOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleLogout = async () => {
    // logout() routes to /login (auth enabled) or /user-select (profile mode).
    await logout();
  };

  const cycleTheme = () => {
    const current = theme ?? "dark";
    const idx = THEME_CYCLE.findIndex((t) => t === current);
    setTheme(THEME_CYCLE[(idx + 1) % THEME_CYCLE.length]!);
  };

  const sz = size === "sm" ? "h-7 w-7 text-[10px]" : "h-[30px] w-[30px] text-[11px]";

  if (!user) {
    return (
      <div
        className={`${sz} rounded-full border border-rule-2 bg-paper-2 flex items-center justify-center shrink-0`}
      >
        <span className="text-[10px] font-semibold text-ink-3">?</span>
      </div>
    );
  }

  // `||` on purpose: an empty externalDomain falls back too.
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  const externalDomain = settings?.externalDomain || "http://localhost:9833";
  const fullOpdsUrl = `${externalDomain}/${user.opdsPath}`;

  const handleCopyOpds = async () => {
    try {
      await navigator.clipboard.writeText(fullOpdsUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API not available (e.g. insecure context) — ignore.
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {/* 36px hit area on desktop, 44px on phone; the avatar stays 28-30px. */}
          <button
            className="group flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background max-lg:h-11 max-lg:w-11"
            aria-label="User menu"
          >
            <UserAvatar
              username={user.username}
              avatarBase64={user.avatarBase64}
              avatarContentType={user.avatarContentType}
              className={`${sz} ring-1 ring-rule transition-[box-shadow] group-hover:ring-2 group-hover:ring-rule-2 group-data-[state=open]:ring-2 group-data-[state=open]:ring-accent-line`}
            />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-64">
          {/* User info — username left, role badge inline on the right */}
          <div className="mb-1 border-b border-rule px-2.5 pb-2.5 pt-1.5">
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 flex-1 truncate font-serif text-[17px] leading-tight text-ink">
                {user.username}
              </p>
              <span
                className={`shrink-0 inline-flex h-[22px] items-center gap-1 rounded-[4px] px-2 text-[11px] font-semibold ${
                  LEVEL_BADGE[user.level] ?? LEVEL_BADGE[UserLevel.User]
                }`}
              >
                <Medal className="h-3 w-3" />
                {LEVEL_LABEL[user.level] ?? "User"}
              </span>
            </div>
          </div>

          {/* OPDS path — info row with copy-to-clipboard of the full URL */}
          <div className="flex items-center gap-2 px-2.5 py-1">
            <Route className="h-4 w-4 shrink-0 text-ink-3" />
            <span
              className="flex-1 truncate font-mono text-[11.5px] text-ink-2"
              title={fullOpdsUrl}
            >
              {user.opdsPath}
            </span>
            <button
              type="button"
              onClick={handleCopyOpds}
              title="Copy OPDS URL"
              aria-label={copied ? "OPDS URL copied" : "Copy OPDS URL"}
              className="flex h-7 w-7 items-center justify-center rounded-md text-ink-3 hover:bg-hover hover:text-ink transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring max-sm:h-11 max-sm:w-11"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-ok" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
          </div>

          <DropdownMenuSeparator />

          {/* Edit avatar */}
          <DropdownMenuItem
            onClick={() => setIsEditOpen(true)}
            className="flex items-center gap-2 cursor-pointer"
          >
            <Edit className="h-4 w-4" />
            Edit...
          </DropdownMenuItem>

          {/* External Services */}
          <DropdownMenuItem
            onClick={() => setIsTrackerOpen(true)}
            className="flex items-center gap-2 cursor-pointer"
          >
            <Radio className="h-4 w-4" />
            External Services...
          </DropdownMenuItem>

          {/* Mappings — Manager+ (Managers, Admins, Owner). */}
          {canManage && (
            <DropdownMenuItem asChild>
              <Link
                href="/external-mappings"
                className="flex items-center gap-2 cursor-pointer"
              >
                <Database className="h-4 w-4" />
                Mappings
              </Link>
            </DropdownMenuItem>
          )}

          {/* Contribution — Owner only, contribution enabled, AND the Contributor Id
              must be verified against the contribution database. */}
          {canOwner && settings?.contributionEnabled && settings?.contributionVerified && (
            <DropdownMenuItem asChild>
              <Link
                href="/contribution"
                className="flex items-center gap-2 cursor-pointer"
              >
                <Database className="h-4 w-4" />
                Contribution
              </Link>
            </DropdownMenuItem>
          )}

          <DropdownMenuSeparator />

          {canAdmin && (
            <DropdownMenuItem asChild>
              <Link
                href="/users"
                className="flex items-center gap-2 cursor-pointer"
              >
                <Users className="h-4 w-4" />
                Users
              </Link>
            </DropdownMenuItem>
          )}

          {/* Settings — Owner only (Admins and below have no access). */}
          {canOwner && (
            <DropdownMenuItem asChild>
              <Link
                href="/settings"
                className="flex items-center gap-2 cursor-pointer"
              >
                <Settings className="h-4 w-4" />
                Settings
              </Link>
            </DropdownMenuItem>
          )}

          {/* Import Series — Manager+ (Users have no access). */}
          {canManage && (
            <DropdownMenuItem
              onClick={() => startWizard()}
              className="flex items-center gap-2 cursor-pointer"
            >
              <Download className="h-4 w-4" />
              Import Series
            </DropdownMenuItem>
          )}

          {(canOwner || canManage) && <DropdownMenuSeparator />}

          {/* Theme cycle — keep the menu open so the user can cycle in place */}
          <DropdownMenuItem
            onSelect={(e) => e.preventDefault()}
            onClick={cycleTheme}
            className="flex items-center gap-2 cursor-pointer"
          >
            {themeIcon(theme)}
            Theme: {themeLabel(theme)}
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onClick={handleLogout}
            className="flex items-center gap-2 cursor-pointer"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {/* Project links — restored from the old sidebar footer. */}
          <ExternalLinks className="px-2 py-1" />
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Avatar edit dialog — reuses EditUserDialog (hides level/active for self) */}
      <EditUserDialog
        user={user}
        open={isEditOpen}
        onOpenChange={(open) => {
          setIsEditOpen(open);
          // Refresh auth context so an updated avatar shows immediately.
          if (!open) void refreshAuth();
        }}
      />

      {/* Tracker / scrobbler management dialog */}
      <UserTrackerRequester open={isTrackerOpen} onOpenChange={setIsTrackerOpen} />
    </>
  );
}
