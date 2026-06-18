import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { statusService } from '@/lib/api/services/statusService';
import type { SeriesHealth, ProviderHealth, StatusSummary, ClearAlertRequest } from '@/lib/api/types';

export const useSeriesStatus = () => {
  return useQuery<SeriesHealth[]>({
    queryKey: ['status', 'series'],
    queryFn: () => statusService.getSeriesStatus(),
    staleTime: 30 * 1000, // 30 seconds
    refetchOnWindowFocus: true,
  });
};

export const useProviderStatus = () => {
  return useQuery<ProviderHealth[]>({
    queryKey: ['status', 'providers'],
    queryFn: () => statusService.getProviderStatus(),
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
  });
};

export const useStatusSummary = () => {
  return useQuery<StatusSummary>({
    queryKey: ['status', 'summary'],
    queryFn: () => statusService.getStatusSummary(),
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
  });
};

export const useClearAlert = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: ClearAlertRequest) => statusService.clearAlert(request),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['status'] });
    },
  });
};