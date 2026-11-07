'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useClaimUser, useCreateFirstUser } from '@/lib/api/hooks/useAuth';
import { useAuth } from '@/contexts/auth-context';
import { UserLevel } from '@/lib/api/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { UserAvatar } from '@/components/comp/layout/user-menu';
import { UserIcon, Check, ChevronRight, Loader2 } from 'lucide-react';
import { PaperNote, PaperPanel, StepIntro } from '../paper';

interface IdentifyUserStepProps {
  setError: (error: string | null) => void;
  setIsLoading: (loading: boolean) => void;
  setCanProgress: (canProgress: boolean) => void;
  /** List of usernames that were auto-created during import */
  autoCreatedUsers: string[];
}

export function IdentifyUserStep({
  setError,
  setIsLoading,
  setCanProgress,
  autoCreatedUsers,
}: IdentifyUserStepProps) {
  const { availableUsers, refreshAuth } = useAuth();
  const claimUser = useClaimUser();
  const createFirstUser = useCreateFirstUser();
  const [claimed, setClaimed] = useState(false);
  const [selectedUsername, setSelectedUsername] = useState('');
  const [localError, setLocalError] = useState('');
  const [refreshing, setRefreshing] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [created, setCreated] = useState(false);
  const hasRefreshedRef = useRef(false);

  // Refresh auth context on mount so availableUsers is up-to-date
  // (users may have been created during the previous step)
  useEffect(() => {
    if (!hasRefreshedRef.current) {
      hasRefreshedRef.current = true;
      setRefreshing(true);
      void refreshAuth().finally(() => {
        setRefreshing(false);
      });
    }
  }, [refreshAuth]);

  // All users from the database (after refresh)
  const allUsers = availableUsers ?? [];

  // Detect if any user already has Owner level — this covers the case where the
  // user re-navigates to this step after already creating/claiming an owner,
  // or where an owner was established earlier in the wizard flow.
  // `allUsers` includes the full `User` object with `level` (see AuthController.GetStatus).
  const existingOwner = allUsers.find((u) => u.level >= UserLevel.Owner);

  // Sync local state when an existing owner is detected from server data
  // so that canProgress is set and the UI transitions to the completed state
  // without showing the claim/create UI again.
  useEffect(() => {
    if (existingOwner && !claimed && !created) {
      setSelectedUsername(existingOwner.username);
      setCanProgress(true);
    }
  }, [existingOwner, claimed, created, setCanProgress]);

  // Prioritise showing auto-created users first, then all other available users
  const autoCreatedMatch = allUsers.filter(
    (u) => autoCreatedUsers.includes(u.username)
  );
  const otherUsers = allUsers.filter(
    (u) => !autoCreatedUsers.includes(u.username)
  );
  const displayUsers = autoCreatedMatch.length > 0
    ? [...autoCreatedMatch, ...otherUsers]
    : allUsers;

  const handleClaim = async (userId: string, username: string) => {
    setLocalError('');
    setError(null);
    setIsLoading(true);
    setSelectedUsername(username);

    try {
      await claimUser.mutateAsync(userId);
      await refreshAuth();
      setClaimed(true);
      setCanProgress(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to claim user';
      setLocalError(msg);
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateOwner = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');
    setError(null);
    setIsLoading(true);

    if (newUsername.length < 3 || newUsername.length > 32) {
      setLocalError('Username must be between 3 and 32 characters');
      setIsLoading(false);
      return;
    }

    try {
      await createFirstUser.mutateAsync({ username: newUsername });
      await refreshAuth();
      setCreated(true);
      setSelectedUsername(newUsername);
      setCanProgress(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create owner user';
      setLocalError(msg);
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  // Show a skeleton while refreshing available users
  if (refreshing) {
    return (
      <div className="max-w-[560px] space-y-3" role="status" aria-label="Loading users...">
        <span className="flex items-center gap-2 font-mono text-[11.5px] font-medium text-ink-3">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-accent-ink" aria-hidden />
          Loading users...
        </span>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-[60px] w-full" />
        ))}
      </div>
    );
  }

  // Completed state: user has claimed, created, or an existing owner was detected
  const isComplete = claimed || created || !!existingOwner;
  const displayUsername = existingOwner?.username ?? selectedUsername;

  if (isComplete) {
    return (
      <PaperPanel as="section" aria-labelledby="identify-done" className="max-w-[560px] motion-safe:animate-paper-rise">
        <div className="flex items-center gap-3 border-b border-rule px-4 py-3.5">
          <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full border-[1.5px] border-ok/35 bg-ok-soft text-ok">
            <Check className="h-4 w-4 stroke-[2.4]" aria-hidden />
          </span>
          <h3 id="identify-done" className="font-serif text-[20px] font-normal leading-tight tracking-[-0.01em] text-ink">
            User Identified
          </h3>
        </div>
        <div className="space-y-2 px-4 py-4 text-[13.5px] leading-[1.55] text-ink-2">
          <p className="flex flex-wrap items-center gap-2 text-ink">
            You are now identified as
            <span className="inline-flex items-center gap-1.5 font-mono font-semibold">
              <UserAvatar username={displayUsername} className="h-6 w-6 text-[9.5px]" />
              {displayUsername}
              <span className="font-sans font-normal">!</span>
            </span>
          </p>
          <p>
            You have been promoted to owner. No password was set - authentication
            is disabled by default. You can enable authentication later in Settings.
          </p>
        </div>
      </PaperPanel>
    );
  }

  // No users exist at all — offer to create the owner user
  if (allUsers.length === 0 || showCreateForm) {
    return (
      <section aria-labelledby="identify-create" className="max-w-[460px]">
        <h3 id="identify-create" className="mb-1.5 flex items-center gap-2 font-serif text-[22px] font-normal leading-tight tracking-[-0.01em] text-ink">
          <UserIcon className="h-[18px] w-[18px] text-accent-ink" aria-hidden />
          Create Owner User
        </h3>
        <StepIntro className="mb-5">
          No users were found in the system. Create your owner account to get started.
          You can set a password later when you enable authentication.
        </StepIntro>

        {localError && (
          <PaperNote tone="bad" role="alert" className="mb-4">{localError}</PaperNote>
        )}

        <form onSubmit={handleCreateOwner} className="space-y-4">
          <div className="grid gap-1.5">
            <Label htmlFor="identify-owner-username">Owner Username</Label>
            <Input
              id="identify-owner-username"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              placeholder="Enter your username"
              autoComplete="username"
              required
              minLength={3}
              maxLength={32}
              autoFocus
              aria-invalid={localError ? true : undefined}
            />
            <p className="text-[12px] text-ink-3">3–32 characters.</p>
          </div>

          <Button type="submit" disabled={createFirstUser.isPending} className="max-sm:w-full">
            <UserIcon aria-hidden />
            {createFirstUser.isPending ? 'Creating...' : 'Create Owner User'}
          </Button>
        </form>
      </section>
    );
  }

  // Users exist but no owner has been established — show the list of users to select/claim
  return (
    <div className="max-w-[560px] space-y-4">
      <StepIntro>
        {autoCreatedMatch.length > 0
          ? 'Users were found from your imported series data. Select which user you are to be promoted to owner.'
          : 'Existing users were found in the system. Select which user you are to be promoted to owner.'}
      </StepIntro>

      {localError && (
        <PaperNote tone="bad" role="alert">{localError}</PaperNote>
      )}

      <ul className="overflow-hidden rounded-md border border-rule bg-paper-1 shadow-paper" aria-label="Users">
        {displayUsers.map((u, i) => {
          const pending = claimUser.isPending && selectedUsername === u.username;
          const fromImport = autoCreatedUsers.includes(u.username);
          return (
            <li key={u.id} className="border-b border-rule last:border-b-0">
              <button
                type="button"
                className="group flex min-h-[60px] w-full items-center gap-3 px-4 py-2.5 text-left outline-none transition-colors hover:bg-hover focus-visible:bg-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 motion-safe:animate-paper-rise"
                style={{ animationDelay: `${i * 40}ms` }}
                onClick={() => handleClaim(u.id, u.username)}
                disabled={claimUser.isPending}
              >
                <UserAvatar
                  username={u.username}
                  avatarBase64={u.avatarBase64}
                  avatarContentType={u.avatarContentType}
                  className="h-9 w-9 text-[12px]"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold text-ink">{u.username}</span>
                  {fromImport && (
                    <span className="mt-0.5 block font-mono text-[10.5px] font-medium uppercase tracking-[0.1em] text-ink-3">
                      From import
                    </span>
                  )}
                </span>
                {pending ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-accent-ink" aria-hidden />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5 group-hover:text-ink" aria-hidden />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
