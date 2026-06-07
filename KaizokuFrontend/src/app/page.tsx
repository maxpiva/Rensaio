"use client";

import { useEffect } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useSettings } from "@/lib/api/hooks/useSettings";
import { useRouter } from "next/navigation";

export default function RootPage() {
  const { user, isAuthenticated, isLoading, isAuthEnabled, availableUsers } = useAuth();
  const { data: settings, isLoading: settingsLoading } = useSettings();
  const router = useRouter();

  useEffect(() => {
    if (isLoading || settingsLoading) return; // Wait for both auth and settings to resolve

    if (isAuthenticated) {
      // Already logged in — go to library
      router.replace("/library/");
    } else if (isAuthEnabled) {
      // Auth enabled but not logged in — go to login
      router.replace("/login");
    } else {
      // Auth disabled and not logged in
      if (!availableUsers || availableUsers.length === 0) {
        if (settings?.isWizardSetupComplete) {
          // Setup already ran but no users exist (e.g. upgrade) — show first-user creation
          router.replace("/users");
        } else {
          // Fresh install — setup wizard handles first-run; go to library
          router.replace("/library/");
        }
      } else if (availableUsers.length === 1) {
        // Shouldn't reach here since auto-login handles single user,
        // but fallback to library just in case
        router.replace("/library/");
      } else {
        // Multiple users — show user selection
        router.replace("/user-select");
      }
    }
  }, [isLoading, isAuthenticated, isAuthEnabled, availableUsers, settings, settingsLoading, router]);

  if (isLoading || settingsLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  // Return a minimal loading state while redirect happens
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-lg">Redirecting...</div>
    </div>
  );
}
