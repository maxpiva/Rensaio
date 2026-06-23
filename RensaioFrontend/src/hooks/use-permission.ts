import { useAuth } from "@/contexts/auth-context";

/**
 * Compatibility shim.
 *
 * The Kaizoku redesign was built against a fine-grained, 12-flag permission
 * model (`user.permissions.canViewLibrary` …). Rensaiō 2.0 replaced that with a
 * 4-tier role model (User < Manager < Admin < Owner) exposed via `useAuth()` as
 * `canManage` / `canAdmin` / `canOwner`.
 *
 * This shim maps the old permission keys onto the new roles so the ported
 * components keep calling `usePermission('canEditSeries')` unchanged:
 *   - view-level keys      → everyone (User+)
 *   - management keys      → Manager+ (`canManage`)
 *   - admin is exposed via `useIsAdmin()` → Admin+ (`canAdmin`)
 *
 * Note: guest mode (no user, auth disabled) defaults to Owner in auth-context,
 * so all UI is visible — matching the redesign's intent.
 */
export type PermissionKey =
  | "canViewLibrary"
  | "canViewQueue"
  | "canViewStatistics"
  | "canViewNSFW"
  | "canRequestSeries"
  | "canBrowseSources"
  | "canAddSeries"
  | "canEditSeries"
  | "canDeleteSeries"
  | "canManageDownloads"
  | "canManageJobs"
  | "canManageRequests";

export function usePermission(permission: PermissionKey): boolean {
  const { canManage } = useAuth();

  switch (permission) {
    // View-level: available to any user who can see the app.
    // (`canBrowseSources` here gates browsing for new series — cloud-latest and
    //  cross-source search — not extension management, so it's view-level.)
    case "canViewLibrary":
    case "canViewQueue":
    case "canViewStatistics":
    case "canViewNSFW":
    case "canRequestSeries":
    case "canBrowseSources":
      return true;

    // Management-level: Manager and above.
    case "canAddSeries":
    case "canEditSeries":
    case "canDeleteSeries":
    case "canManageDownloads":
    case "canManageJobs":
    case "canManageRequests":
      return canManage;

    default:
      return false;
  }
}

export function useIsAdmin(): boolean {
  return useAuth().canAdmin;
}
