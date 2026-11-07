'use client';

import { useState, useEffect } from 'react';
import { useGenerateInvite } from '@/lib/api/hooks/useUsers';
import { useAuthStatus } from '@/lib/api/hooks/useAuth';
import { useSettings } from '@/lib/api/hooks/useSettings';
import { type User } from '@/lib/api/types';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Check, Copy, Mail, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { UsersDialogHeading, UsersErrorNote, usersFieldLabel } from './users-dialog-heading';

interface InviteDialogProps {
  user: User;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InviteDialog({ user, open, onOpenChange }: InviteDialogProps) {
  const generateInvite = useGenerateInvite();
  const { data: authStatus } = useAuthStatus();
  const { data: settings } = useSettings();
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const authEnabled = authStatus?.authenticationEnabled ?? false;

  // Auto-generate invite message when dialog opens
  useEffect(() => {
    if (open) {
      setInviteMessage(null);
      setError('');
      setCopied(false);
      void handleGenerate();
    }
  }, [open]);

  const handleGenerate = async () => {
    setError('');
    try {
      const result = await generateInvite.mutateAsync(user.id);
      setInviteMessage(result.message);

      await navigator.clipboard.writeText(result.message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate invite');
    }
  };

  const handleCopy = async () => {
    if (inviteMessage) {
      await navigator.clipboard.writeText(inviteMessage);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <UsersDialogHeading
          icon={Mail}
          action="Invite User:"
          subject={user.username}
          description={
            <>
              Generate an invite message to share with the user. The message includes their unique
              OPDS path and {authEnabled ? 'a link to set their password' : 'share instructions'}.
            </>
          }
        />
        <div className="space-y-4">
          {error && <UsersErrorNote>{error}</UsersErrorNote>}

          {!inviteMessage && !error && generateInvite.isPending && (
            <div className="space-y-2" aria-busy="true">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-[136px] w-full" />
              <span className="sr-only">Generating invite...</span>
            </div>
          )}

          {inviteMessage && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="invite-message" className={usersFieldLabel}>Invite Message</Label>
                <span
                  aria-live="polite"
                  className={cn(
                    'inline-flex items-center gap-1 text-xs font-medium text-ok transition-opacity',
                    copied ? 'opacity-100' : 'opacity-0',
                  )}
                >
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  {copied ? 'Copied!' : ''}
                </span>
              </div>
              <Textarea
                id="invite-message"
                value={inviteMessage}
                readOnly
                rows={6}
                className="font-mono text-[12.5px] leading-relaxed"
              />
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={handleCopy}>
                  {copied ? <Check className="h-3.5 w-3.5 text-ok" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
                  {copied ? 'Copied!' : 'Copy to Clipboard'}
                </Button>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {inviteMessage && (
            <Button variant="secondary" onClick={handleGenerate} disabled={generateInvite.isPending}>
              <RefreshCw className={`h-4 w-4 ${generateInvite.isPending ? 'animate-spin' : ''}`} aria-hidden="true" />
              {generateInvite.isPending ? 'Regenerating...' : 'Regenerate'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
