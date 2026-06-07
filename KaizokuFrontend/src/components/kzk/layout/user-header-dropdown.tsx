"use client";

import { useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useSettings } from "@/lib/api/hooks/useSettings";
import { useTheme } from "next-themes";
import { UserLevel } from "@/lib/api/types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EditUserDialog } from "@/components/kzk/users/user-dialog";
import {
  User,
  Medal,
  Route,
  Copy,
  Edit,
  Moon,
  Sun,
  Monitor,
} from "lucide-react";

const levelLabels: Record<UserLevel, string> = {
  [UserLevel.User]: "User",
  [UserLevel.Manager]: "Manager",
  [UserLevel.Admin]: "Admin",
};

const levelColors: Record<UserLevel, string> = {
  [UserLevel.User]: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  [UserLevel.Manager]: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  [UserLevel.Admin]: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
};

const themeLabels: Record<string, string> = {
  dark: "Dark",
  light: "Light",
  system: "System",
};

const themeCycle: string[] = ["dark", "light", "system"];

function getThemeIcon(theme: string | undefined) {
  switch (theme) {
    case "light":
      return <Sun className="h-4 w-4" />;
    case "system":
      return <Monitor className="h-4 w-4" />;
    case "dark":
    default:
      return <Moon className="h-4 w-4" />;
  }
}

export function UserHeaderDropdown() {
  const { user, refreshAuth } = useAuth();
  const { data: settings } = useSettings();
  const { theme, setTheme } = useTheme();
  const [isEditAvatarOpen, setIsEditAvatarOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!user) return null;

  const externalDomain = settings?.externalDomain || "http://localhost:9833";
  const fullOpdsUrl = `${externalDomain}/${user.opdsPath}`;

  const handleCopyOpds = async () => {
    try {
      await navigator.clipboard.writeText(fullOpdsUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API not available
    }
  };

  const cycleTheme = () => {
    const currentTheme = theme || "dark";
    const currentIndex = themeCycle.indexOf(currentTheme);
    const nextIndex = (currentIndex + 1) % themeCycle.length;
    setTheme(themeCycle[nextIndex] as string);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" className="overflow-hidden rounded-full">
            {user.avatarBase64 ? (
              <img
                src={`data:${user.avatarContentType || "image/png"};base64,${user.avatarBase64}`}
                alt={user.username}
                className="h-full w-full object-cover"
              />
            ) : (
              <User className="h-5 w-5" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          {/* User info section */}
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
              {user.avatarBase64 ? (
                <img
                  src={`data:${user.avatarContentType || "image/png"};base64,${user.avatarBase64}`}
                  alt={user.username}
                  className="h-full w-full rounded-full object-cover"
                />
              ) : (
                <User className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">{user.username}</span>
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${levelColors[user.level]}`}>
                <Medal className="mr-1 h-3 w-3" />
                {levelLabels[user.level]}
              </span>
            </div>
          </div>

          <DropdownMenuSeparator />

          {/* OPDS Path - show only the path, copy the full URL */}
          <div className="flex items-center gap-2 px-2 py-1.5">
            <Route className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="flex-1 truncate text-xs font-mono text-muted-foreground" title={fullOpdsUrl}>
              {user.opdsPath}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={handleCopyOpds}
              title="Copy OPDS URL"
            >
              {copied ? (
                <span className="text-xs text-green-500">✓</span>
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>

          <DropdownMenuSeparator />

          {/* Edit Avatar */}
          <DropdownMenuItem onClick={() => setIsEditAvatarOpen(true)}>
            <Edit className="mr-2 h-4 w-4" />
            Edit Avatar
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {/* Theme cycling */}
          <DropdownMenuItem onClick={cycleTheme}>
            {getThemeIcon(theme)}
            <span className="ml-2">Theme: {themeLabels[theme || "dark"]}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Edit Avatar Dialog - reuses EditUserDialog which hides level/active for self */}
      {user && (
        <EditUserDialog
          user={user}
          open={isEditAvatarOpen}
          onOpenChange={(open) => {
            setIsEditAvatarOpen(open);
            if (!open) {
              // Refresh auth context to pick up avatar changes
              refreshAuth();
            }
          }}
        />
      )}
    </>
  );
}
