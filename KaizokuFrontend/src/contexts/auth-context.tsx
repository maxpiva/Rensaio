"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { tokenStore, registerLogoutCallback } from '@/lib/auth-token-store';
import { authService } from '@/lib/api/services/authService';
import { userService } from '@/lib/api/services/userService';
import type { StatusUserEntry, UserDetail } from '@/lib/api/auth-types';

interface AuthContextType {
  user: UserDetail | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  needsSetup: boolean;
  /** True when password-based JWT authentication is enforced by the server. */
  isAuthEnabled: boolean;
  /** Profile list for the user selector (populated only when auth is disabled). */
  availableUsers: StatusUserEntry[];
  /** True when auth is disabled and no admin has a password set yet. */
  needsAdminPassword: boolean;
  /** True when the user logged in with a password that doesn't meet the current policy. */
  requiresPasswordChange: boolean;
  login: (username: string, password: string, rememberMe?: boolean) => Promise<void>;
  register: (
    username: string,
    password: string,
    displayName: string,
    inviteCode: string
  ) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (user: UserDetail) => void;
  /** Legacy password-at-setup flow — used only when auth is already enabled. */
  setup: (username: string, password: string, displayName: string) => Promise<void>;
  /** Passwordless first-admin creation (default flow; auth disabled). */
  createFirstUser: (username: string, displayName: string, password?: string) => Promise<void>;
  /** Selects a profile in auth-disabled mode and loads it as the current user.
   *  Claimed (password-protected) profiles require their password. */
  selectUser: (username: string, password?: string) => Promise<void>;
  /** Re-fetches /api/auth/status (e.g. after user CRUD or toggling auth). */
  refreshStatus: () => Promise<void>;
  /** Clear the password change requirement after the user has updated their password. */
  dismissPasswordChange: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [isAuthEnabled, setIsAuthEnabled] = useState(false);
  const [availableUsers, setAvailableUsers] = useState<StatusUserEntry[]>([]);
  const [needsAdminPassword, setNeedsAdminPassword] = useState(false);
  const [requiresPasswordChange, setRequiresPasswordChange] = useState(false);
  const router = useRouter();
  const queryClient = useQueryClient();
  const initializedRef = useRef(false);
  const isAuthEnabledRef = useRef(false);
  isAuthEnabledRef.current = isAuthEnabled;

  const doLogout = useCallback(async () => {
    if (isAuthEnabledRef.current) {
      try {
        await authService.logout();
      } catch {
        // swallow — clear tokens regardless
      } finally {
        tokenStore.clearTokens();
        tokenStore.clearSelectedUser();
        queryClient.clear(); // cached per-user data must not leak to the next identity
        setUser(null);
        setRequiresPasswordChange(false);
        router.push('/login');
      }
    } else {
      // Disabled mode: no server session to revoke — just clear the profile.
      tokenStore.clearSelectedUser();
      tokenStore.clearTokens();
      queryClient.clear();
      setUser(null);
      setRequiresPasswordChange(false);
      router.push('/user-select');
    }
  }, [router, queryClient]);

  // Register the module-level logout callback so the API client can trigger it
  useEffect(() => {
    registerLogoutCallback(() => {
      setUser(null);
      setRequiresPasswordChange(false);
      router.push(isAuthEnabledRef.current ? '/login' : '/user-select');
    });
  }, [router]);

  const applyStatus = useCallback(
    (status: {
      authenticationEnabled: boolean;
      requiresSetup: boolean;
      needsAdminPassword: boolean;
      users?: StatusUserEntry[];
    }) => {
      setIsAuthEnabled(status.authenticationEnabled);
      isAuthEnabledRef.current = status.authenticationEnabled;
      setAvailableUsers(status.users ?? []);
      setNeedsAdminPassword(status.needsAdminPassword);
      setNeedsSetup(status.requiresSetup);
    },
    []
  );

  const refreshStatus = useCallback(async () => {
    const status = await authService.status();
    applyStatus(status);
  }, [applyStatus]);

