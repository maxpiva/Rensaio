"use client";

import React from "react";

import { useAuth } from "@/contexts/auth-context";

/**
 * Thin auth gate for the page shell.
 *
 * Rensaiō 2.0's `AuthProvider` already redirects unauthenticated users to
 * `/login` (auth enabled) or `/user-select` (profile mode) on its own, so this
 * wrapper only needs to hold a loading state until the auth status resolves —
 * avoiding a flash of the shell before the redirect fires. (The Kaizoku
 * original also handled forced password-change here; 2.0 drives that through its
 * own login flow, so it's not needed.)
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-dvh w-full items-center justify-center bg-muted/40">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
      </div>
    );
  }

  return <>{children}</>;
}
