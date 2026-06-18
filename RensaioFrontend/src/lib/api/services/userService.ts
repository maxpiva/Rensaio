import { apiClient } from '@/lib/api/client';
import {
  type User,
  type CreateUserRequest,
  type UpdateUserRequest,
  type AuthStatus,
  type LoginRequest,
  type LoginResponse,
  type SetPasswordRequest,
  type InviteMessage,
  type ChangePasswordRequest,
  type NeedsPasswordResponse,
} from '@/lib/api/types';

export const userService = {
  // --- Auth endpoints ---
  async getAuthStatus(): Promise<AuthStatus> {
    return apiClient.get<AuthStatus>('/api/auth/status');
  },

  async login(data: LoginRequest): Promise<LoginResponse> {
    return apiClient.post<LoginResponse>('/api/auth/login', data);
  },

  async selectUser(username: string): Promise<User> {
    return apiClient.post<User>('/api/auth/select-user', { username });
  },

  async refreshToken(): Promise<LoginResponse> {
    return apiClient.post<LoginResponse>('/api/auth/refresh');
  },

  async logout(): Promise<void> {
    return apiClient.post<void>('/api/auth/logout');
  },

  async setPassword(data: SetPasswordRequest): Promise<LoginResponse> {
    return apiClient.post<LoginResponse>('/api/auth/set-password', data);
  },

  async changePassword(data: ChangePasswordRequest): Promise<void> {
    return apiClient.post<void>('/api/auth/change-password', data);
  },

  async getMe(): Promise<User> {
    return apiClient.get<User>('/api/auth/me');
  },

  async updateMe(data: UpdateUserRequest): Promise<User> {
    return apiClient.put<User>('/api/auth/me', data);
  },

  // --- User management endpoints (admin) ---
  async listUsers(): Promise<User[]> {
    return apiClient.get<User[]>('/api/users');
  },

  async getUser(id: string): Promise<User> {
    return apiClient.get<User>(`/api/users/${id}`);
  },

  async createUser(data: CreateUserRequest): Promise<User> {
    return apiClient.post<User>('/api/users', data);
  },

  async updateUser(id: string, data: UpdateUserRequest): Promise<User> {
    return apiClient.put<User>(`/api/users/${id}`, data);
  },

  async deleteUser(id: string): Promise<void> {
    return apiClient.delete<void>(`/api/users/${id}`);
  },

  async createFirstUser(data: CreateUserRequest): Promise<User> {
    return apiClient.post<User>('/api/users/first', data);
  },

  async claimUser(id: string): Promise<User> {
    return apiClient.put<User>(`/api/users/${id}/claim`);
  },

  async generateInvite(id: string): Promise<InviteMessage> {
    return apiClient.post<InviteMessage>(`/api/users/${id}/generate-invite`);
  },

  async regenerateOpdsPath(id: string): Promise<{ opdsPath: string }> {
    return apiClient.post<{ opdsPath: string }>(`/api/users/${id}/regenerate-opds`);
  },
};