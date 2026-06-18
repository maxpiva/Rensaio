import { apiClient } from '@/lib/api/client';
import {
  type ScrobblerConfig,
  type ScrobblerConfigUpdate,
  type OAuthAuthorizeResponse,
  type OAuthCallbackRequest,
  type SeriesMatchStatus,
  type SeriesMatchSearchRequest,
  type AutoMatchResult,
  type ConfirmMatchRequest,
  type DisableLinkRequest,
  type SyncStatus,
  type ScrobblerProvider,
  type KitsuDirectAuthRequest,
  type MangaDexDirectAuthRequest,
} from '@/lib/api/types';

export const scrobblerService = {
  // ── Providers ──

  async getProviders(): Promise<ScrobblerConfig[]> {
    return apiClient.get<ScrobblerConfig[]>('/api/scrobbler/providers');
  },

  // ── Config ──

  async getConfigs(): Promise<ScrobblerConfig[]> {
    return apiClient.get<ScrobblerConfig[]>('/api/scrobbler/config');
  },

  async updateConfig(provider: ScrobblerProvider, update: ScrobblerConfigUpdate): Promise<void> {
    const params = new URLSearchParams({ provider: provider.toString() });
    return apiClient.put<void>(`/api/scrobbler/config?${params.toString()}`, update);
  },

  // ── OAuth ──

  async authorize(provider: string): Promise<OAuthAuthorizeResponse> {
    return apiClient.post<OAuthAuthorizeResponse>(`/api/scrobbler/config/${provider}/authorize`);
  },

  async callback(provider: string, request: OAuthCallbackRequest): Promise<{ connected: boolean }> {
    return apiClient.post<{ connected: boolean }>(`/api/scrobbler/config/${provider}/callback`, request);
  },

  async disconnect(provider: string): Promise<void> {
    return apiClient.delete<void>(`/api/scrobbler/config/${provider}`);
  },

  // ── Direct Auth (Kitsu, MangaDex) ──

  async kitsuDirectAuth(request: KitsuDirectAuthRequest): Promise<{ connected: boolean }> {
    return apiClient.post<{ connected: boolean }>('/api/scrobbler/config/kitsu/direct', request);
  },

  async mangaDexDirectAuth(request: MangaDexDirectAuthRequest): Promise<{ connected: boolean }> {
    return apiClient.post<{ connected: boolean }>('/api/scrobbler/config/mangadex/direct', request);
  },

  // ── Matching ──

  async getMatches(): Promise<SeriesMatchStatus[]> {
    return apiClient.get<SeriesMatchStatus[]>('/api/scrobbler/matches');
  },

  async getUnmatched(): Promise<SeriesMatchStatus[]> {
    return apiClient.get<SeriesMatchStatus[]>('/api/scrobbler/matches/unmatched');
  },

  async searchExternal(request: SeriesMatchSearchRequest): Promise<{ provider: ScrobblerProvider; results: import('@/lib/api/types').ScrobblerSearchResult[] }> {
    return apiClient.post('/api/scrobbler/matches/search', request);
  },

  async autoMatchAll(provider: ScrobblerProvider): Promise<AutoMatchResult> {
    const params = new URLSearchParams({ provider: provider.toString() });
    return apiClient.post<AutoMatchResult>(`/api/scrobbler/matches/auto?${params.toString()}`);
  },

  async autoMatchSeries(seriesId: string): Promise<void> {
    return apiClient.post<void>(`/api/scrobbler/matches/auto/${seriesId}`);
  },

  async confirmMatch(request: ConfirmMatchRequest): Promise<void> {
    return apiClient.post<void>('/api/scrobbler/matches/confirm', request);
  },

  async disableLink(request: DisableLinkRequest): Promise<void> {
    return apiClient.post<void>('/api/scrobbler/matches/disable', request);
  },

  async removeMapping(seriesId: string, provider: ScrobblerProvider): Promise<void> {
    return apiClient.delete<void>(`/api/scrobbler/matches/${seriesId}/${provider}`);
  },

  // ── API Key (ComicVine) ──

  async saveComicVineApiKey(apiKey: string): Promise<void> {
    return apiClient.post<void>('/api/scrobbler/config/comicvine/apikey', { apiKey });
  },

  // ── Sync ──

  async triggerSync(): Promise<void> {
    return apiClient.post<void>('/api/scrobbler/sync');
  },

  async getSyncStatus(): Promise<SyncStatus[]> {
    return apiClient.get<SyncStatus[]>('/api/scrobbler/sync/status');
  },
};