'use client';

import { useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { Skeleton } from '@/components/ui/skeleton';
import { LEVEL_BADGE, LEVEL_LABEL, UserAvatar } from '@/components/comp/layout/user-menu';
import { cn } from '@/lib/utils';
import { AuthFrame, AuthHeading, AuthNote } from '../login/auth-frame';
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
    void refreshAuth();
  }, [refreshAuth]);

  if (isLoading) {
    return (
      <AuthFrame tagline={<>Pick up <em>where you left off</em>.</>}>
        <div className="w-full max-w-[440px]" role="status" aria-label="Loading">
          <Skeleton className="mb-3 h-2.5 w-28" />
          <Skeleton className="mb-3 h-10 w-64" />
          <Skeleton className="mb-7 h-4 w-48" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-[124px] rounded-md" />
            ))}
          </div>
          <span className="sr-only">Loading...</span>
        </div>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame tagline={<>Pick up <em>where you left off</em>.</>}>
      <div className="w-full max-w-[440px] motion-safe:animate-paper-rise">
        <AuthHeading
          eyebrow="Who’s reading"
          title={<>Select your <em>user</em>.</>}
          description="Select your user to continue"
        />
        {(!availableUsers || availableUsers.length === 0) ? (
          <AuthNote tone="info">No users found. Please contact your administrator.</AuthNote>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {availableUsers?.map((u, i) => (
              <li
                key={u.id}
                className="motion-safe:animate-paper-rise"
                style={{ animationDelay: `${80 + i * 50}ms` }}
              >
                <button
                  type="button"
                  onClick={() => selectUser(u.username)}
                  className="group flex w-full min-w-0 flex-col items-center gap-[9px] rounded-md border border-rule-2 bg-paper-1 px-2.5 pb-3.5 pt-[18px] text-ink outline-none transition-[transform,box-shadow,border-color] duration-200 ease-out hover:-translate-y-0.5 hover:border-primary hover:shadow-print focus-visible:ring-2 focus-visible:ring-ring active:translate-y-0 active:shadow-none"
                >
                  <UserAvatar
                    username={u.username}
                    avatarBase64={u.avatarBase64}
                    avatarContentType={u.avatarContentType}
                    className="h-[52px] w-[52px] text-[17px]"
                  />
                  <span className="w-full truncate text-center text-[13.5px] font-semibold">{u.username}</span>
                  {u.level !== undefined && LEVEL_LABEL[u.level] && (
                    <span className={cn('rounded-sm px-1.5 py-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.12em]', LEVEL_BADGE[u.level])}>
                      {LEVEL_LABEL[u.level]}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AuthFrame>
  );
}
