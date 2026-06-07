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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { UserIcon, Trash2, Mail, MoreHorizontal, Medal } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { InviteDialog } from './user-invite-dialog';
import { EditUserDialog } from './user-dialog';

const levelLabels: Record<UserLevel, string> = {
  [UserLevel.User]: 'User',
  [UserLevel.Manager]: 'Manager',
  [UserLevel.Admin]: 'Admin',
};

const levelColors: Record<UserLevel, string> = {
  [UserLevel.User]: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  [UserLevel.Manager]: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  [UserLevel.Admin]: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
};

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
      refetch();
    } catch (err) {
      setFirstUserError(err instanceof Error ? err.message : 'Failed to create admin user');
    } finally {
      setFirstUserCreating(false);
    }
  };

  if (isLoading) {
    return <div className="text-center py-8 text-muted-foreground">Loading users...</div>;
  }

  if (error) {
    return <div className="text-center py-8 text-red-500">Failed to load users</div>;
  }

  const hasUsers = users && users.length > 0;
  return (
    <div className="space-y-4">
      {/* First-User Setup - shown on upgrade from older version with no users */}
      {firstUserMode && !firstUserCreated && (
        <Card>
          <CardHeader>
            <CardTitle>Welcome to Kaizoku!</CardTitle>
            <CardDescription>
              No users were found in the database. This can happen after upgrading from an older version.
              Create your admin account to get started.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateFirstUser} className="space-y-4 max-w-md">
              {firstUserError && (
                <div className="p-3 text-sm text-red-500 bg-red-50 dark:bg-red-950 rounded-md">
                  {firstUserError}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="first-username">Admin Username</Label>
                <Input
                  id="first-username"
                  value={firstUserName}
                  onChange={(e) => setFirstUserName(e.target.value)}
                  placeholder="Enter your admin username"
                  required
                  minLength={3}
                  maxLength={32}
                  autoFocus
                />
              </div>
              <p className="text-xs text-muted-foreground">
                No password will be set — authentication is disabled by default.
                You can enable it later in Settings.
              </p>
              <Button type="submit" disabled={firstUserCreating}>
                {firstUserCreating ? 'Creating...' : 'Create Admin User'}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {firstUserCreated && (
        <Card>
          <CardHeader>
            <CardTitle>Admin User Created</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-secondary border border-green-200 rounded-lg p-4">
              <p className="text-sm">
                Admin user <strong>{firstUserName}</strong> has been created successfully!
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                No password was set — authentication is disabled by default.
                You can enable authentication later in Settings to set up passwords.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* User management UI - hidden during first-user setup */}
      {(!firstUserMode || firstUserCreated) && (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">Avatar</TableHead>
                <TableHead>Username</TableHead>
                <TableHead>Level</TableHead>
                <TableHead>OPDS Path</TableHead>
                <TableHead>Active</TableHead>
                <TableHead>Password</TableHead>
                <TableHead>Last Login</TableHead>
                <TableHead className="w-16">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(hasUsers || firstUserCreated) ? (
                (users ?? []).map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center overflow-hidden">
                        {user.avatarBase64 ? (
                          <img
                            src={`data:${user.avatarContentType || 'image/png'};base64,${user.avatarBase64}`}
                            alt={user.username}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <UserIcon className="w-4 h-4 text-muted-foreground" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{user.username}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${levelColors[user.level]}`}>
                        <Medal className="mr-1 h-3 w-3" />
                        {levelLabels[user.level]}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{user.opdsPath}</TableCell>
                    <TableCell>
                      <span className={`inline-block w-2 h-2 rounded-full ${user.isActive ? 'bg-green-500' : 'bg-red-500'}`} />
                    </TableCell>
                    <TableCell>
                      {user.hasPassword ? (
                        <Badge variant="outline" className="text-green-600 border-green-300">Set</Badge>
                      ) : (
                        <Badge variant="outline" className="text-amber-600 border-amber-300">Not set</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {user.lastLoginAt
                        ? new Date(user.lastLoginAt).toLocaleDateString()
                        : 'Never'}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => { setSelectedUser(user); setIsEditOpen(true); }}>
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => { setSelectedUser(user); setIsInviteOpen(true); }}>
                            <Mail className="w-4 h-4 mr-2" />
                            Invite
                          </DropdownMenuItem>
                          {/* Delete: only show if not first admin, and if target is not admin or current user is first admin */}
                          {!user.isFirstAdmin && (user.level !== UserLevel.Admin || currentUser?.isFirstAdmin) && (
                            <DropdownMenuItem
                              className="text-red-600"
                              onClick={() => setDeleteConfirmId(user.id)}
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                [<TableRow key="empty-state">
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    No users yet. Create the first user using the form above.
                  </TableCell>
                </TableRow>]
              )}
            </TableBody>
          </Table>

          {/* Delete Confirmation */}
          <Dialog open={!!deleteConfirmId} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete User</DialogTitle>
                <DialogDescription>
                  Are you sure you want to delete this user? This action cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
                  disabled={deleteUser.isPending}
                >
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