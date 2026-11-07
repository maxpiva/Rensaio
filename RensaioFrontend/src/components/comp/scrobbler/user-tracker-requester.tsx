"use client";

import React, { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useScrobblerConfigs, useScrobblerAuthorize, useScrobblerDisconnect, useSaveComicVineApiKey, useKitsuDirectAuth, useMangaDexDirectAuth } from '@/lib/api/hooks/useScrobbler';
import { ScrobblerProvider, ProviderFeatures, type ScrobblerConfig } from '@/lib/api/types';
import { Link, Link2Off, Key, Radio, ExternalLink, AlertTriangle, CheckCircle2, CircleDashed } from 'lucide-react';
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from '@/lib/utils';
import { apiClient } from '@/lib/api/client';

interface UserTrackerRequesterProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * A provider shown in the Trackers dialog must require authentication.
 * Public metadata-only providers (MangaBaka/Bangumi/MangaUpdates) have no
 * login/connect step, so they are filtered out here. ComicVine is metadata-only
 * but requires an API key, so it still requires authentication.
 */
function requiresAuthentication(config: ScrobblerConfig): boolean {
  const features = config.features ?? 0;
  const hasMetadata = (features & ProviderFeatures.Metadata) === Number(ProviderFeatures.Metadata);
  const hasScrobbling = (features & ProviderFeatures.Scrobbling) === Number(ProviderFeatures.Scrobbling);
  const isPublicMetadataId =
    config.provider === ScrobblerProvider.MangaBaka ||
    config.provider === ScrobblerProvider.Bangumi ||
    config.provider === ScrobblerProvider.MangaUpdates;
  const isComicVine = config.provider === ScrobblerProvider.ComicVine;
  const isPublic = isPublicMetadataId || (hasMetadata && !hasScrobbling && !config.supportsDirectAuth && !isComicVine);
  return !isPublic;
}

