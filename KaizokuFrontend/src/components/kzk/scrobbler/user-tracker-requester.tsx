"use client";

import React, { useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { LazyImage } from "@/components/ui/lazy-image";
import { useScrobblerConfigs, useUpdateScrobblerConfig, useScrobblerAuthorize, useScrobblerDisconnect, useTriggerSync, useSyncStatus, useSaveComicVineApiKey, useKitsuDirectAuth, useMangaDexDirectAuth, useScrobblerUnmatched, useAutoMatchAll } from '@/lib/api/hooks/useScrobbler';
import { ScrobblerProvider, type ScrobblerConfig } from '@/lib/api/types';
import { SeriesMappingRequester } from '@/components/kzk/scrobbler/series-mapping-requester';
import { Link, Link2Off, Key, RefreshCw, Radio, ExternalLink } from 'lucide-react';
import { apiClient } from '@/lib/api/client';

interface UserTrackerRequesterProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UserTrackerRequester({ open, onOpenChange }: UserTrackerRequesterProps) {
  const { data: configs, isLoading: configsLoading, error: configsError } = useScrobblerConfigs(open);
  const { data: syncStatuses } = useSyncStatus(open);
  const { data: unmatched } = useScrobblerUnmatched(open);
  const updateConfig = useUpdateScrobblerConfig();
  const authorize = useScrobblerAuthorize();
  const disconnect = useScrobblerDisconnect();
  const triggerSync = useTriggerSync();
  const autoMatchAll = useAutoMatchAll();

  const kitsuAuth = useKitsuDirectAuth();
  const mangaDexAuth = useMangaDexDirectAuth();
  const saveComicVineKey = useSaveComicVineApiKey();

  const [selectedMappingsProvider, setSelectedMappingsProvider] = useState<ScrobblerProvider | null>(null);
  const [comicVineApiKey, setComicVineApiKey] = useState('');
  const [kitsuEmail, setKitsuEmail] = useState('');
  const [kitsuPassword, setKitsuPassword] = useState('');
  const [mdUsername, setMdUsername] = useState('');
  const [mdPassword, setMdPassword] = useState('');
  const [mdClientId, setMdClientId] = useState('');
  const [mdClientSecret, setMdClientSecret] = useState('');
  const [connecting, setConnecting] = useState<ScrobblerProvider | null>(null);

  const getSyncStatusForProvider = useCallback((provider: ScrobblerProvider) => {
    return syncStatuses?.find(s => s.provider === provider);
  }, [syncStatuses]);

  const getUnmatchedCountForProvider = useCallback((provider: ScrobblerProvider) => {
    return unmatched?.filter(u => u.provider === provider && u.mappingStatus === 0).length ?? 0;
  }, [unmatched]);

  const handleConnectOAuth = useCallback(async (config: ScrobblerConfig) => {
    const providerName = ScrobblerProvider[config.provider];
    setConnecting(config.provider);
    try {
      const result = await authorize.mutateAsync(providerName);

      // Open OAuth popup — opens on the proxy domain (HTTPS)
      const popup = window.open(result.authUrl, 'oauth-popup', 'width=600,height=700');

      // We already have the state from the authorize response.
      // Start polling the backend callback immediately — the proxy will store
      // the tokens after the user completes the OAuth flow in the popup,
      // and the backend will retrieve them from the proxy.
      const callbackUrl = `/api/scrobbler/callback/${providerName}?state=${result.state}`;

      let connected = false;
      let attempts = 0;
      while (!connected && attempts < 60) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        attempts++;
        try {
          await apiClient.get<{ connected: boolean }>(callbackUrl);
          connected = true;
        } catch {
          // Tokens not yet stored in proxy — retry
        }
      }

      popup?.close();

      if (connected) {
        // Auto-match and sync after connect
        await autoMatchAll.mutateAsync(config.provider);
        await triggerSync.mutateAsync();
      }
    } finally {
      setConnecting(null);
    }
  }, [authorize, autoMatchAll, triggerSync]);

  const handleDisconnect = useCallback((config: ScrobblerConfig) => {
    const providerName = ScrobblerProvider[config.provider];
    disconnect.mutate(providerName);
  }, [disconnect]);

  const handleKitsuConnect = useCallback(async () => {
    if (!kitsuEmail.trim() || !kitsuPassword.trim()) return;
    setConnecting(ScrobblerProvider.Kitsu);
    try {
      await kitsuAuth.mutateAsync({ email: kitsuEmail, password: kitsuPassword });
      await autoMatchAll.mutateAsync(ScrobblerProvider.Kitsu);
      await triggerSync.mutateAsync();
      setKitsuEmail('');
      setKitsuPassword('');
    } finally {
      setConnecting(null);
    }
  }, [kitsuEmail, kitsuPassword, kitsuAuth, autoMatchAll, triggerSync]);

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
      await autoMatchAll.mutateAsync(ScrobblerProvider.MangaDex);
      await triggerSync.mutateAsync();
      setMdUsername('');
      setMdPassword('');
      setMdClientId('');
      setMdClientSecret('');
    } finally {
      setConnecting(null);
    }
  }, [mdUsername, mdPassword, mdClientId, mdClientSecret, mangaDexAuth, autoMatchAll, triggerSync]);

  const handleSaveComicVine = useCallback(async () => {
    if (!comicVineApiKey.trim()) return;
    setConnecting(ScrobblerProvider.ComicVine);
    try {
      await saveComicVineKey.mutateAsync(comicVineApiKey);
      await autoMatchAll.mutateAsync(ScrobblerProvider.ComicVine);
      await triggerSync.mutateAsync();
      setComicVineApiKey('');
    } finally {
      setConnecting(null);
    }
  }, [comicVineApiKey, saveComicVineKey, autoMatchAll, triggerSync]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Radio className="h-5 w-5" />
              Trackers
            </DialogTitle>
            <DialogDescription>
              Connect and manage your reading progress to external tracking services
            </DialogDescription>
          </DialogHeader>

          {configsLoading ? (
            <div className="p-4 text-muted-foreground text-center">Loading trackers...</div>
          ) : configsError ? (
            <div className="p-4 text-destructive text-center text-sm">
              Failed to load trackers: {configsError.message}
            </div>
          ) : !configs || configs.length === 0 ? (
            <div className="p-4 text-muted-foreground text-center">
              No tracking providers available. Check the server configuration.
            </div>
          ) : (
            <div className="space-y-3">
              {configs.map((config) => {
                const syncStatus = getSyncStatusForProvider(config.provider);
                const unmatchedCount = getUnmatchedCountForProvider(config.provider);
                const isConnecting = connecting === config.provider;

                return (
                  <div
                    key={config.provider}
                    className="rounded-lg border p-4 space-y-3"
                  >
                    {/* Header row */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        {config.icon ? (
                          <img
                            src={config.icon}
                            alt={config.displayName}
                            className="h-8 w-8 rounded-lg flex-shrink-0"
                          />
                        ) : (
                          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-sm font-bold text-primary flex-shrink-0">
                            {config.displayName.charAt(0)}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{config.displayName}</span>
                            {config.isConnected ? (
                              <Badge variant="default" className="text-xs">Connected</Badge>
                            ) : (
                              <Badge variant="secondary" className="text-xs">Disconnected</Badge>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Provider link (aligned to right, after name+status) */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {config.link && (
                          <Button
                            variant="link"
                            size="sm"
                            className="text-xs gap-1"
                            asChild
                          >
                            <a
                              href={config.link}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <ExternalLink className="h-3 w-3" />
                              {config.linkDescription}
                            </a>
                          </Button>
                        )}
                        {config.isConnected && (
                          <>
                            {/* Mappings button */}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setSelectedMappingsProvider(config.provider)}
                            >
                              Mappings
                            </Button>
                            {/* Disconnect button */}
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleDisconnect(config)}
                              disabled={disconnect.isPending}
                            >
                              <Link2Off className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Status / Warning row */}
                    {config.isConnected && (
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        {/* Sync in progress */}
                        {syncStatus?.lastSyncAt && (
                          <span className="text-muted-foreground">
                            <RefreshCw className="h-3 w-3 inline mr-1" />
                            Last sync: {new Date(syncStatus.lastSyncAt).toLocaleDateString()}
                          </span>
                        )}

                        {/* Unmatched warning */}
                        {unmatchedCount > 0 && (
                          <span className="text-amber-500 dark:text-amber-400 font-medium">
                            ⚠ {unmatchedCount} series need matching
                          </span>
                        )}

                        {/* Sync in progress from autoMatchAll */}
                        {autoMatchAll.isPending && (
                          <span className="text-amber-500 dark:text-amber-400">
                            <RefreshCw className="h-3 w-3 inline mr-1 animate-spin" />
                            Auto-matching in progress...
                          </span>
                        )}
                      </div>
                    )}

                    {/* Connect form (only when disconnected) */}
                    {!config.isConnected && (
                      <div className="flex items-start justify-end">
                        {config.supportsDirectAuth ? (
                          config.provider === ScrobblerProvider.Kitsu ? (
                            <div className="flex items-center gap-2 w-full">
                              <div className="flex flex-1 flex-wrap items-center gap-2">
                                <Input
                                  type="email"
                                  placeholder="Email"
                                  value={kitsuEmail}
                                  onChange={(e) => setKitsuEmail(e.target.value)}
                                  className="h-8 flex-1 min-w-[120px] text-xs"
                                />
                                <Input
                                  type="password"
                                  placeholder="Password"
                                  value={kitsuPassword}
                                  onChange={(e) => setKitsuPassword(e.target.value)}
                                  className="h-8 flex-1 min-w-[120px] text-xs"
                                />
                              </div>
                              <Button
                                variant="default"
                                size="sm"
                                onClick={handleKitsuConnect}
                                disabled={isConnecting || !kitsuEmail.trim() || !kitsuPassword.trim()}
                              >
                                <Link className="h-4 w-4 mr-1" />
                                {isConnecting ? 'Connecting...' : 'Connect'}
                              </Button>
                            </div>
                          ) : config.provider === ScrobblerProvider.MangaDex ? (
                            <div className="flex items-center gap-2 w-full">
                              <div className="flex flex-1 flex-wrap items-center gap-2">
                                <Input
                                  type="text"
                                  placeholder="Username"
                                  value={mdUsername}
                                  onChange={(e) => setMdUsername(e.target.value)}
                                  className="h-8 flex-1 min-w-[100px] text-xs"
                                />
                                <Input
                                  type="password"
                                  placeholder="Password"
                                  value={mdPassword}
                                  onChange={(e) => setMdPassword(e.target.value)}
                                  className="h-8 flex-1 min-w-[100px] text-xs"
                                />
                                <Input
                                  type="text"
                                  placeholder="Client ID"
                                  value={mdClientId}
                                  onChange={(e) => setMdClientId(e.target.value)}
                                  className="h-8 flex-1 min-w-[100px] text-xs"
                                />
                                <Input
                                  type="password"
                                  placeholder="Client Secret"
                                  value={mdClientSecret}
                                  onChange={(e) => setMdClientSecret(e.target.value)}
                                  className="h-8 flex-1 min-w-[100px] text-xs"
                                />
                              </div>
                              <Button
                                variant="default"
                                size="sm"
                                onClick={handleMangaDexConnect}
                                disabled={isConnecting || !mdUsername.trim() || !mdPassword.trim() || !mdClientId.trim() || !mdClientSecret.trim()}
                              >
                                <Link className="h-4 w-4 mr-1" />
                                {isConnecting ? 'Connecting...' : 'Connect'}
                              </Button>
                            </div>
                          ) : null
                        ) : config.provider === ScrobblerProvider.ComicVine ? (
                          <div className="flex items-center gap-2 w-full">
                            <Input
                              type="password"
                              placeholder="Enter ComicVine API key"
                              value={comicVineApiKey}
                              onChange={(e) => setComicVineApiKey(e.target.value)}
                              className="h-8 flex-1 text-xs"
                            />
                            <Button
                              variant="default"
                              size="sm"
                              onClick={handleSaveComicVine}
                              disabled={isConnecting || !comicVineApiKey.trim()}
                            >
                              <Key className="h-4 w-4 mr-1" />
                              {isConnecting ? 'Saving...' : 'Save Key'}
                            </Button>
                          </div>
                        ) : (
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => handleConnectOAuth(config)}
                            disabled={isConnecting || authorize.isPending}
                          >
                            <Link className="h-4 w-4 mr-1" />
                            {isConnecting ? 'Connecting...' : 'Connect'}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Series Mappings Dialog */}
      {selectedMappingsProvider !== null && (
        <SeriesMappingRequester
          open={true}
          onOpenChange={(open: boolean) => {
            if (!open) setSelectedMappingsProvider(null);
          }}
          provider={selectedMappingsProvider}
        />
      )}
    </>
  );
}