'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useSetPassword } from '@/lib/api/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

function SetPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const setPasswordMutation = useSetPassword();

  const username = searchParams.get('username') || '';
  const token = searchParams.get('token') || '';

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
      // Store the token and redirect to library
      sessionStorage.setItem('kaizoku_token', result.token);
      router.push('/library');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set password');
    }
  };

  if (!username || !token) {
    return (
      <Card className="w-full max-w-md mx-4">
        <CardHeader>
          <CardTitle>Invalid Link</CardTitle>
          <CardDescription>
            This invitation link is invalid or has expired. Please contact your administrator
            to receive a new invitation.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md mx-4">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold text-center">Set Your Password</CardTitle>
        <CardDescription className="text-center">
          Hello {username}! Please set your password to continue.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 text-sm text-red-500 bg-red-50 dark:bg-red-950 rounded-md">
              {error}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="password">New Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="Enter your new password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm Password</Label>
            <Input
              id="confirmPassword"
              type="password"
              placeholder="Confirm your new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>
          <Button type="submit" className="w-full" disabled={setPasswordMutation.isPending}>
            {setPasswordMutation.isPending ? 'Setting password...' : 'Set Password & Log In'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export default function SetPasswordPage() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <Suspense
        fallback={
          <Card className="w-full max-w-md mx-4">
            <CardHeader>
              <CardTitle>Loading...</CardTitle>
            </CardHeader>
          </Card>
        }
      >
        <SetPasswordForm />
      </Suspense>
    </div>
  );
}