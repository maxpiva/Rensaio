"use client";

import { useState } from "react";
import {
  Check,
  Copy,
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
import { UserLevel } from "@/lib/api/types";

const LEVEL_LABEL: Record<UserLevel, string> = {
  [UserLevel.User]: "User",
  [UserLevel.Manager]: "Manager",
  [UserLevel.Admin]: "Admin",
  [UserLevel.Owner]: "Owner",
};

const LEVEL_BADGE: Record<UserLevel, string> = {
  [UserLevel.User]: "bg-blue-500/15 text-blue-600 dark:text-blue-300",
  [UserLevel.Manager]: "bg-purple-500/15 text-purple-600 dark:text-purple-300",
  [UserLevel.Admin]: "bg-amber-500/15 text-amber-600 dark:text-amber-300",
  [UserLevel.Owner]: "bg-primary/15 text-primary",
};

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
  const { user, logout, canAdmin, refreshAuth } = useAuth();
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

  const sz = size === "sm" ? "h-7 w-7" : "h-8 w-8";

  if (!user) {
    return (
      <div
        className={`${sz} rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0`}
      >
        <span className="text-[10px] font-semibold text-primary">?</span>
      </div>
    );
  }

  const initials = user.username.slice(0, 2).toUpperCase();

  const avatarSrc = user.avatarBase64
    ? `data:${user.avatarContentType ?? "image/png"};base64,${user.avatarBase64}`
    : null;
  const textSz = size === "sm" ? "text-[10px]" : "text-xs";

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
          <button
            className={`${sz} rounded-full overflow-hidden bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0 hover:bg-primary/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 cursor-pointer`}
            aria-label="User menu"
          >
            {avatarSrc ? (
              // eslint-disable-next-line @next/next/no-img-element -- data: URI not supported by next/image
              <img
                src={avatarSrc}
                alt={user.username}
                width={size === "sm" ? 28 : 32}
                height={size === "sm" ? 28 : 32}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className={`${textSz} font-semibold text-primary`}>
                {initials}
              </span>
            )}
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-60">
          {/* User info */}
          <div className="px-3 py-2 border-b border-border mb-1">
            <p className="text-sm font-medium text-foreground truncate">
              {user.username}
            </p>
            <span
              className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                LEVEL_BADGE[user.level] ?? LEVEL_BADGE[UserLevel.User]
              }`}
            >
              <Medal className="h-3 w-3" />
              {LEVEL_LABEL[user.level] ?? "User"}
            </span>
          </div>

          {/* OPDS path — info row with copy-to-clipboard of the full URL */}
          <div className="flex items-center gap-2 px-3 py-1.5">
            <Route className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span
              className="flex-1 truncate font-mono text-xs text-muted-foreground"
              title={fullOpdsUrl}
            >
              {user.opdsPath}
            </span>
            <button
              type="button"
              onClick={handleCopyOpds}
              title="Copy OPDS URL"
              className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-green-500" />
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

          {/* Trackers */}
          <DropdownMenuItem
            onClick={() => setIsTrackerOpen(true)}
            className="flex items-center gap-2 cursor-pointer"
          >
            <Radio className="h-4 w-4" />
            Trackers...
          </DropdownMenuItem>

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

          <DropdownMenuItem asChild>
            <Link
              href="/settings"
              className="flex items-center gap-2 cursor-pointer"
            >
              <Settings className="h-4 w-4" />
              Settings
            </Link>
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={() => startWizard()}
            className="flex items-center gap-2 cursor-pointer"
          >
            <Download className="h-4 w-4" />
            Import Series
          </DropdownMenuItem>

          <DropdownMenuSeparator />

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
            className="flex items-center gap-2 text-destructive focus:text-destructive cursor-pointer"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Avatar edit dialog — reuses EditUserDialog (hides level/active for self) */}
      <EditUserDialog
        user={user}
        open={isEditOpen}
        onOpenChange={(open) => {
          setIsEditOpen(open);
          // Refresh auth context so an updated avatar shows immediately.
          if (!open) refreshAuth();
        }}
      />

      {/* Tracker / scrobbler management dialog */}
      <UserTrackerRequester open={isTrackerOpen} onOpenChange={setIsTrackerOpen} />
    </>
  );
}
