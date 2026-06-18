'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userService } from '@/lib/api/services/userService';
import { type LoginRequest, type SetPasswordRequest, type ChangePasswordRequest } from '@/lib/api/types';

const AUTH_STATUS_KEY = ['auth-status'] as const;

export function useAuthStatus() {
  return useQuery({
    queryKey: AUTH_STATUS_KEY,
    queryFn: () => userService.getAuthStatus(),
    staleTime: 30_000, // 30 seconds
  });
}

export function useLogin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: LoginRequest) => userService.login(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: AUTH_STATUS_KEY });
    },
  });
}

export function useSelectUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (username: string) => userService.selectUser(username),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: AUTH_STATUS_KEY });
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => userService.logout(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: AUTH_STATUS_KEY });
    },
  });
}

export function useSetPassword() {
  return useMutation({
    mutationFn: (data: SetPasswordRequest) => userService.setPassword(data),
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (data: ChangePasswordRequest) => userService.changePassword(data),
  });
}

export function useCreateFirstUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { username: string }) =>
      userService.createFirstUser({ username: data.username, level: 3 }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: AUTH_STATUS_KEY });
    },
  });
}

export function useClaimUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => userService.claimUser(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: AUTH_STATUS_KEY });
    },
  });
}