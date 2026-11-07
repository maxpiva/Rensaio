'use client';

import { useState } from 'react';
import { useUsers, useDeleteUser } from '@/lib/api/hooks/useUsers';
import { useCreateFirstUser } from '@/lib/api/hooks/useAuth';
import { useAuth } from '@/contexts/auth-context';
import { type User, UserLevel } from '@/lib/api/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  KeyRound,
  Loader2,
  Mail,
  Medal,
  MoreHorizontal,
  Pencil,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { LEVEL_BADGE, LEVEL_LABEL, UserAvatar } from '@/components/comp/layout/user-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { InviteDialog } from './user-invite-dialog';
import { EditUserDialog } from './user-dialog';
import { UsersDialogHeading, UsersErrorNote, usersFieldLabel } from './users-dialog-heading';

/** Owner/Admin/Manager/User tag — shares the user menu's tint so a level reads the same everywhere. */
function LevelTag({ level }: { level: UserLevel }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-[4px] px-1.5 py-0.5 text-[11.5px] font-semibold',
        LEVEL_BADGE[level] ?? LEVEL_BADGE[UserLevel.User],
      )}
    >
      <Medal className="h-3 w-3" aria-hidden="true" />
      {LEVEL_LABEL[level] ?? 'User'}
    </span>
  );
}

/** Active state: icon + word, never colour alone. */
function ActiveTag({ active }: { active: boolean }) {
  return active ? (
    <Badge variant="ok" className="gap-1">
      <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
      Active
    </Badge>
  ) : (
    <Badge variant="bad" className="gap-1">
      <Ban className="h-3 w-3" aria-hidden="true" />
      Inactive
    </Badge>
  );
}

function PasswordTag({ set }: { set: boolean }) {
  return set ? (
    <Badge variant="ok" className="gap-1">
      <KeyRound className="h-3 w-3" aria-hidden="true" />
      Set
    </Badge>
  ) : (
    <Badge variant="warn" className="gap-1">
      <KeyRound className="h-3 w-3" aria-hidden="true" />
      Not set
    </Badge>
  );
}

function SignInTags({ user }: { user: User }) {
  return (
    <div className="flex flex-wrap gap-1">
      {user.hasPassword && <Badge variant="outline">Local</Badge>}
      {user.hasExternalLogin && <Badge variant="info">SSO</Badge>}
      {!user.hasPassword && !user.hasExternalLogin && (
        <span className="text-xs text-ink-3">—</span>
      )}
    </div>
  );
}

function formatLastLogin(user: User) {
  return user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString() : 'Never';
}

