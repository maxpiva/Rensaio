// NOTE: `Provider.isInstaled` is misspelled in the API type. Do NOT "fix" it here.
// The typo is the source of truth; renaming it would cascade across the codebase
// and is out of scope for this refactor.

import { getApiConfig } from "@/lib/api/config";
import { type Provider, type ExtensionEntry } from "@/lib/api/types";

export const formatThumbnailUrl = (thumbnailUrl?: string): string => {
  const config = getApiConfig();
  if (!thumbnailUrl) {
    return '/kaizoku.net.png';
  }
  // If it already starts with http, return as is
  if (thumbnailUrl.startsWith('http')) {
    return thumbnailUrl;
  }

  // Otherwise, prefix with base URL and API path
  return `${config.baseUrl}${thumbnailUrl}`;
};

export const getExtensionEntries = (extension: Provider): ExtensionEntry[] =>
  extension.onlineRepositories.flatMap((repo) => repo.entries);

export const getPrimaryEntry = (extension: Provider): ExtensionEntry | undefined => {
  const allEntries = getExtensionEntries(extension);
  if (allEntries.length === 0) return undefined;

  if (extension.isInstaled) {
    const localRepo = extension.onlineRepositories.find((repo) =>
      repo.entries.some((entry) => entry.isLocal)
    );
    if (localRepo) {
      const index = Math.min(
        Math.max(extension.activeEntry ?? 0, 0),
        localRepo.entries.length - 1
      );
      return localRepo.entries[index] ?? localRepo.entries[0];
    }
  }

  return allEntries[0];
};

export const getExtensionLanguages = (extension: Provider): string[] => {
  const langs = getExtensionEntries(extension)
    .flatMap((entry) => entry.sources.map((source) => source.lang))
    .filter(Boolean);
  return Array.from(new Set(langs));
};

export const getPrimaryLanguage = (extension: Provider): string =>
  getExtensionLanguages(extension)[0] ?? "all";

export const getExtensionVersion = (extension: Provider): string =>
  getPrimaryEntry(extension)?.version ?? "";

export const isExtensionNsfw = (extension: Provider): boolean =>
  getExtensionEntries(extension).some((entry) => entry.nsfw);
