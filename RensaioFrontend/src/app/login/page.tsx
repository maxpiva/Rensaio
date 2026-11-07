'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { ArrowRight, KeyRound } from 'lucide-react';
import { AuthFrame, AuthHeading, AuthNote, OrRule } from './auth-frame';

const REMEMBERED_USER_KEY = 'rensaio_remembered_username';

// Error codes the OIDC callback can redirect back with (?error=oidc_*)
const OIDC_ERRORS: Record<string, string> = {
  oidc_denied: 'Sign-in was cancelled at the identity provider.',
  oidc_no_account: 'No Rensaiō account matches your identity. Ask an administrator to create one.',
  oidc_inactive: 'This account is disabled.',
  oidc_owner: 'The owner account must log in with its password.',
  oidc_state: 'The sign-in request expired. Please try again.',
  oidc_token: 'The identity provider response could not be verified. Please try again.',
  oidc_claims: 'The identity provider did not return a username. Check the OIDC claim settings.',
  oidc_provider: 'The identity provider could not be reached. Check the OIDC settings.',
};

function buildSsoUrl(rememberMe: boolean): string {
  const params = new URLSearchParams({ rememberMe: String(rememberMe), returnTo: '/library' });
  return `/api/auth/oidc/login?${params.toString()}`;
}

function LoginForm() {
  const searchParams = useSearchParams();
  const { login, completeSsoLogin, isAuthEnabled, isLoading: authLoading, oidc } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const ssoHandled = useRef(false);
  // Once anything has gone wrong on this page, never auto-redirect again: the user
  // must see the error and click the button themselves.
  const autoRedirectBlocked = useRef(false);

  const ssoCode = searchParams.get('sso');
  const ssoError = searchParams.get('error');
  const ssoEnabled = !!oidc?.enabled;
  const showPasswordForm = !oidc?.hidePasswordLogin;

  // On mount, pre-fill username from localStorage if previously remembered
  useEffect(() => {
    const rememberedUsername = localStorage.getItem(REMEMBERED_USER_KEY);
    if (rememberedUsername) {
      setUsername(rememberedUsername);
      setRememberMe(true);
    }
  }, []);

  // Surface an error the OIDC callback redirected back with
  useEffect(() => {
    if (ssoError) {
      autoRedirectBlocked.current = true;
      setError(OIDC_ERRORS[ssoError] ?? 'Single sign-on failed.');
    }
  }, [ssoError]);

  // Finish an OIDC login: exchange the one-time code for a session.
  // Wait for the provider's own startup check to finish first, otherwise its failed
  // refresh-token attempt lands after our exchange and clears the user again.
  useEffect(() => {
    if (!ssoCode || ssoHandled.current || authLoading) return;
    ssoHandled.current = true;
    setLoading(true);
    // An empty ?returnTo= also falls back to the library.
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    const returnTo = searchParams.get('returnTo') || '/library';
    completeSsoLogin(ssoCode, returnTo).catch((err) => {
      autoRedirectBlocked.current = true;
      setError(err instanceof Error ? err.message : 'Single sign-on failed.');
      setLoading(false);
      // Drop the spent code from the URL so a refresh shows the form, not the same error
      window.history.replaceState(null, '', '/login');
    });
  }, [ssoCode, searchParams, completeSsoLogin, authLoading]);

  // Auto-redirect: go straight to the provider unless we are mid-flow, showing an error,
  // or the user just logged out (they get the page with the button instead).
  useEffect(() => {
    if (authLoading || !oidc?.enabled || !oidc.autoRedirect || ssoCode || ssoError) return;
    if (autoRedirectBlocked.current || ssoHandled.current) return;
    let justLoggedOut = false;
    try {
      justLoggedOut = sessionStorage.getItem('rensaio_logged_out') === '1';
      sessionStorage.removeItem('rensaio_logged_out');
    } catch { /* storage unavailable */ }
    if (!justLoggedOut) {
      window.location.href = buildSsoUrl(true);
    }
  }, [authLoading, oidc, ssoCode, ssoError]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(username, password, rememberMe);
      // Persist or clear the remembered username based on checkbox state
      if (rememberMe) {
        localStorage.setItem(REMEMBERED_USER_KEY, username);
      } else {
        localStorage.removeItem(REMEMBERED_USER_KEY);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  // Auth status still loading: show the bare frame. Checking only
  // !isAuthEnabled is not enough: startup sets isAuthEnabled before the
  // refresh-token check finishes, and a login in that gap would be wiped out
  // when the stale refresh fails.
  if (authLoading) {
    return <AuthFrame><span className="sr-only" role="status">Loading...</span></AuthFrame>;
  }

  // If auth is disabled, redirect is handled by layout
  if (!isAuthEnabled) {
    return (
      <AuthFrame>
        <div className="w-full max-w-[380px] motion-safe:animate-paper-rise">
          <AuthHeading
            eyebrow="Sign in"
            title={<>Authentication <em>disabled</em>.</>}
            description="Authentication is not enabled. Please go back to the user selection page."
          />
          <Button onClick={() => window.location.href = '/user-select'} className="h-[42px] w-full">
            Go to User Selection
            <ArrowRight aria-hidden="true" />
          </Button>
        </div>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame>
      <div className="w-full max-w-[380px] motion-safe:animate-paper-rise">
        <AuthHeading
          id="login-title"
          eyebrow="Sign in"
          title={<>Welcome <em>back</em>.</>}
          description={ssoCode ? 'Signing you in...' : showPasswordForm ? 'Enter your credentials to log in' : 'Sign in to continue'}
        />

        {error && <AuthNote className="-mt-2 mb-[18px]">{error}</AuthNote>}

        {showPasswordForm && (
          <form onSubmit={handleSubmit} aria-labelledby="login-title" className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                type="text"
                autoComplete="username"
                placeholder="Enter your username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={error ? true : undefined}
                required
              />
            </div>
            <div className="flex min-h-11 items-center gap-2.5 sm:min-h-0">
              <Checkbox
                id="rememberMe"
                checked={rememberMe}
                onCheckedChange={(checked) => setRememberMe(checked === true)}
              />
              <Label htmlFor="rememberMe" className="cursor-pointer text-[13px] font-normal text-ink-2">
                Remember me
              </Label>
            </div>
            <Button type="submit" className="h-[42px] w-full" disabled={loading}>
              {loading ? 'Logging in...' : 'Log in'}
              {!loading && <ArrowRight aria-hidden="true" />}
            </Button>
          </form>
        )}

        {ssoEnabled && showPasswordForm && <OrRule />}

        {ssoEnabled && (
          <Button
            type="button"
            variant={showPasswordForm ? 'outline' : 'default'}
            className="h-[42px] w-full"
            disabled={loading}
            onClick={() => { window.location.href = buildSsoUrl(rememberMe || !showPasswordForm); }}
          >
            <KeyRound aria-hidden="true" />
            {oidc?.buttonLabel || 'Single Sign-On'}
          </Button>
        )}
      </div>
    </AuthFrame>
  );
}

export default function LoginPage() {
  // useSearchParams needs a Suspense boundary under static export
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
