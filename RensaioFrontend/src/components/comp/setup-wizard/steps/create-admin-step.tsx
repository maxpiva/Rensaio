'use client';

import React, { useState } from 'react';
import { useCreateFirstUser } from '@/lib/api/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { UserIcon } from 'lucide-react';
import { PaperNote, StepIntro } from '../paper';

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
      <PaperNote tone="ok" role="status" className="max-w-[560px] motion-safe:animate-paper-rise">
        <b className="block">Owner user created successfully!</b>
        <span className="mt-1 block">
          Owner user <strong className="font-mono">{username}</strong> has been created. No password was set - authentication is disabled by default. You can enable authentication later in Settings to set up passwords.
        </span>
      </PaperNote>
    );
  }

  return (
    <div className="max-w-[460px] space-y-5">
      <StepIntro>
        No existing users were found during import. Create your owner account to get started.
        You can set a password later when you enable authentication.
      </StepIntro>

      <form onSubmit={handleSubmit} className="space-y-4">
        {localError && (
          <PaperNote tone="bad" role="alert">{localError}</PaperNote>
        )}

        <div className="grid gap-1.5">
          <Label htmlFor="admin-username">Owner Username</Label>
          <Input
            id="admin-username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter your username"
            autoComplete="username"
            required
            minLength={3}
            maxLength={32}
            autoFocus
            aria-invalid={localError ? true : undefined}
          />
          <p className="text-[12px] text-ink-3">3–32 characters.</p>
        </div>

        <Button type="submit" disabled={createFirstUser.isPending} className="max-sm:w-full">
          <UserIcon aria-hidden />
          {createFirstUser.isPending ? 'Creating...' : 'Create Owner User'}
        </Button>
      </form>
    </div>
  );
}
