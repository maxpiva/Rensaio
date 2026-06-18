import { apiClient } from '@/lib/api/client';
import { type Settings } from '@/lib/api/types';

export interface SettingsUpdateResponse {
  message: string;
  setPasswordUrl?: string;
}

export const settingsService = {
  async getSettings(): Promise<Settings> {
    const data = await apiClient.get<Settings>('/api/settings');
    return {
      ...data,
    };
  },

  async getAvailableLanguages(): Promise<string[]> {
    return apiClient.get<string[]>('/api/settings/languages');
  },

  async updateSettings(settings: Settings): Promise<SettingsUpdateResponse> {
    const settingsPayload = {
      ...settings
    };

    return apiClient.put<SettingsUpdateResponse>('/api/settings', settingsPayload);
  },
};
