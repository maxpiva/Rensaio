'use client';

import React, { useState } from 'react';
import { useClaimUser } from '@/lib/api/hooks/useAuth';
import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { UserIcon, Check } from 'lucide-react';

interface IdentifyUserStepProps {
  setError: (error: string | null) => void;
  setIsLoading: (loading: boolean) => void;
  setCanProgress: (canProgress: boolean) => void;
  /** List of usernames that were auto-created during import */
  autoCreatedUsers: string[];
}

export function IdentifyUserStep({
  setError,
  setIsLoading,
  setCanProgress,
  autoCreatedUsers,
}: IdentifyUserStepProps) {
  const { availableUsers, refreshAuth } = useAuth();
  const claimUser = useClaimUser();
  const [claimed, setClaimed] = useState(false);
  const [selectedUsername, setSelectedUsername] = useState('');
  const [localError, setLocalError] = useState('');

  // Get users that were auto-created (those in availableUsers that match autoCreatedUsers)
  const matchedUsers = availableUsers?.filter(
    (u) => autoCreatedUsers.includes(u.username)
  ) ?? [];

  const handleClaim = async (userId: string, username: string) => {
    setLocalError('');
    setError(null);
    setIsLoading(true);
    setSelectedUsername(username);

    try {
      await claimUser.mutateAsync(userId);
      await refreshAuth();
      setClaimed(true);
      setCanProgress(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to claim user';
      setLocalError(msg);
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  if (claimed) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Check className="h-5 w-5 text-green-500" />
            User Identified
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-secondary border border-green-200 rounded-lg p-4">
            <p className="text-sm">
              You are now identified as <strong>{selectedUsername}</strong>!
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              You have been promoted to owner. No password was set - authentication
              is disabled by default. You can enable authentication later in Settings.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (matchedUsers.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserIcon className="h-5 w-5" />
            No Users Available
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No auto-created users are available to claim. This may mean the import
            process hasn't completed yet, or the users were already claimed.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        Users were auto-created from your imported series data. Select which user you are
        to be promoted to owner.
      </div>

      {localError && (
        <div className="p-3 text-sm text-red-500 bg-red-50 dark:bg-red-950 rounded-md">
          {localError}
        </div>
      )}

      <div className="space-y-2">
        {matchedUsers.map((u) => (
          <Button
            key={u.id}
            variant="outline"
            className="w-full justify-start gap-3 h-14"
            onClick={() => handleClaim(u.id, u.username)}
            disabled={claimUser.isPending}
          >
            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center overflow-hidden">
              {u.avatarBase64 ? (
                <img
                  src={`data:${u.avatarContentType || 'image/png'};base64,${u.avatarBase64}`}
                  alt={u.username}
                  className="w-full h-full object-cover"
                />
              ) : (
                <UserIcon className="w-4 h-4" />
              )}
            </div>
            <span className="font-medium">{u.username}</span>
          </Button>
        ))}
      </div>
    </div>
  );
}