import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { scrobblerService } from '@/lib/api/services/scrobblerService';
import {
  type ScrobblerConfig,
  type ScrobblerConfigUpdate,
  type OAuthCallbackRequest,
  type SeriesMatchSearchRequest,
  type AutoMatchResult,
  type ConfirmMatchRequest,
  type DisableLinkRequest,
  type ScrobblerProvider,
  type SeriesMatchStatus,
  type SyncStatus,
} from '@/lib/api/types';

export const useScrobblerProviders = () => {
  return useQuery({
    queryKey: ['scrobbler', 'providers'],
    queryFn: () => scrobblerService.getProviders(),
  });
};

export const useScrobblerConfigs = () => {
  return useQuery({
    queryKey: ['scrobbler', 'configs'],
    queryFn: () => scrobblerService.getConfigs(),
  });
};

export const useUpdateScrobblerConfig = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ provider, update }: { provider: ScrobblerProvider; update: ScrobblerConfigUpdate }) =>
      scrobblerService.updateConfig(provider, update),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scrobbler', 'configs'] });
      queryClient.invalidateQueries({ queryKey: ['scrobbler', 'providers'] });
    },
  });
};

export const useScrobblerAuthorize = () => {
  return useMutation({
    mutationFn: (provider: string) => scrobblerService.authorize(provider),
  });
};

export const useScrobblerCallback = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ provider, request }: { provider: string; request: OAuthCallbackRequest }) =>
      scrobblerService.callback(provider, request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scrobbler'] });
    },
  });
};

export const useScrobblerDisconnect = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (provider: string) => scrobblerService.disconnect(provider),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scrobbler'] });
    },
  });
};

export const useScrobblerMatches = () => {
  return useQuery({
    queryKey: ['scrobbler', 'matches'],
    queryFn: () => scrobblerService.getMatches(),
  });
};

export const useScrobblerUnmatched = () => {
  return useQuery({
    queryKey: ['scrobbler', 'unmatched'],
    queryFn: () => scrobblerService.getUnmatched(),
  });
};

export const useSearchExternal = () => {
  return useMutation({
    mutationFn: (request: SeriesMatchSearchRequest) => scrobblerService.searchExternal(request),
  });
};

export const useAutoMatchAll = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (provider: ScrobblerProvider) => scrobblerService.autoMatchAll(provider),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scrobbler', 'matches'] });
      queryClient.invalidateQueries({ queryKey: ['scrobbler', 'unmatched'] });
    },
  });
};

export const useAutoMatchSeries = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (seriesId: string) => scrobblerService.autoMatchSeries(seriesId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scrobbler', 'matches'] });
      queryClient.invalidateQueries({ queryKey: ['scrobbler', 'unmatched'] });
    },
  });
};

export const useConfirmMatch = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: ConfirmMatchRequest) => scrobblerService.confirmMatch(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scrobbler'] });
    },
  });
};

export const useDisableLink = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: DisableLinkRequest) => scrobblerService.disableLink(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scrobbler'] });
    },
  });
};

export const useRemoveMapping = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ seriesId, provider }: { seriesId: string; provider: ScrobblerProvider }) =>
      scrobblerService.removeMapping(seriesId, provider),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scrobbler'] });
    },
  });
};

export const useTriggerSync = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => scrobblerService.triggerSync(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scrobbler', 'sync'] });
    },
  });
};

export const useSyncStatus = () => {
  return useQuery({
    queryKey: ['scrobbler', 'sync'],
    queryFn: () => scrobblerService.getSyncStatus(),
  });
};

export const useSaveComicVineApiKey = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (apiKey: string) => scrobblerService.saveComicVineApiKey(apiKey),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scrobbler', 'configs'] });
      queryClient.invalidateQueries({ queryKey: ['scrobbler', 'providers'] });
    },
  });
};