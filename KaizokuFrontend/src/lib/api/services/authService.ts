import { apiClient } from '@/lib/api/client';
import { tokenStore } from '@/lib/auth-token-store';
import type {
  AuthResponse,
  AuthStatusResponse,
  FirstUserRequest,
  LoginRequest,
  RegisterRequest,
  SetPasswordRequest,
  SetupRequest,
  User,
  UserDetail,
} from '@/lib/api/auth-types';

export const authService = {
  async login(data: LoginRequest): Promise<AuthResponse> {
    return apiClient.post<AuthResponse>('/api/auth/login', data);
  },

  async register(data: RegisterRequest): Promise<AuthResponse> {
    return apiClient.post<AuthResponse>('/api/auth/register', data);
  },

  async logout(): Promise<void> {
    const refreshToken = tokenStore.getRefreshToken();
    return apiClient.post<void>('/api/auth/logout', { refreshToken });
  },

  async refresh(refreshToken: string): Promise<AuthResponse> {
    return apiClient.post<AuthResponse>('/api/auth/refresh', { refreshToken });
  },

  async status(): Promise<AuthStatusResponse> {
    return apiClient.get<AuthStatusResponse>('/api/auth/status');
  },

  /** Legacy password-at-setup flow (auth-enabled installs). Returns tokens. */
  async setup(data: SetupRequest): Promise<AuthResponse> {
    return apiClient.post<AuthResponse>('/api/auth/setup', data);
  },

  /** Passwordless first-admin creation (auth disabled by default). No tokens issued. */
  async createFirstUser(data: FirstUserRequest): Promise<UserDetail> {
    return apiClient.post<UserDetail>('/api/users/first', data);
  },

  /** Selects a profile in auth-disabled mode. No JWT issued.
   *  Claimed (password-protected) profiles require their password — the server
   *  answers 401 { passwordRequired: true } when it is missing or wrong. */
  async selectUser(username: string, password?: string): Promise<User> {
    return apiClient.post<User>('/api/auth/select-user', password ? { username, password } : { username });
  },

  /** Consumes an invite token to set a password (public, allow-listed). */
  async setPassword(data: SetPasswordRequest): Promise<User> {
    return apiClient.post<User>('/api/auth/set-password', data);
  },

  /** Admin self-serve password set (used before enabling authentication). */
  async setAdminPassword(newPassword: string): Promise<void> {
    return apiClient.post<void>('/api/auth/set-admin-password', { newPassword });
  },
};
