"use client";

import React, { useState, useCallback, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useScrobblerConfigs, useUpdateScrobblerConfig, useScrobblerAuthorize, useScrobblerCallback, useScrobblerDisconnect, useTriggerSync, useSaveComicVineApiKey, useKitsuDirectAuth, useMangaDexDirectAuth, useMetadataLinkAll } from '@/lib/api/hooks/useScrobbler';
import { useScrobblerUnmatched, useAutoMatchAll } from '@/lib/api/hooks/useScrobbler';
import { ScrobblerProvider, ProviderFeatures, SeriesMappingStatus, type ScrobblerConfig, type ScrobblerConfigUpdate } from '@/lib/api/types';
import { SeriesMatchDialog } from '@/components/comp/scrobbler/series-match-dialog';
import { RefreshCw, Link, Link2Off, ExternalLink, Key } from 'lucide-react';
import { apiClient } from '@/lib/api/client';
import { getProgressHub } from '@/lib/api/signalr/progressHub';
import { JobType, ProgressStatus } from '@/lib/api/types';

const providerIcons: Record<ScrobblerProvider, string> = {
  [ScrobblerProvider.MyAnimeList]: 'MAL',
  [ScrobblerProvider.AniList]: 'AL',
  [ScrobblerProvider.ComicVine]: 'CV',
  [ScrobblerProvider.Kitsu]: 'KT',
  [ScrobblerProvider.MangaDex]: 'MD',
  [ScrobblerProvider.MangaBaka]: 'MB',
  [ScrobblerProvider.Bangumi]: 'BG',
  [ScrobblerProvider.MangaUpdates]: 'MU',
};

/**
 * A public metadata-only provider needs no credentials: Features has Metadata set,
 * Scrobbling unset, and no direct auth / OAuth flow. Drives the UI to show it as
 * "Ready" (no Connect step) while still letting the user enable it.
 * Falls back to provider id when the features flag is not (yet) present on the payload,
 * so the UI can never regress into showing a Connect flow for these providers.
 */
function isPublicMetadataProvider(config: ScrobblerConfig): boolean {
  const features = config.features ?? 0;
  const hasMetadata = (features & ProviderFeatures.Metadata) === Number(ProviderFeatures.Metadata);
  const hasScrobbling = (features & ProviderFeatures.Scrobbling) === Number(ProviderFeatures.Scrobbling);

  // Explicit provider-id fallback: the three public metadata APIs (plus no-auth gate).
  const isPublicMetadataId =
    config.provider === ScrobblerProvider.MangaBaka ||
    config.provider === ScrobblerProvider.Bangumi ||
    config.provider === ScrobblerProvider.MangaUpdates;

  // ComicVine is metadata-only but requires an API key → not "public".
  const isComicVine = config.provider === ScrobblerProvider.ComicVine;

  return isPublicMetadataId || (hasMetadata && !hasScrobbling && !config.supportsDirectAuth && !isComicVine);
}

