"use client";

import React, { useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useScrobblerConfigs, useUpdateScrobblerConfig, useScrobblerAuthorize, useScrobblerCallback, useScrobblerDisconnect, useTriggerSync, useSyncStatus, useSaveComicVineApiKey, useKitsuDirectAuth, useMangaDexDirectAuth } from '@/lib/api/hooks/useScrobbler';
import { useScrobblerUnmatched, useAutoMatchAll, useConfirmMatch, useDisableLink } from '@/lib/api/hooks/useScrobbler';
import { ScrobblerProvider, type ScrobblerConfig, type OAuthCallbackRequest, type ScrobblerConfigUpdate } from '@/lib/api/types';
import { SeriesMatchDialog } from '@/components/kzk/scrobbler/series-match-dialog';
import { RefreshCw, Link, Link2Off, ExternalLink, Key } from 'lucide-react';
import { apiClient } from '@/lib/api/client';

const providerIcons: Record<ScrobblerProvider, string> = {
  [ScrobblerProvider.MyAnimeList]: 'MAL',
  [ScrobblerProvider.AniList]: 'AL',
  [ScrobblerProvider.ComicVine]: 'CV',
  [ScrobblerProvider.Kitsu]: 'KT',
  [ScrobblerProvider.MangaDex]: 'MD',
};

