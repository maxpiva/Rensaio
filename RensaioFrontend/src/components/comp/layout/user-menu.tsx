"use client";

import { Download, LogOut, Settings, Users } from "lucide-react";
import Link from "next/link";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/contexts/auth-context";
import { useImportWizard } from "@/components/providers/import-wizard-provider";
import { UserLevel } from "@/lib/api/types";

const LEVEL_LABEL: Record<UserLevel, string> = {
  [UserLevel.User]: "User",
  [UserLevel.Manager]: "Manager",
  [UserLevel.Admin]: "Admin",
  [UserLevel.Owner]: "Owner",
};

/**
 * User avatar dropdown — extracted from the old header.tsx so both desktop
 * command bar and mobile chrome can share a single source of truth.
 */
export function UserAvatarDropdown({ size = "md" }: { size?: "sm" | "md" }) {
  const { user, logout, canAdmin } = useAuth();
  const { startWizard } = useImportWizard();

  const handleLogout = async () => {
    // logout() routes to /login (auth enabled) or /user-select (profile mode).
    await logout();
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
    ? `data:${user.avatarContentType ?? 'image/png'};base64,${user.avatarBase64}`
    : null;
  const textSz = size === "sm" ? "text-[10px]" : "text-xs";

  return (
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

      <DropdownMenuContent align="end" className="w-52">
        <div className="px-3 py-2 border-b border-border mb-1">
          <p className="text-sm font-medium text-foreground truncate">
            {user.username}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {LEVEL_LABEL[user.level] ?? "User"}
          </p>
        </div>

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

        <DropdownMenuItem
          onClick={handleLogout}
          className="flex items-center gap-2 text-destructive focus:text-destructive cursor-pointer"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
