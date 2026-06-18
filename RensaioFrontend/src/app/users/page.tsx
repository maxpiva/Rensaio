'use client';

import React, { useState } from 'react';
import { UserManager } from '@/components/comp/users/user-manager';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground">
          Manage user accounts, invite new users, and configure access permissions.
        </p>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Add User
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={handleCreate}>
              <DialogHeader>
                <DialogTitle>Create New User</DialogTitle>
                <DialogDescription>
                  Create a new user. They will need to be invited to set their password.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                {createError && (
                  <div className="p-3 text-sm text-red-500 bg-red-50 dark:bg-red-950 rounded-md">
                    {createError}
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="new-username">Username</Label>
                  <Input
                    id="new-username"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder="Enter username"
                    required
                    minLength={3}
                    maxLength={32}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-level">Level</Label>
                  <Select
                    value={newLevel.toString()}
                    onValueChange={(v) => setNewLevel(Number(v) as UserLevel)}
                  >
                    <SelectTrigger>
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
                  {createUser.isPending ? 'Creating...' : 'Create User'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      <UserManager />
    </div>
  );
}