'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useSetPassword } from '@/lib/api/hooks/useAuth';
import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowRight } from 'lucide-react';
import { AuthFrame, AuthHeading, AuthNote } from '../../login/auth-frame';

function SetPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const setPasswordMutation = useSetPassword();
  const { setAuthFromToken } = useAuth();

  const username = searchParams.get('username') ?? '';
  const token = searchParams.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!username || !token) {
      setError('Invalid or expired invitation link. Please contact your administrator.');
    }
  }, [username, token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    try {
      const result = await setPasswordMutation.mutateAsync({ username, token, password });
      // Set auth state immediately so the user badge and permissions are available
      setAuthFromToken(result.token, result.user);
      router.push('/library');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set password');
    }
  };

  if (!username || !token) {
    return (
      <div className="w-full max-w-[380px] motion-safe:animate-paper-rise">
        <AuthHeading
          eyebrow="Invitation"
          title={<>Invalid <em>link</em>.</>}
        />
        <AuthNote>
          This invitation link is invalid or has expired. Please contact your administrator
          to receive a new invitation.
        </AuthNote>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[380px] motion-safe:animate-paper-rise">
      <AuthHeading
        id="set-password-title"
        eyebrow="Invitation"
        title={<>Set your <em>password</em>.</>}
        description={<>Hello <b className="font-mono text-[12.5px] font-semibold text-ink">{username}</b>! Please set your password to continue.</>}
      />
      <form onSubmit={handleSubmit} aria-labelledby="set-password-title" className="grid gap-4">
        {error && <AuthNote className="-mt-2">{error}</AuthNote>}
        <div className="grid gap-1.5">
          <Label htmlFor="password">New Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            placeholder="Enter your new password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            autoFocus
          />
          <p className="text-[12.5px] leading-[1.5] text-ink-3">At least 6 characters.</p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="confirmPassword">Confirm Password</Label>
          <Input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            placeholder="Confirm your new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={6}
          />
        </div>
        <Button type="submit" className="mt-1 h-[42px] w-full" disabled={setPasswordMutation.isPending}>
          {setPasswordMutation.isPending ? 'Setting password...' : 'Set Password & Log In'}
          {!setPasswordMutation.isPending && <ArrowRight aria-hidden="true" />}
        </Button>
      </form>
    </div>
  );
}

export default function SetPasswordPage() {
  return (
    <AuthFrame tagline={<>Your shelf is <em>waiting</em>.</>}>
      <Suspense
        fallback={
          <div className="w-full max-w-[380px]" role="status">
            <Skeleton className="mb-3 h-2.5 w-28" />
            <Skeleton className="mb-7 h-10 w-64" />
            <span className="sr-only">Loading...</span>
          </div>
        }
      >
        <SetPasswordForm />
      </Suspense>
    </AuthFrame>
  );
}
