'use client';

import React, { useState } from 'react';
import { useCreateFirstUser } from '@/lib/api/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { UserIcon } from 'lucide-react';

interface CreateAdminStepProps {
  setError: (error: string | null) => void;
  setIsLoading: (loading: boolean) => void;
  setCanProgress: (canProgress: boolean) => void;
}

export function CreateAdminStep({ setError, setIsLoading, setCanProgress }: CreateAdminStepProps) {
  const createFirstUser = useCreateFirstUser();
  const [username, setUsername] = useState('');
  const [created, setCreated] = useState(false);
  const [localError, setLocalError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');
    setError(null);
    setIsLoading(true);

    if (username.length < 3 || username.length > 32) {
      setLocalError('Username must be between 3 and 32 characters');
      setIsLoading(false);
      return;
    }

    try {
      await createFirstUser.mutateAsync({ username });
      setCreated(true);
      setCanProgress(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create admin user';
      setLocalError(msg);
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  if (created) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserIcon className="h-5 w-5 text-primary" />
            Admin User Created
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-secondary border border-green-200 rounded-lg p-4">
            <p className="text-sm">
              Admin user <strong>{username}</strong> has been created successfully!
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              No password was set - authentication is disabled by default.
              You can enable authentication later in Settings to set up passwords.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        No existing users were found during import. Create your admin account to get started.
        You can set a password later when you enable authentication.
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
        {localError && (
          <div className="p-3 text-sm text-red-500 bg-red-50 dark:bg-red-950 rounded-md">
            {localError}
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="admin-username">Admin Username</Label>
          <Input
            id="admin-username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter your admin username"
            required
            minLength={3}
            maxLength={32}
            autoFocus
          />
        </div>

        <Button type="submit" disabled={createFirstUser.isPending}>
          {createFirstUser.isPending ? 'Creating...' : 'Create Admin User'}
        </Button>
      </form>
    </div>
  );
}