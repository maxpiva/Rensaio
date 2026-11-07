'use client';

import React, { useState } from 'react';
import { UserManager } from '@/components/comp/users/user-manager';
import { Button } from '@/components/ui/button';
import { Loader2, UserPlus } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { PageHeader } from '@/components/comp/layout/page-header';
import {
  UsersDialogHeading,
  UsersErrorNote,
  usersFieldLabel,
} from '@/components/comp/users/users-dialog-heading';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCreateUser } from '@/lib/api/hooks/useUsers';
import { UserLevel } from '@/lib/api/types';

export default function UsersPage() {
  const createUser = useCreateUser();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newLevel, setNewLevel] = useState<UserLevel>(UserLevel.User);
  const [createError, setCreateError] = useState('');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');
    if (newUsername.length < 3 || newUsername.length > 32) {
      setCreateError('Username must be between 3 and 32 characters');
      return;
    }
    try {
      await createUser.mutateAsync({ username: newUsername, level: newLevel });
      setIsCreateOpen(false);
      setNewUsername('');
      setNewLevel(UserLevel.User);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create user');
    }
  };

  const createDialog = (
    <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="h-4 w-4" aria-hidden="true" />
          Add User
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleCreate} className="grid gap-4">
          <UsersDialogHeading
            icon={UserPlus}
            action="Create New User"
            description="Create a new user. They will need to be invited to set their password."
          />
          <div className="space-y-4">
            {createError && <UsersErrorNote>{createError}</UsersErrorNote>}
            <div className="space-y-2">
              <Label htmlFor="new-username" className={usersFieldLabel}>Username</Label>
              <Input
                id="new-username"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder="Enter username"
                required
                minLength={3}
                maxLength={32}
                autoComplete="off"
                aria-invalid={createError ? true : undefined}
              />
              <p className="text-xs text-ink-3">3–32 characters.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-level" className={usersFieldLabel}>Level</Label>
              <Select
                value={newLevel.toString()}
                onValueChange={(v) => setNewLevel(Number(v))}
              >
                <SelectTrigger id="new-level">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UserLevel.User.toString()}>User</SelectItem>
                  <SelectItem value={UserLevel.Manager.toString()}>Manager</SelectItem>
                  <SelectItem value={UserLevel.Admin.toString()}>Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={createUser.isPending}>
              {createUser.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {createUser.isPending ? 'Creating...' : 'Create User'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );

  return (
    <div className="space-y-6 pb-6 md:space-y-8">
      <PageHeader
        folio="08"
        eyebrow="Manage · Users"
        title={<em>Users</em>}
        description="Manage user accounts, invite new users, and configure access permissions."
        actions={createDialog}
        tate="利用者"
      />
      <UserManager />
    </div>
  );
}
