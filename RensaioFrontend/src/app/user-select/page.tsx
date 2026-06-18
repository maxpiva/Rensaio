'use client';

import { useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { UserIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function UserSelectPage() {
  const { isAuthEnabled, availableUsers, selectUser, isLoading, refreshAuth } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isAuthEnabled) {
      router.push('/login');
    }
  }, [isAuthEnabled, router]);

  // Also refresh auth on mount to get the latest user list
  useEffect(() => {
    refreshAuth();
  }, [refreshAuth]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <Card className="w-full max-w-md mx-4">
        <CardHeader className="space-y-3">
          <CardTitle className="flex justify-center">
            <img src="/rensaiow.png" alt="Rensaiō" className="h-20 w-auto" />
          </CardTitle>
          <CardDescription className="text-center">
            Select your user to continue
          </CardDescription>
        </CardHeader>
        <CardContent>
          {(!availableUsers || availableUsers.length === 0) ? (
            <p className="text-center text-muted-foreground">
              No users found. Please contact your administrator.
            </p>
          ) : (
            <div className="space-y-2">
              {availableUsers?.map((u) => (
                <Button
                  key={u.id}
                  variant="outline"
                  className="w-full justify-start gap-3 h-14"
                  onClick={() => selectUser(u.username)}
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}