export function ScrobblerSettings() {
  const queryClient = useQueryClient();
  const { data: configs, isLoading: configsLoading } = useScrobblerConfigs();
  const { data: unmatched } = useScrobblerUnmatched();
  const updateConfig = useUpdateScrobblerConfig();
  const authorize = useScrobblerAuthorize();
  const callback = useScrobblerCallback();
  const disconnect = useScrobblerDisconnect();
  const triggerSync = useTriggerSync();
  const autoMatchAll = useAutoMatchAll();
  const [linkProgress, setLinkProgress] = useState<string | null>(null);

  // Live metadata-link progress from ProgressHub (jobType = MetadataLink).
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    const listen = async () => {
      try {
        await getProgressHub().startConnection();
        unsubscribe = getProgressHub().onProgress((p) => {
          if (p.jobType !== JobType.MetadataLink) return;
          if (p.progressStatus === ProgressStatus.Started || p.progressStatus === ProgressStatus.InProgress) {
            setLinkProgress(p.message || `Linking… ${p.percentage ?? 0}%`);
          } else if (p.progressStatus === ProgressStatus.Completed) {
            setLinkProgress(p.message || 'Link complete');
            void queryClient.invalidateQueries({ queryKey: ['scrobbler', 'configs'] });
            void queryClient.invalidateQueries({ queryKey: ['scrobbler', 'matches'] });
          } else if (p.progressStatus === ProgressStatus.Failed) {
            setLinkProgress(p.errorMessage?.length ? p.errorMessage : 'Link failed');
          }
        });
      } catch {
        // SignalR unavailable — link runs anyway; header button still shows final summary.
      }
    };
    void listen();
    return () => { unsubscribe?.(); };
  }, [queryClient]);

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
  const metadataLinkAll = useMetadataLinkAll();
  const linkSeries = useCallback(() => {
    // Fire-and-forget: run the link engine in the background (ProgressHub reports live progress).
    setLinkProgress('Linking…');
    void metadataLinkAll.mutateAsync().then((data) => {
      setLinkProgress(
        `Linked ${data?.linkedProviderEntries ?? 0} entries across ${data?.processedSeries ?? 0} series` +
        (data?.suggestedEntries ? ` · ${data.suggestedEntries} suggestions` : ''));
    }).catch(() => setLinkProgress('Link failed — check server logs'));
  }, [metadataLinkAll]);

  const handleToggleEnabled = useCallback((config: ScrobblerConfig) => {
    const update: ScrobblerConfigUpdate = { isEnabled: !config.isEnabled };
    updateConfig.mutate({ provider: config.provider, update });
    // Public metadata providers have no Connect step — enabling them should immediately
    // link series to the metadata services (no chapter/issue tracking supported).
    if (!config.isEnabled && isPublicMetadataProvider(config)) {
      metadataLinkAll.mutate();
    }
  }, [updateConfig, metadataLinkAll]);

  const handleToggleAutoSync = useCallback((config: ScrobblerConfig) => {
    const update: ScrobblerConfigUpdate = { autoSync: !config.autoSync };
    updateConfig.mutate({ provider: config.provider, update });
  }, [updateConfig]);

  const handleConnect = useCallback(async (config: ScrobblerConfig) => {
    console.log('[Scrobbler] handleConnect called for provider:', config.provider);
    try {
      // Public metadata providers (MangaBaka/Bangumi/MangaUpdates) never authorize via OAuth:
      // enable the config + link series via the metadata link engine, skip the proxy entirely.
      if (isPublicMetadataProvider(config)) {
        await updateConfig.mutateAsync({ provider: config.provider, update: { isEnabled: true } });
        await queryClient.invalidateQueries({ queryKey: ['scrobbler', 'configs'] });
        linkSeries();
        return;
      }

      const providerName = ScrobblerProvider[config.provider];
      console.log('[Scrobbler] providerName resolved:', providerName);
      const result = await authorize.mutateAsync(providerName);

      // Backend backstop: a provider that reports noAuthRequired needs no OAuth either.
      if (result.noAuthRequired || !result.authUrl) {
        await updateConfig.mutateAsync({ provider: config.provider, update: { isEnabled: true } });
        await metadataLinkAll.mutateAsync();
        await queryClient.invalidateQueries({ queryKey: ['scrobbler', 'configs'] });
        return;
      }
      console.log('[Scrobbler] authorize result:', result);

      // Open OAuth popup — opens on the proxy domain (HTTPS)
      const popup = window.open(result.authUrl, 'oauth-popup', 'width=600,height=700');
      console.log('[Scrobbler] popup opened:', !!popup);

      // We already have the state from the authorize response.
      // Start polling the backend callback immediately — the proxy will store
      // the tokens after the user completes the OAuth flow in the popup,
      // and the backend will retrieve them from the proxy.
      // GET /api/externalprovider/callback/{provider}?state={state}
      const callbackUrl = `/api/externalprovider/callback/${providerName}?state=${result.state}`;
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
        // Invalidate configs so the UI shows the provider as connected
        await queryClient.invalidateQueries({ queryKey: ['scrobbler', 'configs'] });
        // Auto-match and sync after connect — same pattern as user-tracker-requester
        await autoMatchAll.mutateAsync(config.provider);
        await triggerSync.mutateAsync();
      } else {
        console.log('[Scrobbler] failed to connect after 60 attempts');
      }
    } catch (err) {
      console.error('[Scrobbler] OAuth authorization failed:', err);
    }
  }, [authorize, autoMatchAll, triggerSync, queryClient]);

  const handleDisconnect = useCallback((config: ScrobblerConfig) => {
    // Public metadata providers have no token to revoke — "Disconnect" disables the config.
    if (isPublicMetadataProvider(config)) {
      updateConfig.mutate({ provider: config.provider, update: { isEnabled: false } });
      return;
    }
    const providerName = ScrobblerProvider[config.provider];
    disconnect.mutate(providerName);
  }, [disconnect, updateConfig]);

  const handleSaveComicVineKey = useCallback(async () => {
    if (!comicVineApiKey.trim()) return;
    await saveComicVineKey.mutateAsync(comicVineApiKey);
    setComicVineApiKey('');
  }, [comicVineApiKey, saveComicVineKey]);

  // DIAGNOSTIC: verify component renders
  console.log('[ScrobblerSettings] rendering, configs:', configsLoading ? 'loading' : configs?.length + ' items');

  if (configsLoading) {
    return <div role="status" className="p-4 text-sm text-ink-3">Loading scrobbler settings...</div>;
  }

  const unmatchedCount = unmatched?.filter(u => u.mappingStatus === SeriesMappingStatus.Unmatched).length ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b-[3px] border-double border-rule-3 pb-4">
        <div>
          <p className="paper-eyebrow mb-1">Trackers</p>
          <h2 className="font-serif text-[28px] leading-tight tracking-[-0.02em] text-ink">Scrobbler / <em className="italic text-accent-ink">Tracking</em></h2>
          <p className="text-sm text-ink-2">
            Connect your reading progress to external tracking services
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            className="max-sm:min-h-11"
            onClick={linkSeries}
            disabled={metadataLinkAll.isPending}
          >
            <Link className={`h-4 w-4 mr-2 ${metadataLinkAll.isPending ? 'animate-pulse' : ''}`} />
            {metadataLinkAll.isPending ? 'Linking…' : 'Link Series (Metadata)'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="max-sm:min-h-11"
            onClick={() => triggerSync.mutate()}
            disabled={triggerSync.isPending}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${triggerSync.isPending ? 'animate-spin' : ''}`} />
            Sync All
          </Button>
        </div>
      </div>

      {linkProgress && (
        <p className="text-xs text-ink-3">{linkProgress}</p>
      )}

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
                      {(config.isConnected || (isPublicMetadataProvider(config) && config.isEnabled)) ? (
                        <Badge variant="default" className="mt-1">Connected</Badge>
                      ) : isPublicMetadataProvider(config) ? (
                        <Badge variant="outline" className="mt-1">Ready · Public metadata</Badge>
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
                      disabled={!config.isConnected && !isPublicMetadataProvider(config)}
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
                  {(config.isConnected || (isPublicMetadataProvider(config) && config.isEnabled)) ? (
                    <>
                      {config.lastSyncAt && (
                        <span className="text-xs text-ink-3">
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
                  ) : isPublicMetadataProvider(config) ? (
                    <span className="text-xs text-ink-3">
                      No credentials required
                    </span>
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
                          className="text-xs text-accent-ink underline-offset-2 hover:underline"
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
            <h3 className="font-serif text-xl text-ink">Unmatched Series</h3>
            <p className="text-sm text-ink-2">
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
                    autoMatchAll.mutate(p);
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
                  {unmatched.filter(s => s.mappingStatus !== SeriesMappingStatus.UserConfirmed).slice(0, 20).map((status) => (
                    <tr key={`${status.seriesId}-${status.provider}`} className="border-b last:border-0">
                      <td className="py-2">{status.seriesTitle}</td>
                      <td className="py-2">{ScrobblerProvider[status.provider]}</td>
                      <td className="py-2">
                        {status.mappingStatus === SeriesMappingStatus.Unmatched && (
                          <Badge variant="secondary">Not matched</Badge>
                        )}
                        {status.mappingStatus === SeriesMappingStatus.AutoMatched && (
                          <Badge variant="default">Auto-matched ({Math.round((status.matchScore ?? 0) * 100)}%)</Badge>
                        )}
                        {status.mappingStatus === SeriesMappingStatus.TemporaryIgnored && (
                          <Badge variant="secondary">Temp. ignored</Badge>
                        )}
                        {status.mappingStatus === SeriesMappingStatus.ForeverIgnored && (
                          <Badge variant="secondary">Disabled</Badge>
                        )}
                        {status.mappingStatus === SeriesMappingStatus.Blocked && (
                          <Badge variant="secondary">Blocked</Badge>
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