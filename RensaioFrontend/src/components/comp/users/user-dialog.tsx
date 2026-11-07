'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useSettings } from '@/lib/api/hooks/useSettings';
import { useUpdateUser, useRegenerateOpdsPath } from '@/lib/api/hooks/useUsers';
import { type User, UserLevel } from '@/lib/api/types';
import { fetchGravatarBase64 } from '@/lib/gravatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { UserIcon, Upload, RefreshCw, Route, Copy, Check, Pencil, Loader2 } from 'lucide-react';
import { UsersDialogHeading, UsersErrorNote, usersFieldLabel } from './users-dialog-heading';

interface EditUserDialogProps {
  user: User;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditUserDialog({ user, open, onOpenChange }: EditUserDialogProps) {
  const { user: currentUser, refreshAuth } = useAuth();
  const { data: settings } = useSettings();
  const updateUser = useUpdateUser();
  const regenerateOpds = useRegenerateOpdsPath();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [level, setLevel] = useState<UserLevel>(user.level);
  const [isActive, setIsActive] = useState(user.isActive);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [avatarBase64, setAvatarBase64] = useState<string | undefined>(undefined);
  const [avatarContentType, setAvatarContentType] = useState<string | undefined>(undefined);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(
    user.avatarBase64 ? `data:${user.avatarContentType?.length ? user.avatarContentType : 'image/png'};base64,${user.avatarBase64}` : null
  );
  const [error, setError] = useState('');
  const [gravatarEmail, setGravatarEmail] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) {
      setLevel(user.level);
      setIsActive(user.isActive);
      setRemoveAvatar(false);
      setAvatarBase64(undefined);
      setAvatarContentType(undefined);
      setAvatarPreview(
        user.avatarBase64 ? `data:${user.avatarContentType?.length ? user.avatarContentType : 'image/png'};base64,${user.avatarBase64}` : null
      );
      setError('');
      setGravatarEmail('');
    }
  }, [open, user]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setError('Image must be less than 2MB');
      return;
    }

    const validTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      setError('Only PNG, JPEG, GIF, and WebP images are allowed');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      setAvatarBase64(base64);
      setAvatarContentType(file.type);
      setAvatarPreview(reader.result as string);
      setRemoveAvatar(false);
    };
    reader.readAsDataURL(file);
  };

  const handleGravatarFetch = async () => {
    if (!gravatarEmail.trim()) return;
    setError('');
    try {
      const { base64, contentType } = await fetchGravatarBase64(gravatarEmail);
      setAvatarBase64(base64);
      setAvatarContentType(contentType);
      setAvatarPreview(`data:${contentType};base64,${base64}`);
      setRemoveAvatar(false);
    } catch (e) {
      console.error('Gravatar error:', e);
      setError(e instanceof Error ? e.message : 'Gravatar error');
    }
  };

  // Simple MD5 hash for Gravatar (using Web Crypto API)
  async function md5(str: string): Promise<string> {
    const buffer = await crypto.subtle.digest('MD5', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  const handleCopyOpds = async () => {
    const externalDomain = settings?.externalDomain?.length ? settings.externalDomain : "http://localhost:9833";
    const fullOpdsUrl = `${externalDomain}/${user.opdsPath}`;
    try {
      await navigator.clipboard.writeText(fullOpdsUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API not available
    }
  };

  const handleSave = async () => {
    setError('');

    try {
      const updateData: Parameters<typeof updateUser.mutateAsync>[0]['data'] = {};
      if (level !== user.level) updateData.level = level;
      if (isActive !== user.isActive) updateData.isActive = isActive;
      if (avatarBase64) {
        updateData.avatarBase64 = avatarBase64;
        updateData.avatarContentType = avatarContentType;
      }
      if (removeAvatar) updateData.removeAvatar = true;

      await updateUser.mutateAsync({ id: user.id, data: updateData });
      // Refresh auth context to pick up avatar changes for the current user
      if (isSelf) {
        await refreshAuth();
      }
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update user');
    }
  };

  const isSelf = currentUser?.id === user.id;
  const isCurrentUserOwner = currentUser?.level === UserLevel.Owner;
  const isTargetOwner = user.level === UserLevel.Owner;

  // Admin users cannot edit the owner at all
  const canEditThisUser = !isTargetOwner || isCurrentUserOwner;

  // Can change level/active if:
  // 1. Not editing self, AND
  // 2. Target is not the owner (admin can't touch owner), AND
  // 3. Target is not an admin, OR (target is admin AND current user is owner)
  const canChangeLevelOrActive = canEditThisUser && !isSelf && (
    user.level !== UserLevel.Admin || isCurrentUserOwner
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <UsersDialogHeading
          icon={Pencil}
          action="Edit User:"
          subject={user.username}
          description="Update user settings and avatar."
        />
        <div className="space-y-5">
          {error && <UsersErrorNote>{error}</UsersErrorNote>}

          {/* Avatar */}
          <div className="space-y-2">
            <Label className={usersFieldLabel}>Avatar</Label>
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-rule bg-paper-2">
                {avatarPreview && !removeAvatar ? (
                  // eslint-disable-next-line @next/next/no-img-element -- data: URI preview
                  <img src={avatarPreview} alt="Avatar preview" className="h-full w-full object-cover" />
                ) : (
                  <UserIcon className="h-7 w-7 text-ink-3" aria-hidden="true" />
                )}
              </div>
              <div className="space-y-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                  Upload Image
                </Button>
                <p className="text-[11.5px] text-ink-3">PNG, JPEG, GIF or WebP · under 2MB</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".png,.jpg,.jpeg,.gif,.webp"
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </div>
            </div>
          </div>

          {/* Gravatar */}
          <div className="space-y-2">
            <Label htmlFor="gravatar" className={usersFieldLabel}>Get from Gravatar</Label>
            <div className="flex gap-2">
              <Input
                id="gravatar"
                type="email"
                placeholder="Enter email for Gravatar"
                value={gravatarEmail}
                onChange={(e) => setGravatarEmail(e.target.value)}
                className="min-w-0 flex-1"
              />
              <Button
                type="button"
                variant="secondary"
                onClick={handleGravatarFetch}
                className="shrink-0"
              >
                Fetch
              </Button>
            </div>
            <p className="text-xs leading-relaxed text-ink-3">
              Email is used only on the frontend to fetch the Gravatar image. It is never sent to the backend.
            </p>
          </div>

          {/* Remove avatar */}
          {avatarPreview && !removeAvatar && (
            <div className="flex min-h-11 items-center justify-between gap-3 rounded-md border border-rule bg-paper-1 px-3 py-2">
              <Label htmlFor="remove-avatar" className="cursor-pointer">Remove avatar</Label>
              <Switch
                id="remove-avatar"
                checked={removeAvatar}
                onCheckedChange={setRemoveAvatar}
              />
            </div>
          )}

          {/* OPDS Path */}
          <div className="space-y-2">
            <Label className={usersFieldLabel}>OPDS Path</Label>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded-md border border-rule bg-paper-2 py-1 pl-2.5 pr-1 font-mono text-xs text-ink-2 max-sm:min-h-11">
                <Route className="h-3.5 w-3.5 shrink-0 text-ink-3" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate" title={user.opdsPath}>{user.opdsPath}</span>
                <button
                  type="button"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-ink-3 transition-colors hover:bg-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-sm:h-10 max-sm:w-10"
                  onClick={handleCopyOpds}
                  title="Copy OPDS URL"
                  aria-label={copied ? 'OPDS URL copied' : 'Copy OPDS URL'}
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-ok" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={async () => {
                  const result = await regenerateOpds.mutateAsync(user.id);
                  // Update display by refreshing parent when dialog reopens
                }}
                disabled={regenerateOpds.isPending}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${regenerateOpds.isPending ? 'animate-spin' : ''}`} aria-hidden="true" />
                {regenerateOpds.isPending ? 'Regenerating...' : 'Regenerate'}
              </Button>
            </div>
          </div>

          {/* Level - only show if allowed by admin hierarchy */}
          {canChangeLevelOrActive && (
            <div className="space-y-2">
              <Label htmlFor="level" className={usersFieldLabel}>Level</Label>
              <Select
                value={level.toString()}
                onValueChange={(v) => setLevel(Number(v))}
              >
                <SelectTrigger id="level">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UserLevel.User.toString()}>User</SelectItem>
                  <SelectItem value={UserLevel.Manager.toString()}>Manager</SelectItem>
                  <SelectItem value={UserLevel.Admin.toString()}>Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Active status - only show if allowed by admin hierarchy */}
          {canChangeLevelOrActive && (
            <div className="flex min-h-11 items-center justify-between gap-3 rounded-md border border-rule bg-paper-1 px-3 py-2">
              <Label htmlFor="is-active" className="cursor-pointer">Active</Label>
              <Switch
                id="is-active"
                checked={isActive}
                onCheckedChange={setIsActive}
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={updateUser.isPending}>
            {updateUser.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
            {updateUser.isPending ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
