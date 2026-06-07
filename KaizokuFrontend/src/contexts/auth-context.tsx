'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { userService } from '@/lib/api/services/userService';
import { type User, type AuthStatus } from '@/lib/api/types';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isAuthEnabled: boolean;
  availableUsers: AuthStatus['users'];
  login: (username: string, password: string, rememberMe?: boolean) => Promise<void>;
  selectUser: (username: string) => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [selectedUsername, setSelectedUsername] = useState<string | null>(null);
  const [isAuthEnabled, setIsAuthEnabled] = useState(false);
  const [availableUsers, setAvailableUsers] = useState<AuthStatus['users']>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize - check auth status on mount
  const refreshAuth = useCallback(async () => {
    try {
      const status = await userService.getAuthStatus();
      setIsAuthEnabled(status.authenticationEnabled);
      setAvailableUsers(status.users ?? []);

      if (status.authenticationEnabled) {
        // Try to load stored token
        // Token is stored in memory; on page refresh try refresh token
        const storedToken = sessionStorage.getItem('kaizoku_token');
        if (storedToken) {
          setToken(storedToken);
          try {
            const me = await userService.getMe();
            setUser(me);
            return;
          } catch {
            // Token expired, try refresh
            sessionStorage.removeItem('kaizoku_token');
            setToken(null);
          }
        }

        // Try refresh token (cookie-based)
        try {
          const refreshResult = await userService.refreshToken();
          setToken(refreshResult.token);
          sessionStorage.setItem('kaizoku_token', refreshResult.token);
          setUser(refreshResult.user);
          return;
        } catch {
          // No refresh token or expired
          setUser(null);
          setToken(null);
        }
      } else {
        // Auth disabled - use stored username from localStorage
        const storedUsername = localStorage.getItem('kaizoku_selected_user');
        if (storedUsername) {
          setSelectedUsername(storedUsername);
          try {
            const selectedUser = await userService.selectUser(storedUsername);
            setUser(selectedUser);
            return;
          } catch {
            localStorage.removeItem('kaizoku_selected_user');
            setSelectedUsername(null);
          }
        }

        // No stored username — try auto-login if exactly one user exists
        if (status.users && status.users.length === 1) {
          const singleUser = status.users[0]!;
          try {
            const selectedUser = await userService.selectUser(singleUser.username);
            localStorage.setItem('kaizoku_selected_user', singleUser.username);
            setSelectedUsername(singleUser.username);
            setUser(selectedUser);
            return;
          } catch {
            // Auto-login failed, fall through to setUser(null)
          }
        }

        setUser(null);
      }
    } catch {
      // Offline or error
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // After auth check completes, redirect unauthenticated users to the correct page
  // Only applies to non-auth pages (avoids redirect loops on /login, /user-select)
  useEffect(() => {
    if (!isLoading && !user) {
      const pathname = window.location.pathname;
      // Don't redirect if already on an auth-related page
      if (pathname === '/login' || pathname === '/user-select' || pathname.startsWith('/auth/')) {
        return;
      }

      if (isAuthEnabled) {
        router.push('/login');
      } else if (availableUsers && availableUsers.length > 0) {
        // Auth disabled with users — show user selector
        router.push('/user-select');
      }
      // Auth disabled with no users — no redirect here; page.tsx handles it
      // using wizard completion state to decide between /users or /library
    }
  }, [isLoading, user, isAuthEnabled, availableUsers, router]);

  useEffect(() => {
    refreshAuth();
  }, [refreshAuth]);

  const login = useCallback(async (username: string, password: string, rememberMe = false) => {
    const result = await userService.login({ username, password, rememberMe });
    setToken(result.token);
    sessionStorage.setItem('kaizoku_token', result.token);
    setUser(result.user);
    router.push('/library');
  }, [router]);

  const selectUser = useCallback(async (username: string) => {
    const result = await userService.selectUser(username);
    localStorage.setItem('kaizoku_selected_user', username);
    setSelectedUsername(username);
    setUser(result);
    router.push('/library');
  }, [router]);

  const logout = useCallback(async () => {
    try {
      await userService.logout();
    } catch {
      // Ignore errors
    }
    setToken(null);
    sessionStorage.removeItem('kaizoku_token');
    localStorage.removeItem('kaizoku_selected_user');
    setSelectedUsername(null);
    setUser(null);
    router.push(isAuthEnabled ? '/login' : '/user-select');
  }, [router, isAuthEnabled]);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    await userService.changePassword({ currentPassword, newPassword });
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        isAuthEnabled,
        availableUsers,
        login,
        selectUser,
        logout,
        changePassword,
        refreshAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}