export function UserTrackerRequester({ open, onOpenChange }: UserTrackerRequesterProps) {
  const queryClient = useQueryClient();
  const { data: configs, isLoading: configsLoading, error: configsError } = useScrobblerConfigs(open);
  const authorize = useScrobblerAuthorize();
  const disconnect = useScrobblerDisconnect();

  const kitsuAuth = useKitsuDirectAuth();
  const mangaDexAuth = useMangaDexDirectAuth();
  const saveComicVineKey = useSaveComicVineApiKey();

  const [comicVineApiKey, setComicVineApiKey] = useState('');
  const [kitsuEmail, setKitsuEmail] = useState('');
  const [kitsuPassword, setKitsuPassword] = useState('');
  const [mdUsername, setMdUsername] = useState('');
  const [mdPassword, setMdPassword] = useState('');
  const [mdClientId, setMdClientId] = useState('');
  const [mdClientSecret, setMdClientSecret] = useState('');
  const [connecting, setConnecting] = useState<ScrobblerProvider | null>(null);

  const handleConnectOAuth = useCallback(async (config: ScrobblerConfig) => {
    const providerName = ScrobblerProvider[config.provider];
    setConnecting(config.provider);
    try {
      const result = await authorize.mutateAsync(providerName);

      // Backend backstop: provider reports noAuthRequired — nothing to connect.
      if (result.noAuthRequired || !result.authUrl) {
        await queryClient.invalidateQueries({ queryKey: ['scrobbler', 'configs'] });
        return;
      }

      // Open OAuth popup — opens on the proxy domain (HTTPS)
      const popup = window.open(result.authUrl, 'oauth-popup', 'width=600,height=700');

      // Poll the backend callback until the proxy has stored the tokens.
      const callbackUrl = `/api/externalprovider/callback/${providerName}?state=${result.state}`;

      let connected = false;
      let attempts = 0;
      while (!connected && attempts < 60) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        attempts++;
        try {
          await apiClient.get<{ connected: boolean }>(callbackUrl);
          connected = true;
        } catch {
          // Tokens not yet stored in the proxy — retry
        }
      }

      popup?.close();

      if (connected) {
        // Invalidate configs so the UI shows the provider as connected
        await queryClient.invalidateQueries({ queryKey: ['scrobbler', 'configs'] });
      }
    } finally {
      setConnecting(null);
    }
  }, [authorize, queryClient]);

  const handleDisconnect = useCallback((config: ScrobblerConfig) => {
    const providerName = ScrobblerProvider[config.provider];
    disconnect.mutate(providerName);
  }, [disconnect]);

  const handleKitsuConnect = useCallback(async () => {
    if (!kitsuEmail.trim() || !kitsuPassword.trim()) return;
    setConnecting(ScrobblerProvider.Kitsu);
    try {
      await kitsuAuth.mutateAsync({ email: kitsuEmail, password: kitsuPassword });
      setKitsuEmail('');
      setKitsuPassword('');
    } finally {
      setConnecting(null);
    }
  }, [kitsuEmail, kitsuPassword, kitsuAuth]);

  const handleMangaDexConnect = useCallback(async () => {
    if (!mdUsername.trim() || !mdPassword.trim() || !mdClientId.trim() || !mdClientSecret.trim()) return;
    setConnecting(ScrobblerProvider.MangaDex);
    try {
      await mangaDexAuth.mutateAsync({
        username: mdUsername,
        password: mdPassword,
        clientId: mdClientId,
        clientSecret: mdClientSecret,
      });
      setMdUsername('');
      setMdPassword('');
      setMdClientId('');
      setMdClientSecret('');
    } finally {
      setConnecting(null);
    }
  }, [mdUsername, mdPassword, mdClientId, mdClientSecret, mangaDexAuth]);

  const handleSaveComicVine = useCallback(async () => {
    if (!comicVineApiKey.trim()) return;
    setConnecting(ScrobblerProvider.ComicVine);
    try {
      await saveComicVineKey.mutateAsync(comicVineApiKey);
      setComicVineApiKey('');
    } finally {
      setConnecting(null);
    }
  }, [comicVineApiKey, saveComicVineKey]);

  // Only show providers that require authentication (no public metadata-only providers).
  const authConfigs = (configs ?? []).filter(requiresAuthentication);

  const fieldClass = 'min-w-0 font-mono text-[13px]';

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[88vh] w-[calc(100vw-1.5rem)] max-w-2xl overflow-y-auto">
          <DialogHeader className="flex-row items-start gap-3">
            <span
              aria-hidden="true"
              className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-accent-line bg-accent-soft text-accent-ink"
            >
              <Radio className="h-4 w-4" />
            </span>
            <div className="min-w-0 space-y-1">
              <p className="paper-eyebrow">Trackers</p>
              <DialogTitle>
                External <em className="font-serif italic">Services</em>
              </DialogTitle>
              <DialogDescription>
                Log in and manage your authentication with external services
              </DialogDescription>
            </div>
          </DialogHeader>

          {configsLoading ? (
            <div className="space-y-3" aria-busy="true">
              <span className="sr-only" role="status">Loading trackers...</span>
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3 rounded-lg border border-rule p-4">
                  <Skeleton className="h-9 w-9 rounded-md" />
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="ml-auto h-8 w-24" />
                </div>
              ))}
            </div>
          ) : configsError ? (
            <div role="alert" className="flex items-start gap-2 rounded-md border border-bad/25 bg-bad-soft p-3 text-sm text-bad">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 break-words">Failed to load trackers: {configsError.message}</span>
            </div>
          ) : authConfigs.length === 0 ? (
            <div className="rounded-lg border border-dashed border-rule-2 bg-paper-1 px-6 py-10 text-center text-sm text-ink-2">
              No tracking providers that require authentication are available.
            </div>
          ) : (
            <ul className="space-y-3">
              {authConfigs.map((config) => {
                const isConnecting = connecting === config.provider;

                return (
                  <li
                    key={config.provider}
                    className={cn(
                      'space-y-3 rounded-lg border bg-card p-4 transition-colors',
                      config.isConnected ? 'border-ok/30' : 'border-rule',
                    )}
                  >
                    {/* Header row */}
                    <div className="flex items-center gap-3">
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        {config.icon ? (
                          <img
                            src={config.icon}
                            alt=""
                            className="h-9 w-9 flex-shrink-0 rounded-md border border-rule"
                          />
                        ) : (
                          <div
                            aria-hidden="true"
                            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md border border-rule bg-paper-2 font-mono text-sm font-bold text-ink-2"
                          >
                            {config.displayName.charAt(0)}
                          </div>
                        )}
                        <div className="min-w-0">
                          <span className="block break-words text-sm font-semibold text-ink">{config.displayName}</span>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                            {config.isConnected ? (
                              <Badge variant="ok" className="gap-1">
                                <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                                Connected
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="gap-1">
                                <CircleDashed className="h-3 w-3" aria-hidden="true" />
                                Disconnected
                              </Badge>
                            )}
                            {/* Provider link */}
                            {config.link && (
                              <a
                                href={config.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 rounded-sm text-xs font-medium text-accent-ink underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-sm:-my-3 max-sm:py-3"
                              >
                                <ExternalLink className="h-3 w-3" aria-hidden="true" />
                                {config.linkDescription}
                              </a>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Disconnect */}
                      <div className="flex flex-shrink-0 items-center gap-2">
                        {config.isConnected && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-bad/30 text-bad hover:bg-bad-soft hover:text-bad max-sm:min-h-11"
                            onClick={() => handleDisconnect(config)}
                            disabled={disconnect.isPending}
                            aria-label={`Disconnect ${config.displayName}`}
                            title={`Disconnect ${config.displayName}`}
                          >
                            <Link2Off className="h-4 w-4" aria-hidden="true" />
                            <span className="hidden sm:inline">Disconnect</span>
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Connect form (only when not connected) */}
                    {!config.isConnected && (
                      <div className="border-t border-rule pt-3">
                        {config.supportsDirectAuth ? (
                          config.provider === ScrobblerProvider.Kitsu ? (
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                              <div className="grid flex-1 grid-cols-1 gap-2 min-[480px]:grid-cols-2">
                                <Input
                                  type="email"
                                  placeholder="Email"
                                  aria-label="Kitsu email"
                                  value={kitsuEmail}
                                  onChange={(e) => setKitsuEmail(e.target.value)}
                                  className={fieldClass}
                                />
                                <Input
                                  type="password"
                                  placeholder="Password"
                                  aria-label="Kitsu password"
                                  value={kitsuPassword}
                                  onChange={(e) => setKitsuPassword(e.target.value)}
                                  className={fieldClass}
                                />
                              </div>
                              <Button
                                onClick={handleKitsuConnect}
                                disabled={isConnecting || !kitsuEmail.trim() || !kitsuPassword.trim()}
                              >
                                <Link className="h-4 w-4" aria-hidden="true" />
                                {isConnecting ? 'Connecting...' : 'Connect'}
                              </Button>
                            </div>
                          ) : config.provider === ScrobblerProvider.MangaDex ? (
                            <div className="flex flex-col gap-2">
                              <div className="grid grid-cols-1 gap-2 min-[480px]:grid-cols-2">
                                <Input
                                  type="text"
                                  placeholder="Username"
                                  aria-label="MangaDex username"
                                  value={mdUsername}
                                  onChange={(e) => setMdUsername(e.target.value)}
                                  className={fieldClass}
                                />
                                <Input
                                  type="password"
                                  placeholder="Password"
                                  aria-label="MangaDex password"
                                  value={mdPassword}
                                  onChange={(e) => setMdPassword(e.target.value)}
                                  className={fieldClass}
                                />
                                <Input
                                  type="text"
                                  placeholder="Client ID"
                                  aria-label="MangaDex client ID"
                                  value={mdClientId}
                                  onChange={(e) => setMdClientId(e.target.value)}
                                  className={fieldClass}
                                />
                                <Input
                                  type="password"
                                  placeholder="Client Secret"
                                  aria-label="MangaDex client secret"
                                  value={mdClientSecret}
                                  onChange={(e) => setMdClientSecret(e.target.value)}
                                  className={fieldClass}
                                />
                              </div>
                              <Button
                                className="sm:self-end"
                                onClick={handleMangaDexConnect}
                                disabled={isConnecting || !mdUsername.trim() || !mdPassword.trim() || !mdClientId.trim() || !mdClientSecret.trim()}
                              >
                                <Link className="h-4 w-4" aria-hidden="true" />
                                {isConnecting ? 'Connecting...' : 'Connect'}
                              </Button>
                            </div>
                          ) : null
                        ) : config.provider === ScrobblerProvider.ComicVine ? (
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                            <Input
                              type="password"
                              placeholder="Enter ComicVine API key"
                              aria-label="ComicVine API key"
                              value={comicVineApiKey}
                              onChange={(e) => setComicVineApiKey(e.target.value)}
                              className={cn(fieldClass, 'flex-1')}
                            />
                            <Button
                              onClick={handleSaveComicVine}
                              disabled={isConnecting || !comicVineApiKey.trim()}
                            >
                              <Key className="h-4 w-4" aria-hidden="true" />
                              {isConnecting ? 'Saving...' : 'Save Key'}
                            </Button>
                          </div>
                        ) : (
                          <div className="flex justify-end">
                            <Button
                              className="max-sm:w-full"
                              onClick={() => handleConnectOAuth(config)}
                              disabled={isConnecting || authorize.isPending}
                            >
                              <Link className="h-4 w-4" aria-hidden="true" />
                              {isConnecting ? 'Connecting...' : 'Connect'}
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
