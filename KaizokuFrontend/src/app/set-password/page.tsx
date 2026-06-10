"use client";

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { Eye, EyeOff, Loader2, AlertCircle, CheckCircle2, XCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { authService } from '@/lib/api/services/authService';
import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function PasswordCheck({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`flex items-center gap-1 text-xs transition-colors ${
        ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'
      }`}
    >
      {ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
      {label}
    </span>
  );
}

function SetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthEnabled, selectUser } = useAuth();
  const token = searchParams.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const passwordChecks = {
    length: password.length >= 8,
    letter: /[a-zA-Z]/.test(password),
    number: /[0-9]/.test(password),
  };
  const isPasswordValid = Object.values(passwordChecks).every(Boolean);
  const passwordsMatch = password.length > 0 && password === confirmPassword;
  const canSubmit = token && isPasswordValid && passwordsMatch && !isSubmitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setError(null);
    setIsSubmitting(true);
    try {
      const user = await authService.setPassword({ token, newPassword: password });
      setDone(true);
      if (isAuthEnabled) {
        // Password login is required — send them to the login form.
        router.push('/login');
      } else {
        // Profile-picker mode — select the freshly protected profile directly.
        try {
          await selectUser(user.username);
          router.push('/library');
        } catch {
          router.push('/user-select');
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set password.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
        className="relative w-full max-w-sm"
      >
        <div className="rounded-xl border bg-card shadow-lg p-8 space-y-6">
          <div className="flex flex-col items-center gap-3">
            <div className="h-12 w-12 flex items-center justify-center rounded-xl bg-primary/10 border border-primary/20">
              <Image
                src="/kaizoku.net.png"
                alt="Kaizoku.NET"
                width={32}
                height={32}
                className="h-8 w-8 object-contain"
                priority
              />
            </div>
            <div className="text-center">
              <h1 className="text-xl font-semibold text-foreground">Set your password</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                You&apos;ve been invited to Kaizoku.NET
              </p>
            </div>
          </div>

          {!token && (
            <div className="flex items-start gap-2.5 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2.5">
              <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-sm text-destructive">
                Missing invite token. Use the full link from your invite message.
              </p>
            </div>
          )}

          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="flex items-start gap-2.5 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2.5"
            >
              <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-sm text-destructive">{error}</p>
            </motion.div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="password">New Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="Choose a strong password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isSubmitting || !token || done}
                  required
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {password && (
                <div className="flex gap-3 flex-wrap mt-1.5">
                  <PasswordCheck ok={passwordChecks.length} label="8+ chars" />
                  <PasswordCheck ok={passwordChecks.letter} label="Letter" />
                  <PasswordCheck ok={passwordChecks.number} label="Number" />
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                placeholder="Re-enter your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={isSubmitting || !token || done}
                required
              />
              {confirmPassword && (
                <div className="mt-1.5">
                  <PasswordCheck
                    ok={passwordsMatch}
                    label={passwordsMatch ? 'Passwords match' : 'Passwords do not match'}
                  />
                </div>
              )}
            </div>

            <Button type="submit" className="w-full" disabled={!canSubmit || done}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Setting password...
                </>
              ) : (
                'Set password'
              )}
            </Button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}

export default function SetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-background">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
    >
      <SetPasswordForm />
    </Suspense>
  );
}
