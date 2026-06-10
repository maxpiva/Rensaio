// ─── Auth & Multi-User Types ─────────────────────────────────────────────────

export type UserLevel = 'User' | 'Manager' | 'Admin';

export interface User {
  id: string;
  username: string;
  displayName: string;
  role: 'Admin' | 'User';
  /** Upstream-aligned 3-tier level (User/Manager/Admin). */
  level: UserLevel;
  /** Per-user OPDS path slug (e.g. "feather-flood"). */
  opdsPath: string;
  /** Base64-encoded avatar image, null when no avatar is set. */
  avatarBase64: string | null;
  avatarContentType: string | null;
  /** True when the user has a password set (password login possible). */
  hasPassword: boolean;
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface UserPermissions {
  canViewLibrary: boolean;
  canRequestSeries: boolean;
  canAddSeries: boolean;
  canEditSeries: boolean;
  canDeleteSeries: boolean;
  canManageDownloads: boolean;
  canViewQueue: boolean;
  canBrowseSources: boolean;
  canViewNSFW: boolean;
  canManageRequests: boolean;
  canManageJobs: boolean;
  canViewStatistics: boolean;
}

export interface UserPreferences {
  theme: string;
  defaultLanguage: string;
  cardSize: string;
  nsfwVisibility: string; // Backend sends string enum via JsonStringEnumConverter ("AlwaysHide" | "HideByDefault" | "Show")
}

export interface UserDetail extends User {
  permissions: UserPermissions;
  preferences: UserPreferences;
  updatedAt: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  user: UserDetail;
  /** True when the user's password doesn't meet the current policy and must be changed. */
  requiresPasswordChange?: boolean;
}

/** Slim user entry returned by GET /api/auth/status when auth is disabled. */
export interface StatusUserEntry {
  id: string;
  username: string;
  displayName: string;
  avatarBase64: string | null;
  avatarContentType: string | null;
  /** True when the profile is claimed: selecting it requires its password. */
  hasPassword: boolean;
}

export interface AuthStatusResponse {
  /** True when password-based JWT authentication is required. */
  authenticationEnabled: boolean;
  /** True when at least one user exists. */
  hasUsers: boolean;
  /** Back-compat alias: equals !hasUsers. */
  requiresSetup: boolean;
  /** True when auth is disabled and no admin account has a password set. */
  needsAdminPassword: boolean;
  /** Profile list for the user selector. Present only when auth is disabled. */
  users?: StatusUserEntry[];
}

export interface InviteLink {
  id: string;
  code: string;
  createdByUserId: string;
  createdByUsername: string;
  expiresAt: string;
  maxUses: number;
  usedCount: number;
  permissionPresetId: string | null;
  permissionPresetName: string | null;
  isActive: boolean;
}

export interface InviteValidation {
  isValid: boolean;
  reason?: string;
  permissionPresetName?: string | null;
}

// Backend sends permissions nested: { id, name, isDefault, createdByUserId, permissions: { ... } }
export interface PermissionPreset {
  id: string;
  name: string;
  isDefault: boolean;
  createdByUserId: string;
  permissions: UserPermissions;
}

export interface MangaRequest {
  id: string;
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  providerData: string | null;
  status: 'Pending' | 'Approved' | 'Denied' | 'Cancelled';
  requestedByUsername: string;
  requestedByUserId: string;
  reviewedByUserId: string | null;
  reviewedByUsername: string | null;
  reviewNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface PendingRequestCount {
  count: number;
}

// ─── Request Bodies ───────────────────────────────────────────────────────────

export interface LoginRequest {
  usernameOrEmail: string;
  password: string;
  rememberMe?: boolean;
}

export interface RegisterRequest {
  username: string;
  password: string;
  displayName: string;
  inviteCode: string;
}

export interface SetupRequest {
  username: string;
  password: string;
  displayName: string;
}

/** POST /api/users/first — passwordless first-admin creation (auth disabled by default). */
export interface FirstUserRequest {
  username: string;
  displayName: string;
  password?: string;
}

/** POST /api/auth/select-user — profile selection when auth is disabled. */
export interface SelectUserRequest {
  username: string;
  /** Required when the profile is claimed (password-protected). */
  password?: string;
}

/** POST /api/auth/set-password — consume an invite token to set a password. */
export interface SetPasswordRequest {
  token: string;
  newPassword: string;
}

/** POST /api/auth/set-admin-password — admin self-serve password set. */
export interface SetAdminPasswordRequest {
  newPassword: string;
}

/** PUT /api/users/{id}/claim — protect a disabled-mode profile with a password. */
export interface ClaimUserRequest {
  password: string;
}

/** Response of POST /api/users/{id}/generate-invite. */
export interface GenerateInviteResponse {
  token: string;
  url: string;
  expiresAt: string;
  message: string;
}

export interface CreateUserRequest {
  username: string;
  /** Empty string creates a passwordless profile (invite link sets it later). */
  password: string;
  displayName: string;
  role: 'Admin' | 'User';
  permissions?: UserPermissions;
  permissionPresetId?: string;
}

export interface UpdateUserRequest {
  displayName?: string;
  role?: 'Admin' | 'User';
  isActive?: boolean;
}

export interface UpdatePermissionsRequest extends Partial<UserPermissions> {}

export interface ResetPasswordRequest {
  newPassword: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface UpdateProfileRequest {
  displayName?: string;
}

export interface UpdatePreferencesRequest {
  theme?: string;
  defaultLanguage?: string;
  cardSize?: string;
  nsfwVisibility?: string;
}

export interface CreateInviteRequest {
  expiresInDays: number;
  maxUses: number;
  permissionPresetId?: string;
}

export interface CreateRequestRequest {
  title: string;
  description?: string;
  thumbnailUrl?: string;
  providerData: string;
}

export interface ApproveRequestRequest {
  seriesData?: unknown;
  reviewNote?: string;
}

export interface DenyRequestRequest {
  reviewNote?: string;
}

export interface CreatePresetRequest {
  name: string;
  permissions: UserPermissions;
}

export type UpdatePresetRequest = {
  name?: string;
  permissions?: Partial<UserPermissions>;
};