export function UserManager() {
  const { data: users, isLoading, error, refetch } = useUsers();
  const deleteUser = useDeleteUser();
  const { mutateAsync: createFirstUser } = useCreateFirstUser();
  const { user: currentUser } = useAuth();
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const [firstUserName, setFirstUserName] = useState('');
  const [firstUserError, setFirstUserError] = useState('');
  const [firstUserCreated, setFirstUserCreated] = useState(false);
  const [firstUserCreating, setFirstUserCreating] = useState(false);
  const firstUserMode = !users || users.length === 0;

  const handleDelete = async (id: string) => {
    try {
      await deleteUser.mutateAsync(id);
      setDeleteConfirmId(null);
    } catch {
      // Error handled by mutation
    }
  };

  const handleCreateFirstUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setFirstUserError('');

    if (firstUserName.length < 3 || firstUserName.length > 32) {
      setFirstUserError('Username must be between 3 and 32 characters');
      return;
    }

    setFirstUserCreating(true);
    try {
      await createFirstUser({ username: firstUserName });
      setFirstUserCreated(true);
      void refetch();
    } catch (err) {
      setFirstUserError(err instanceof Error ? err.message : 'Failed to create admin user');
    } finally {
      setFirstUserCreating(false);
    }
  };

  const canEditOrInvite = (user: User) =>
    user.level !== UserLevel.Owner || currentUser?.level === UserLevel.Owner;
  const canDelete = (user: User) =>
    user.level !== UserLevel.Owner &&
    (user.level !== UserLevel.Admin || currentUser?.level === UserLevel.Owner);

  const renderActions = (user: User) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-ink-3 hover:text-ink max-sm:h-11 max-sm:w-11"
          aria-label={`Actions for ${user.username}`}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {/* Edit: only show if target is not owner, or current user is owner */}
        {canEditOrInvite(user) && (
          <DropdownMenuItem onClick={() => { setSelectedUser(user); setIsEditOpen(true); }}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit...
          </DropdownMenuItem>
        )}
        {/* Invite: only show if target is not owner, or current user is owner */}
        {canEditOrInvite(user) && (
          <DropdownMenuItem onClick={() => { setSelectedUser(user); setIsInviteOpen(true); }}>
            <Mail className="mr-2 h-4 w-4" />
            Invite...
          </DropdownMenuItem>
        )}
        {/* Delete: only show if not owner, and if target is not admin or current user is owner */}
        {canDelete(user) && (
          <DropdownMenuItem
            className="text-bad focus:bg-bad-soft focus:text-bad"
            onClick={() => setDeleteConfirmId(user.id)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete...
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  if (isLoading) {
    return (
      <div
        className="overflow-hidden rounded-lg border border-rule bg-card shadow-paper"
        aria-busy="true"
        aria-label="Loading users"
      >
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3 border-b border-rule px-4 py-3 last:border-b-0">
            <Skeleton className="h-9 w-9 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-3 w-20" />
            </div>
            <Skeleton className="hidden h-5 w-16 sm:block" />
            <Skeleton className="h-8 w-8" />
          </div>
        ))}
        <span className="sr-only">Loading users...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        className="flex flex-col items-center gap-2 rounded-lg border border-bad/25 bg-bad-soft px-6 py-10 text-center"
      >
        <AlertTriangle className="h-5 w-5 text-bad" aria-hidden="true" />
        <p className="font-serif text-xl text-ink">Failed to load users</p>
      </div>
    );
  }

  const hasUsers = users && users.length > 0;
  const rows = (hasUsers || firstUserCreated) ? (users ?? []) : [];
  return (
    <div className="space-y-4">
      {/* First-User Setup - shown on upgrade from older version with no users */}
      {firstUserMode && !firstUserCreated && (
        <section className="animate-paper-rise overflow-hidden rounded-lg border border-rule bg-card shadow-paper">
          <div className="flex flex-col items-center gap-3 border-b border-rule bg-paper-1 px-5 py-6 text-center sm:px-8">
            {/* eslint-disable-next-line @next/next/no-img-element -- static brand mark */}
            <img src="/rensaiow.png" alt="Rensaiō" className="h-16 w-auto sm:h-20" />
            <p className="max-w-md text-sm leading-relaxed text-ink-2">
              No users were found in the database. This can happen after upgrading from an older version.
              Create your admin account to get started.
            </p>
          </div>
          <form onSubmit={handleCreateFirstUser} className="mx-auto max-w-md space-y-4 px-5 py-6 sm:px-8">
            {firstUserError && <UsersErrorNote>{firstUserError}</UsersErrorNote>}
            <div className="space-y-2">
              <Label htmlFor="first-username" className={usersFieldLabel}>Admin Username</Label>
              <Input
                id="first-username"
                value={firstUserName}
                onChange={(e) => setFirstUserName(e.target.value)}
                placeholder="Enter your admin username"
                required
                minLength={3}
                maxLength={32}
                autoFocus
                aria-invalid={firstUserError ? true : undefined}
              />
            </div>
            <p className="text-xs leading-relaxed text-ink-3">
              No password will be set — authentication is disabled by default.
              You can enable it later in Settings.
            </p>
            <Button type="submit" disabled={firstUserCreating} className="w-full sm:w-auto">
              {firstUserCreating && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {firstUserCreating ? 'Creating...' : 'Create Admin User'}
            </Button>
          </form>
        </section>
      )}

      {firstUserCreated && (
        <section
          role="status"
          className="animate-paper-rise flex items-start gap-3 rounded-lg border border-ok/25 bg-ok-soft p-4 sm:p-5"
        >
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-ok" aria-hidden="true" />
          <div className="space-y-1">
            <h2 className="font-serif text-xl text-ink">Admin User Created</h2>
            <p className="text-sm text-ink-2">
              Admin user <strong>{firstUserName}</strong> has been created successfully!
            </p>
            <p className="text-sm text-ink-3">
              No password was set — authentication is disabled by default.
              You can enable authentication later in Settings to set up passwords.
            </p>
          </div>
        </section>
      )}

      {/* User management UI - hidden during first-user setup */}
      {(!firstUserMode || firstUserCreated) && (
        <>
          <div className="overflow-hidden rounded-lg border border-rule bg-card shadow-paper">
            {/* Desktop: full table */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-12 pl-4"><span className="sr-only">Avatar</span></TableHead>
                    <TableHead>Username</TableHead>
                    <TableHead>Level</TableHead>
                    <TableHead>OPDS Path</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead>Password</TableHead>
                    <TableHead>Sign-in</TableHead>
                    <TableHead>Last Login</TableHead>
                    <TableHead className="w-14 pr-4"><span className="sr-only">Actions</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length > 0 ? (
                    rows.map((user) => (
                      <TableRow key={user.id} className={cn(!user.isActive && 'text-ink-3')}>
                        <TableCell className="pl-4">
                          <UserAvatar
                            username={user.username}
                            avatarBase64={user.avatarBase64}
                            avatarContentType={user.avatarContentType}
                            className="h-8 w-8 text-[11px]"
                          />
                        </TableCell>
                        <TableCell className="font-semibold text-ink">
                          {user.username}
                          {currentUser?.id === user.id && (
                            <span className="ml-1 font-normal text-ink-3">(you)</span>
                          )}
                        </TableCell>
                        <TableCell><LevelTag level={user.level} /></TableCell>
                        <TableCell className="max-w-[180px] truncate font-mono text-xs text-ink-2" title={user.opdsPath}>
                          {user.opdsPath}
                        </TableCell>
                        <TableCell><ActiveTag active={user.isActive} /></TableCell>
                        <TableCell><PasswordTag set={user.hasPassword} /></TableCell>
                        <TableCell><SignInTags user={user} /></TableCell>
                        <TableCell className="whitespace-nowrap font-mono text-xs text-ink-3">
                          {formatLastLogin(user)}
                        </TableCell>
                        <TableCell className="pr-4 text-right">{renderActions(user)}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow key="empty-state" className="hover:bg-transparent">
                      <TableCell colSpan={9} className="py-10 text-center text-ink-3">
                        No users yet. Create the first user using the form above.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Phone: one card per user, same fields */}
            <ul className="md:hidden" aria-label="Users">
              {rows.length > 0 ? (
                rows.map((user) => (
                  <li key={user.id} className="border-b border-rule px-4 py-3.5 last:border-b-0">
                    <div className="flex items-start gap-3">
                      <UserAvatar
                        username={user.username}
                        avatarBase64={user.avatarBase64}
                        avatarContentType={user.avatarContentType}
                        className="mt-0.5 h-9 w-9 text-[12px]"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-ink">
                          {user.username}
                          {currentUser?.id === user.id && (
                            <span className="ml-1 font-normal text-ink-3">(you)</span>
                          )}
                        </p>
                        <p className="font-mono text-[11.5px] text-ink-3">Last login {formatLastLogin(user)}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <LevelTag level={user.level} />
                          <ActiveTag active={user.isActive} />
                          <PasswordTag set={user.hasPassword} />
                          {user.hasPassword && <Badge variant="outline">Local</Badge>}
                          {user.hasExternalLogin && <Badge variant="info">SSO</Badge>}
                        </div>
                        <p className="mt-2 truncate font-mono text-[11.5px] text-ink-2" title={user.opdsPath}>
                          <span className="text-ink-3">OPDS </span>{user.opdsPath}
                        </p>
                      </div>
                      <div className="-mr-2 -mt-1.5 shrink-0">{renderActions(user)}</div>
                    </div>
                  </li>
                ))
              ) : (
                <li className="px-4 py-10 text-center text-sm text-ink-3">
                  No users yet. Create the first user using the form above.
                </li>
              )}
            </ul>
          </div>

          {/* Delete Confirmation */}
          <Dialog open={!!deleteConfirmId} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
            <DialogContent className="sm:max-w-md">
              <UsersDialogHeading
                icon={Trash2}
                tone="danger"
                action="Delete User"
                subject={users?.find((u) => u.id === deleteConfirmId)?.username}
                description="Are you sure you want to delete this user? This action cannot be undone."
              />
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
                  disabled={deleteUser.isPending}
                >
                  {deleteUser.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  {deleteUser.isPending ? 'Deleting...' : 'Delete'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Edit User Dialog */}
          {selectedUser && (
            <EditUserDialog
              user={selectedUser}
              open={isEditOpen}
              onOpenChange={(open) => {
                setIsEditOpen(open);
                if (!open) setSelectedUser(null);
              }}
            />
          )}

          {/* Invite Dialog */}
          {selectedUser && (
            <InviteDialog
              user={selectedUser}
              open={isInviteOpen}
              onOpenChange={(open) => {
                setIsInviteOpen(open);
                if (!open) setSelectedUser(null);
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
