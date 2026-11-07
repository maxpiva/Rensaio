"use client";

import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useDebounce } from '@/lib/hooks/useDebounce';

type PageKey = 'library' | 'providers' | 'queue' | 'cloudLatest' | 'settings' | 'series' | 'other';

interface SearchContextType {
  /** The search term for the currently active page. */
  searchTerm: string;
  /** Debounced version of the current page's search term. */
  debouncedSearchTerm: string;
  setSearchTerm: (term: string) => void;
  clearSearch: () => void;
  currentPage: PageKey;
  isSearchDisabled: boolean;
}

const SearchContext = createContext<SearchContextType | undefined>(undefined);

/**
 * Maps a route to the page context that owns its search state.
 * Each distinct page keeps its own independent search term, so switching
 * between Library / Discover / Queue / Sources never leaks a term across.
 */
function getPageKey(rawPathname: string | null): PageKey {
  // The app is exported with `trailingSlash: true`, so routes arrive as
  // "/library/". Strip the trailing slash so they match the keys below.
  const pathname = (rawPathname ?? '/').replace(/\/+$/, '') || '/';
  if (pathname === '/' || pathname === '/library') return 'library';
  if (pathname === '/cloud-latest') return 'cloudLatest';
  if (pathname === '/providers') return 'providers';
  if (pathname === '/queue') return 'queue';
  if (pathname === '/settings' || pathname.startsWith('/library/settings')) return 'settings';
  if (pathname.startsWith('/library/series')) return 'series';
  return 'other';
}

/**
 * Returns the sessionStorage key that persists a page's search term.
 * The key encodes the page so terms never collide across pages.
 */
function storageKeyForPage(page: PageKey): string {
  if (page === 'other' || page === 'settings' || page === 'series') return '';
  return `ren_search_${page}`;
}

export function SearchProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const currentPage = React.useMemo(() => getPageKey(pathname), [pathname]);

  // Keep one independent term per page, initialized from that page's own
  // sessionStorage slot so a full reload restores each page's filter.
  const [termsByPage, setTermsByPage] = useState<Record<PageKey, string>>(() => {
    if (typeof window === "undefined") return { library: '', providers: '', queue: '', cloudLatest: '', settings: '', series: '', other: '' };
    const init = {} as Record<PageKey, string>;
    (Object.keys({ library: 1, providers: 1, queue: 1, cloudLatest: 1, settings: 1, series: 1, other: 1 }) as PageKey[]).forEach((page) => {
      const key = storageKeyForPage(page);
      init[page] = key ? (sessionStorage.getItem(key) || '') : '';
    });
    return init;
  });

  const searchTerm = termsByPage[currentPage] ?? '';

  // When the page changes, the visible term jumps immediately (no stale
  // debounce echo). Only the term that is actually being typed is debounced.
  const lastTypedPageRef = useRef<PageKey>(currentPage);
  const debouncedTypedTerm = useDebounce(searchTerm, 300);
  const debouncedSearchTerm =
    lastTypedPageRef.current === currentPage ? debouncedTypedTerm : searchTerm;

  const setSearchTerm = useCallback(
    (term: string) => {
      lastTypedPageRef.current = currentPage;
      setTermsByPage((prev) => {
        if (prev[currentPage] === term) return prev;
        return { ...prev, [currentPage]: term };
      });
      const key = storageKeyForPage(currentPage);
      if (typeof window !== "undefined" && key) {
        sessionStorage.setItem(key, term);
      }
    },
    [currentPage],
  );

  const clearSearch = useCallback(() => {
    lastTypedPageRef.current = currentPage;
    setTermsByPage((prev) => {
      if (!prev[currentPage]) return prev;
      return { ...prev, [currentPage]: '' };
    });
    const key = storageKeyForPage(currentPage);
    if (typeof window !== "undefined" && key) {
      sessionStorage.setItem(key, '');
    }
  }, [currentPage]);

  // Only Library, Just In, Sources and Queue read the filter; hide it
  // everywhere else so the bar never offers a search that does nothing.
  const isSearchDisabled = React.useMemo(() => {
    return currentPage === 'settings' || currentPage === 'series' || currentPage === 'other';
  }, [currentPage]);

  return (
    <SearchContext.Provider
      value={{
        searchTerm,
        debouncedSearchTerm,
        setSearchTerm,
        clearSearch,
        currentPage,
        isSearchDisabled,
      }}
    >
      {children}
    </SearchContext.Provider>
  );
}

export function useSearch() {
  const context = useContext(SearchContext);
  if (context === undefined) {
    throw new Error('useSearch must be used within a SearchProvider');
  }
  return context;
}
