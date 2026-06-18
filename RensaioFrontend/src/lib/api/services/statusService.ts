import { apiClient } from '@/lib/api/client';
import type { SeriesHealth, ProviderHealth, StatusSummary, ClearAlertRequest } from '@/lib/api/types';

export const statusService = {
  async getSeriesStatus(): Promise<SeriesHealth[]> {
    return apiClient.get<SeriesHealth[]>('/api/status/series');
  },

  async getProviderStatus(): Promise<ProviderHealth[]> {
    return apiClient.get<ProviderHealth[]>('/api/status/providers');
  },

  async getStatusSummary(): Promise<StatusSummary> {
    return apiClient.get<StatusSummary>('/api/status/summary');
  },

  async clearAlert(request: ClearAlertRequest): Promise<void> {
    return apiClient.post<void>('/api/status/clear', request);
  },
};