  // On mount: load auth status, then restore session (JWT or selected profile)
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    async function init() {
      setIsLoading(true);
      try {
        const status = await authService.status();
        applyStatus(status);

        if (status.requiresSetup) {
          setIsLoading(false);
          return;
        }

        if (status.authenticationEnabled) {
          // JWT mode — try to load current user via stored token
          const accessToken = tokenStore.getAccessToken();
          if (accessToken) {
            try {
              const currentUser = await userService.getCurrentUser();
              setUser(currentUser);
            } catch {
              tokenStore.clearTokens();
            }
          }
        } else {
          // Profile-picker mode. Drop any JWT left over from a previous auth-enabled
          // period first: the API client prefers Bearer over X-Kaizoku-User, so a stale
          // token would make the backend resolve the fallback admin instead of the
          // selected profile.
          tokenStore.clearTokens();
          // Restore the previously selected profile.
          const selected = tokenStore.getSelectedUser();
          if (selected) {
            try {
              const currentUser = await userService.getCurrentUser();
              // Guard against the middleware falling back to the default admin
              // when the stored username no longer exists.
              if (currentUser.username === selected) {
                setUser(currentUser);
              } else {
                tokenStore.clearSelectedUser();
              }
            } catch {
              tokenStore.clearSelectedUser();
            }
          }
        }
      } catch {
        // Status endpoint unreachable or errored — try token-based auth
        const accessToken = tokenStore.getAccessToken();
        if (accessToken) {
          try {
            const currentUser = await userService.getCurrentUser();
            setUser(currentUser);
          } catch {
            tokenStore.clearTokens();
          }
        }
      } finally {
        setIsLoading(false);
      }
    }

    void init();
  }, [applyStatus]);

  const login = useCallback(
    async (username: string, password: string, rememberMe = false) => {
      const res = await authService.login({ usernameOrEmail: username, password, rememberMe });
      tokenStore.setTokens(res.accessToken, res.refreshToken, rememberMe);
      tokenStore.clearSelectedUser();
      queryClient.clear();
      setUser(res.user);
      setRequiresPasswordChange(res.requiresPasswordChange ?? false);
    },
    [queryClient]
  );

  const register = useCallback(
    async (username: string, password: string, displayName: string, inviteCode: string) => {
      const res = await authService.register({
        username,
        password,
        displayName,
        inviteCode,
      });
      tokenStore.setTokens(res.accessToken, res.refreshToken);
      tokenStore.clearSelectedUser();
      queryClient.clear();
      setUser(res.user);
    },
    [queryClient]
  );

  const logout = useCallback(async () => {
    await doLogout();
  }, [doLogout]);

  const updateUser = useCallback((updatedUser: UserDetail) => {
    setUser(updatedUser);
  }, []);

  const setup = useCallback(
    async (username: string, password: string, displayName: string) => {
      const res = await authService.setup({ username, password, displayName });
      tokenStore.setTokens(res.accessToken, res.refreshToken);
      setUser(res.user);
      setNeedsSetup(false);
    },
    []
  );

  const selectUser = useCallback(async (username: string, password?: string) => {
    await authService.selectUser(username, password);
    // A stale JWT would take precedence over X-Kaizoku-User in the API client and
    // silently resolve the fallback admin — clear it before loading the profile.
    tokenStore.clearTokens();
    tokenStore.setSelectedUser(username);
    try {
      const currentUser = await userService.getCurrentUser();
      if (currentUser.username !== username) {
        // Middleware fell back to the default admin — refuse the mismatched identity.
        throw new Error('Profile could not be selected.');
      }
      queryClient.clear(); // drop the previous profile's cached data
      setUser(currentUser);
    } catch (err) {
      tokenStore.clearSelectedUser();
      throw err;
    }
  }, [queryClient]);

  const createFirstUser = useCallback(
    async (username: string, displayName: string, password?: string) => {
      await authService.createFirstUser({ username, displayName, password });
      if (isAuthEnabledRef.current) {
        // Auth already enforced (unusual for a fresh install) — caller must log in.
        setNeedsSetup(false);
        return;
      }
      await authService.selectUser(username);
      tokenStore.setSelectedUser(username);
      const currentUser = await userService.getCurrentUser();
      setUser(currentUser);
      // Flip needsSetup only after the user is set: the setup page redirects to
      // /user-select the moment needsSetup goes false without an authenticated user.
      setNeedsSetup(false);
      await refreshStatus();
    },
    [refreshStatus]
  );

  const dismissPasswordChange = useCallback(() => {
    setRequiresPasswordChange(false);
  }, []);

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    isLoading,
    needsSetup,
    isAuthEnabled,
    availableUsers,
    needsAdminPassword,
    requiresPasswordChange,
    login,
    register,
    logout,
    updateUser,
    setup,
    createFirstUser,
    selectUser,
    refreshStatus,
    dismissPasswordChange,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
