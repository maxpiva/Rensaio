'use client';

import { useState } from 'react';
import { useGenerateInvite } from '@/lib/api/hooks/useUsers';
import { useAuthStatus } from '@/lib/api/hooks/useAuth';
import { type User } from '@/lib/api/types';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Copy, RefreshCw } from 'lucide-react';

interface InviteDialogProps {
  user: User;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InviteDialog({ user, open, onOpenChange }: InviteDialogProps) {
  const generateInvite = useGenerateInvite();
  const { data: authStatus } = useAuthStatus();
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const authEnabled = authStatus?.authenticationEnabled ?? false;

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

  const handleCopyOpdsPath = async () => {
    const msg = `Hello ${user.username},\n\nYour OPDS path is: ${window.location.origin}/${user.opdsPath}`;
    await navigator.clipboard.writeText(msg);
    setInviteMessage(msg);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Invite User: {user.username}</DialogTitle>
          <DialogDescription>
            Generate an invite message to share with the user. The message includes their unique
            OPDS path and {authEnabled ? 'a link to set their password' : 'share instructions'}.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {error && (
            <div className="p-3 text-sm text-red-500 bg-red-50 dark:bg-red-950 rounded-md">
              {error}
            </div>
          )}

          {!inviteMessage ? (
            <div className="text-sm text-muted-foreground space-y-2">
              <p>Click the button below to generate an invite message.</p>
              {!authEnabled && (
                <p>The message will include only the OPDS path without a password link, since authentication is disabled.</p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <label htmlFor="invite-message" className="text-sm font-medium">Invite Message</label>
              <textarea
                id="invite-message"
                value={inviteMessage}
                readOnly
                rows={6}
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 font-mono"
              />
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={handleCopy}>
                  <Copy className="w-4 h-4 mr-2" />
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
          {!authEnabled && !inviteMessage && (
            <Button variant="secondary" onClick={handleCopyOpdsPath}>
              <Copy className="w-4 h-4 mr-2" />
              Copy OPDS Path Only
            </Button>
          )}
          {inviteMessage && (
            <Button variant="secondary" onClick={handleGenerate} disabled={generateInvite.isPending}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Regenerate
            </Button>
          )}
          {!inviteMessage && (
            <Button onClick={handleGenerate} disabled={generateInvite.isPending}>
              {generateInvite.isPending ? 'Generating...' : 'Generate Invite'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}