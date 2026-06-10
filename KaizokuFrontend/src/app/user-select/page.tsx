"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Loader2, AlertCircle, Lock, User as UserIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/auth-context';
import { ApiError } from '@/lib/api/client';
import type { StatusUserEntry } from '@/lib/api/auth-types';

function ProfileAvatar({ entry }: { entry: StatusUserEntry }) {
  if (entry.avatarBase64) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`data:${entry.avatarContentType ?? 'image/png'};base64,${entry.avatarBase64}`}
        alt={entry.displayName || entry.username}
        className="h-20 w-20 rounded-full object-cover border border-border"
      />
    );
  }
  return (
    <div className="h-20 w-20 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
      <UserIcon className="h-10 w-10 text-primary/60" />
    </div>
  );
}

export default function UserSelectPage() {
  const {
    selectUser,
    availableUsers,
    isAuthenticated,
    isAuthEnabled,
    isLoading,
    needsSetup,
    refreshStatus,
  } = useAuth();
  const router = useRouter();

  const [selecting, setSelecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Profile awaiting its password (claimed profiles only). */
  const [passwordPrompt, setPasswordPrompt] = useState<StatusUserEntry | null>(null);
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (isLoading) return;
    if (needsSetup) {
      router.replace('/setup');
      return;
    }
    if (isAuthEnabled) {
      router.replace('/login');
      return;
    }
    if (isAuthenticated) {
      router.replace('/library');
    }
  }, [isLoading, needsSetup, isAuthEnabled, isAuthenticated, router]);

  // Refresh the profile list when the picker opens (it may be stale).
  useEffect(() => {
    if (!isLoading && !isAuthEnabled && !needsSetup) {
      void refreshStatus().catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  const handleSelect = async (entry: StatusUserEntry, enteredPassword?: string) => {
    if (selecting) return;
    setError(null);

    // Claimed profiles need their password — show the prompt instead of selecting.
    if (entry.hasPassword && !enteredPassword) {
      setPasswordPrompt(entry);
      setPassword('');
      return;
    }

    setSelecting(entry.username);
    try {
      await selectUser(entry.username, enteredPassword);
      router.push('/library');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        // Wrong or missing password — (re)open the prompt with the server message.
        setPasswordPrompt(entry);
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : 'Could not select this profile.');
      }
      setSelecting(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[600px] rounded-full opacity-[0.03]"
          style={{
            background: 'radial-gradient(circle, hsl(var(--primary)) 0%, transparent 70%)',
          }}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
        className="relative w-full max-w-2xl"
      >
        <div className="flex flex-col items-center gap-8">
          <div className="flex flex-col items-center gap-3">
            <div className="h-14 w-14 flex items-center justify-center rounded-xl bg-primary/10 border border-primary/20">
              <Image
                src="/kaizoku.net.png"
                alt="Kaizoku.NET"
                width={36}
                height={36}
                className="h-9 w-9 object-contain"
                priority
              />
            </div>
            <div className="text-center">
              <h1 className="text-2xl font-semibold text-foreground">Who&apos;s reading?</h1>
              <p className="text-sm text-muted-foreground mt-1">Select your profile to continue</p>
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2.5 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2.5">
              <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {passwordPrompt ? (
            <form
              className="flex w-full max-w-xs flex-col items-center gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                void handleSelect(passwordPrompt, password);
              }}
            >
              <div className="flex flex-col items-center gap-2">
                <div className="relative">
                  <ProfileAvatar entry={passwordPrompt} />
                  {selecting === passwordPrompt.username && (
                    <div className="absolute inset-0 flex items-center justify-center rounded-full bg-background/60">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    </div>
                  )}
                </div>
                <span className="text-sm font-medium text-foreground">
                  {passwordPrompt.displayName || passwordPrompt.username}
                </span>
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Lock className="h-3 w-3" />
                  This profile is protected by a password
                </p>
              </div>
              <Input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                disabled={!!selecting}
              />
              <div className="flex w-full gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  disabled={!!selecting}
                  onClick={() => {
                    setPasswordPrompt(null);
                    setPassword('');
                    setError(null);
                  }}
                >
                  Back
                </Button>
                <Button type="submit" className="flex-1" disabled={!!selecting || !password}>
                  Continue
                </Button>
              </div>
            </form>
          ) : (
            <div className="flex flex-wrap items-start justify-center gap-6">
              {availableUsers.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => void handleSelect(entry)}
                  disabled={!!selecting}
                  className="group flex w-28 flex-col items-center gap-2 rounded-xl p-3 transition-colors hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                >
                  <div className="relative">
                    <ProfileAvatar entry={entry} />
                    {selecting === entry.username && (
                      <div className="absolute inset-0 flex items-center justify-center rounded-full bg-background/60">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="max-w-full truncate text-center text-sm font-medium text-foreground">
                      {entry.displayName || entry.username}
                    </span>
                    {entry.hasPassword && <Lock className="h-3 w-3 shrink-0 text-muted-foreground" />}
                  </div>
                </button>
              ))}
            </div>
          )}

          {!passwordPrompt && availableUsers.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No profiles available. Ask your administrator to create one.
            </p>
          )}
        </div>
      </motion.div>
    </div>
  );
}
