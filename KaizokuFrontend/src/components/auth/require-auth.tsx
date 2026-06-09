"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { Loader2 } from 'lucide-react';
import { PasswordChangeDialog } from './password-change-dialog';

interface RequireAuthProps {
  children: React.ReactNode;
}

/**
 * Wraps children — redirects unauthenticated visitors to /login (auth enabled)
 * or /user-select (auth disabled, profile picker).
 * Shows a spinner while auth state is loading.
 * Shows a blocking password-change dialog if the user's password doesn't meet the current policy.
 */
export function RequireAuth({ children }: RequireAuthProps) {
  const { isAuthenticated, isLoading, needsSetup, isAuthEnabled, requiresPasswordChange, dismissPasswordChange } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (needsSetup) {
      router.replace('/setup');
      return;
    }
    if (!isAuthenticated) {
      router.replace(isAuthEnabled ? '/login' : '/user-select');
    }
  }, [isAuthenticated, isLoading, needsSetup, isAuthEnabled, router]);

  if (isLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
      <PasswordChangeDialog
        open={requiresPasswordChange}
        onPasswordChanged={dismissPasswordChange}
      />
      {children}
    </>
  );
}
