"use client";

import React, { useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useScrobblerConfigs, useUpdateScrobblerConfig, useScrobblerAuthorize, useScrobblerCallback, useScrobblerDisconnect, useTriggerSync, useSyncStatus, useSaveComicVineApiKey } from '@/lib/api/hooks/useScrobbler';
import { useScrobblerUnmatched, useAutoMatchAll, useConfirmMatch, useDisableLink } from '@/lib/api/hooks/useScrobbler';
import { ScrobblerProvider, type ScrobblerConfig, type OAuthCallbackRequest, type ScrobblerConfigUpdate } from '@/lib/api/types';
import { SeriesMatchDialog } from '@/components/kzk/scrobbler/series-match-dialog';
import { RefreshCw, Link, Link2Off, ExternalLink, Key } from 'lucide-react';

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

  const [selectedSeries, setSelectedSeries] = useState<{ seriesId: string; provider: ScrobblerProvider } | null>(null);
  const [comicVineApiKey, setComicVineApiKey] = useState('');
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
    try {
      const providerName = ScrobblerProvider[config.provider];
      const result = await authorize.mutateAsync(providerName);

      // Open OAuth popup — opens on the proxy domain (HTTPS)
      const popup = window.open(result.authUrl, 'oauth-popup', 'width=600,height=700');

      // Listen for postMessage from proxy's success page (no HTTPS→HTTP redirect)
      const handleMessage = async (event: MessageEvent) => {
        if (event.data?.type === 'oauth-success' && event.data?.provider === providerName) {
          window.removeEventListener('message', handleMessage);
          popup?.close();

          // Tell Kaizoku backend to retrieve the tokens from the proxy (server-to-server)
          // GET /api/scrobbler/callback/{provider}?state={state}
          const callbackUrl = `/api/scrobbler/callback/${providerName}?state=${event.data.state}`;
          
          // Poll until the tokens are retrieved
          let connected = false;
          let attempts = 0;
          while (!connected && attempts < 30) {
            try {
              const response = await fetch(callbackUrl, { credentials: 'include' });
              if (response.ok) {
                connected = true;
              }
            } catch {
              // Backend may not have polled proxy yet
            }
            if (!connected) {
              await new Promise(resolve => setTimeout(resolve, 1000));
              attempts++;
            }
          }

          if (connected) {
            // Invalidate all scrobbler queries to refresh UI
            window.location.reload();
          }
        }
      };

      window.addEventListener('message', handleMessage);
    } catch (err) {
      console.error('OAuth authorization failed:', err);
    }
  }, [authorize]);

  const handleDisconnect = useCallback((config: ScrobblerConfig) => {
    const providerName = ScrobblerProvider[config.provider];
    disconnect.mutate(providerName);
  }, [disconnect]);

  const handleSaveComicVineKey = useCallback(async () => {
    if (!comicVineApiKey.trim()) return;
    await saveComicVineKey.mutateAsync(comicVineApiKey);
    setComicVineApiKey('');
  }, [comicVineApiKey, saveComicVineKey]);

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