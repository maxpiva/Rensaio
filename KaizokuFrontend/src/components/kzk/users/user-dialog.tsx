'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useUpdateUser, useRegenerateOpdsPath } from '@/lib/api/hooks/useUsers';
import { type User, UserLevel } from '@/lib/api/types';
import { fetchGravatarBase64 } from '@/lib/gravatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { UserIcon, Upload, RefreshCw, Route, Copy, Check } from 'lucide-react';

interface EditUserDialogProps {
  user: User;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditUserDialog({ user, open, onOpenChange }: EditUserDialogProps) {
  const { user: currentUser, refreshAuth } = useAuth();
  const updateUser = useUpdateUser();
  const regenerateOpds = useRegenerateOpdsPath();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [level, setLevel] = useState<UserLevel>(user.level);
  const [isActive, setIsActive] = useState(user.isActive);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [avatarBase64, setAvatarBase64] = useState<string | undefined>(undefined);
  const [avatarContentType, setAvatarContentType] = useState<string | undefined>(undefined);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(
    user.avatarBase64 ? `data:${user.avatarContentType || 'image/png'};base64,${user.avatarBase64}` : null
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
        user.avatarBase64 ? `data:${user.avatarContentType || 'image/png'};base64,${user.avatarBase64}` : null
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
    const fullOpdsUrl = `${window.location.origin}/${user.opdsPath}`;
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

  // Can change level/active if:
  // 1. Not editing self, AND
  // 2. Target is not an admin, OR (target is admin AND current user is owner)
  const canChangeLevelOrActive = !isSelf && (
    user.level !== UserLevel.Admin || isCurrentUserOwner
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit User: {user.username}</DialogTitle>
          <DialogDescription>
            Update user settings and avatar.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {error && (
            <div className="p-3 text-sm text-red-500 bg-red-50 dark:bg-red-950 rounded-md">
              {error}
            </div>
          )}

          {/* Avatar */}
          <div className="space-y-2">
            <Label>Avatar</Label>
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center overflow-hidden">
                {avatarPreview && !removeAvatar ? (
                  <img src={avatarPreview} alt="Avatar preview" className="w-full h-full object-cover" />
                ) : (
                  <UserIcon className="w-8 h-8 text-muted-foreground" />
                )}
              </div>
              <div className="space-y-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Upload Image
                </Button>
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
            <Label htmlFor="gravatar">Get from Gravatar</Label>
            <div className="flex gap-2">
              <Input
                id="gravatar"
                type="email"
                placeholder="Enter email for Gravatar"
                value={gravatarEmail}
                onChange={(e) => setGravatarEmail(e.target.value)}
              />
              <Button type="button" variant="secondary" onClick={handleGravatarFetch} size="sm">
                Fetch
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Email is used only on the frontend to fetch the Gravatar image. It is never sent to the backend.
            </p>
          </div>

          {/* Remove avatar */}
          {avatarPreview && !removeAvatar && (
            <div className="flex items-center gap-2">
              <Switch
                id="remove-avatar"
                checked={removeAvatar}
                onCheckedChange={setRemoveAvatar}
              />
              <Label htmlFor="remove-avatar">Remove avatar</Label>
            </div>
          )}

          {/* OPDS Path */}
          <div className="space-y-2">
            <Label>OPDS Path</Label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <div className="flex items-center gap-2 w-full p-2 rounded-md border bg-muted/30 text-xs font-mono text-muted-foreground pr-10">
                  <Route className="h-3 w-3 shrink-0" />
                  <span className="truncate">{user.opdsPath}</span>
                </div>
                <button
                  type="button"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 flex items-center justify-center rounded hover:bg-muted transition-colors"
                  onClick={handleCopyOpds}
                  title="Copy OPDS URL"
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-green-500" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={async () => {
                  const result = await regenerateOpds.mutateAsync(user.id);
                  // Update display by refreshing parent when dialog reopens
                }}
                disabled={regenerateOpds.isPending}
              >
                <RefreshCw className={`h-3 w-3 mr-1 ${regenerateOpds.isPending ? 'animate-spin' : ''}`} />
                {regenerateOpds.isPending ? 'Regenerating...' : 'Regenerate'}
              </Button>
            </div>
          </div>

          {/* Level - only show if allowed by admin hierarchy */}
          {canChangeLevelOrActive && (
            <div className="space-y-2">
              <Label htmlFor="level">Level</Label>
              <Select
                value={level.toString()}
                onValueChange={(v) => setLevel(Number(v) as UserLevel)}
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
          )}

          {/* Active status - only show if allowed by admin hierarchy */}
          {canChangeLevelOrActive && (
            <div className="flex items-center gap-2">
              <Switch
                id="is-active"
                checked={isActive}
                onCheckedChange={setIsActive}
              />
              <Label htmlFor="is-active">Active</Label>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={updateUser.isPending}>
            {updateUser.isPending ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}