export function ScrobblerSettings() {
  const { data: configs, isLoading: configsLoading } = useScrobblerConfigs();
  const { data: unmatched } = useScrobblerUnmatched();
  const updateConfig = useUpdateScrobblerConfig();
  const authorize = useScrobblerAuthorize();
  const callback = useScrobblerCallback();
  const disconnect = useScrobblerDisconnect();
  const triggerSync = useTriggerSync();
  const autoMatchAll = useAutoMatchAll();

  const kitsuAuth = useKitsuDirectAuth();
  const mangaDexAuth = useMangaDexDirectAuth();

  const [selectedSeries, setSelectedSeries] = useState<{ seriesId: string; provider: ScrobblerProvider } | null>(null);
  const [comicVineApiKey, setComicVineApiKey] = useState('');
  const [kitsuEmail, setKitsuEmail] = useState('');
  const [kitsuPassword, setKitsuPassword] = useState('');
  const [mdUsername, setMdUsername] = useState('');
  const [mdPassword, setMdPassword] = useState('');
  const [mdClientId, setMdClientId] = useState('');
  const [mdClientSecret, setMdClientSecret] = useState('');
  const saveComicVineKey = useSaveComicVineApiKey();

  const handleToggleEnabled = useCallback((config: ScrobblerConfig) => {
    const update: ScrobblerConfigUpdate = { isEnabled: !config.isEnabled };
    updateConfig.mutate({ provider: config.provider, update });
  }, [updateConfig]);

  const handleToggleAutoSync = useCallback((config: ScrobblerConfig) => {
    const update: ScrobblerConfigUpdate = { autoSync: !config.autoSync };
    updateConfig.mutate({ provider: config.provider, update });
  }, [updateConfig]);

  const handleConnect = useCallback(async (config: ScrobblerConfig) => {
    console.log('[Scrobbler] handleConnect called for provider:', config.provider);
    try {
      const providerName = ScrobblerProvider[config.provider];
      console.log('[Scrobbler] providerName resolved:', providerName);
      const result = await authorize.mutateAsync(providerName);
      console.log('[Scrobbler] authorize result:', result);

      // Open OAuth popup — opens on the proxy domain (HTTPS)
      const popup = window.open(result.authUrl, 'oauth-popup', 'width=600,height=700');
      console.log('[Scrobbler] popup opened:', !!popup);

      // We already have the state from the authorize response.
      // Start polling the backend callback immediately — the proxy will store
      // the tokens after the user completes the OAuth flow in the popup,
      // and the backend will retrieve them from the proxy.
      // GET /api/scrobbler/callback/{provider}?state={state}
      const callbackUrl = `/api/scrobbler/callback/${providerName}?state=${result.state}`;
      console.log('[Scrobbler] starting poll for:', callbackUrl);

      let connected = false;
      let attempts = 0;
      while (!connected && attempts < 60) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        attempts++;
        console.log(`[Scrobbler] poll attempt ${attempts}`);
        try {
          const response = await apiClient.get<{ connected: boolean }>(callbackUrl);
          console.log('[Scrobbler] poll success:', response);
          connected = true;
        } catch (err) {
          console.log(`[Scrobbler] poll attempt ${attempts} failed:`, err);
        }
      }

      popup?.close();

      if (connected) {
        // Auto-match and sync after connect — same pattern as user-tracker-requester
        // These mutations handle React Query cache invalidation in their onSuccess handlers
        await autoMatchAll.mutateAsync(config.provider);
        await triggerSync.mutateAsync();
      } else {
        console.log('[Scrobbler] failed to connect after 60 attempts');
      }
    } catch (err) {
      console.error('[Scrobbler] OAuth authorization failed:', err);
    }
  }, [authorize, autoMatchAll, triggerSync]);

  const handleDisconnect = useCallback((config: ScrobblerConfig) => {
    const providerName = ScrobblerProvider[config.provider];
    disconnect.mutate(providerName);
  }, [disconnect]);

  const handleSaveComicVineKey = useCallback(async () => {
    if (!comicVineApiKey.trim()) return;
    await saveComicVineKey.mutateAsync(comicVineApiKey);
    setComicVineApiKey('');
  }, [comicVineApiKey, saveComicVineKey]);

  // DIAGNOSTIC: verify component renders
  console.log('[ScrobblerSettings] rendering, configs:', configsLoading ? 'loading' : configs?.length + ' items');

  if (configsLoading) {
    return <div className="p-4 text-muted-foreground">Loading scrobbler settings...</div>;
  }

  const unmatchedCount = unmatched?.filter(u => u.mappingStatus === 0).length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Scrobbler / Tracking</h2>
          <p className="text-sm text-muted-foreground">
            Connect your reading progress to external tracking services
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => triggerSync.mutate()}
            disabled={triggerSync.isPending}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${triggerSync.isPending ? 'animate-spin' : ''}`} />
            Sync All
          </Button>
        </div>
      </div>

      <Separator />

      {/* Provider Cards */}
      <div className="grid gap-4">
        {configs?.map((config) => (
          <Card key={config.provider} className="overflow-hidden">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
                    {providerIcons[config.provider]}
                  </div>
                  <div>
                    <CardTitle className="text-lg">{config.displayName}</CardTitle>
                    <CardDescription>
                      {config.isConnected ? (
                        <Badge variant="default" className="mt-1">Connected</Badge>
                      ) : (
                        <Badge variant="secondary" className="mt-1">Disconnected</Badge>
                      )}
                    </CardDescription>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-6">
                  {/* Enabled toggle */}
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={config.isEnabled}
                      onCheckedChange={() => handleToggleEnabled(config)}
                      disabled={!config.isConnected}
                    />
                    <span className="text-sm">Enabled</span>
                  </div>

                  {/* Auto-sync toggle */}
                  {config.isConnected && (
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={config.autoSync}
                        onCheckedChange={() => handleToggleAutoSync(config)}
                      />
                      <span className="text-sm">Auto Sync</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {config.isConnected ? (
                    <>
                      {config.lastSyncAt && (
                        <span className="text-xs text-muted-foreground">
                          Last sync: {new Date(config.lastSyncAt).toLocaleDateString()}
                        </span>
                      )}
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDisconnect(config)}
                      >
                        <Link2Off className="h-4 w-4 mr-1" />
                        Disconnect
                      </Button>
                    </>
                  ) : config.supportsDirectAuth ? (
                    config.provider === ScrobblerProvider.Kitsu ? (
                      <div className="flex items-center gap-2">
                        <Input
                          type="email"
                          placeholder="Email"
                          value={kitsuEmail}
                          onChange={(e) => setKitsuEmail(e.target.value)}
                          className="h-8 w-40 text-xs"
                        />
                        <Input
                          type="password"
                          placeholder="Password"
                          value={kitsuPassword}
                          onChange={(e) => setKitsuPassword(e.target.value)}
                          className="h-8 w-40 text-xs"
                        />
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => {
                            kitsuAuth.mutate({ email: kitsuEmail, password: kitsuPassword });
                          }}
                          disabled={kitsuAuth.isPending || !kitsuEmail.trim() || !kitsuPassword.trim()}
                        >
                          <Link className="h-4 w-4 mr-1" />
                          {kitsuAuth.isPending ? 'Connecting...' : 'Connect'}
                        </Button>
                      </div>
                    ) : config.provider === ScrobblerProvider.MangaDex ? (
                      <div className="flex flex-col gap-2 items-end">
                        <a
                          href="https://mangadex.org/settings"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-500 hover:underline"
                        >
                          Create personal API client on MangaDex
                        </a>
                        <div className="flex items-center gap-2">
                          <Input
                            type="text"
                            placeholder="Username"
                            value={mdUsername}
                            onChange={(e) => setMdUsername(e.target.value)}
                            className="h-8 w-28 text-xs"
                          />
                          <Input
                            type="password"
                            placeholder="Password"
                            value={mdPassword}
                            onChange={(e) => setMdPassword(e.target.value)}
                            className="h-8 w-28 text-xs"
                          />
                          <Input
                            type="text"
                            placeholder="Client ID"
                            value={mdClientId}
                            onChange={(e) => setMdClientId(e.target.value)}
                            className="h-8 w-28 text-xs"
                          />
                          <Input
                            type="password"
                            placeholder="Client Secret"
                            value={mdClientSecret}
                            onChange={(e) => setMdClientSecret(e.target.value)}
                            className="h-8 w-28 text-xs"
                          />
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => {
                              mangaDexAuth.mutate({
                                username: mdUsername,
                                password: mdPassword,
                                clientId: mdClientId,
                                clientSecret: mdClientSecret,
                              });
                            }}
                            disabled={mangaDexAuth.isPending || !mdUsername.trim() || !mdPassword.trim() || !mdClientId.trim() || !mdClientSecret.trim()}
                          >
                            <Link className="h-4 w-4 mr-1" />
                            {mangaDexAuth.isPending ? 'Connecting...' : 'Connect'}
                          </Button>
                        </div>
                      </div>
                    ) : null
                  ) : config.provider === ScrobblerProvider.ComicVine ? (
                    <div className="flex items-center gap-2">
                      <Input
                        type="password"
                        placeholder="Enter ComicVine API key"
                        value={comicVineApiKey}
                        onChange={(e) => setComicVineApiKey(e.target.value)}
                        className="h-8 w-48 text-xs"
                      />
                      <Button
                        variant="default"
                        size="sm"
                        onClick={handleSaveComicVineKey}
                        disabled={saveComicVineKey.isPending || !comicVineApiKey.trim()}
                      >
                        <Key className="h-4 w-4 mr-1" />
                        Save Key
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => handleConnect(config)}
                      disabled={authorize.isPending}
                    >
                      <Link className="h-4 w-4 mr-1" />
                      Connect
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Separator />

      {/* Unmatched Series Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">Unmatched Series</h3>
            <p className="text-sm text-muted-foreground">
              {unmatchedCount > 0
                ? `${unmatchedCount} series need manual matching`
                : 'All series are matched'}
            </p>
          </div>
          {unmatchedCount > 0 && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  // Auto-match across all providers
                  Object.values(ScrobblerProvider).filter(v => typeof v === 'number').forEach(p => {
                    autoMatchAll.mutate(p as ScrobblerProvider);
                  });
                }}
                disabled={autoMatchAll.isPending}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${autoMatchAll.isPending ? 'animate-spin' : ''}`} />
                Auto-Match All
              </Button>
            </div>
          )}
        </div>

        {unmatched && unmatched.length > 0 && (
          <div className="rounded-md border">
            <div className="p-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 font-medium">Series</th>
                    <th className="pb-2 font-medium">Provider</th>
                    <th className="pb-2 font-medium">Status</th>
                    <th className="pb-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {unmatched.filter(s => s.mappingStatus !== 2).slice(0, 20).map((status) => (
                    <tr key={`${status.seriesId}-${status.provider}`} className="border-b last:border-0">
                      <td className="py-2">{status.seriesTitle}</td>
                      <td className="py-2">{ScrobblerProvider[status.provider]}</td>
                      <td className="py-2">
                        {status.mappingStatus === 0 && (
                          <Badge variant="secondary">Not matched</Badge>
                        )}
                        {status.mappingStatus === 1 && (
                          <Badge variant="default">Auto-matched ({Math.round((status.matchScore ?? 0) * 100)}%)</Badge>
                        )}
                        {status.mappingStatus === 3 && (
                          <Badge variant="secondary">Disabled</Badge>
                        )}
                      </td>
                      <td className="py-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedSeries({ seriesId: status.seriesId, provider: status.provider })}
                        >
                          <ExternalLink className="h-4 w-4 mr-1" />
                          Match
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Series Match Dialog */}
      {selectedSeries && (
        <SeriesMatchDialog
          seriesId={selectedSeries.seriesId}
          provider={selectedSeries.provider}
          open={true}
          onOpenChange={(open: boolean) => {
            if (!open) setSelectedSeries(null);
          }}
        />
      )}
    </div>
  );
}