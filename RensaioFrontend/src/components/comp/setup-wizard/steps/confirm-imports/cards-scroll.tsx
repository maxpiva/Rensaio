"use client";

/**
 * cards-scroll.tsx
 *
 * Virtualized scrollable cards panel.
 *
 * Responsibilities:
 *   - Wraps the react-window VariableSizeList with AutoSizer so the list
 *     fills the available height (max ~52vh on desktop via CSS on .iw-scroll-wrap).
 *   - Applies a pink custom scrollbar via the className "iw-cards-scroll"
 *     passed to <List>.
 *   - Renders a bottom gradient fade overlay (.iw-scroll-fade).
 *   - Shows a floating jump-to-top button (.iw-jump-top) that appears
 *     after scrolling 100px down.
 *   - Registers its inner scroll element with the CoverPopoverHost so the
 *     popover is dismissed on scroll.
 *   - Shows an empty-state message when items.length === 0.
 *
 * Virtualization is kept exactly as in the original VirtualizedImportList.
 */

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { VariableSizeList as List } from "react-window";
import AutoSizer from "react-virtualized-auto-sizer";
import { ChevronUp } from "lucide-react";
import type { ImportInfo } from "@/lib/api/types";
import { ImportStatus, Action } from "@/lib/api/types";
import { ImportCard, type ImportCardProps } from "./import-card";
import { useCoverPopoverScrollRef } from "./cover-popover";

// ─── Props ────────────────────────────────────────────────────────────────────

interface CardsScrollProps {
  items: ImportInfo[];
  onStatusChange: (path: string, status: ImportStatus) => void;
  onActionChange: (path: string, action: Action) => void;
  onProviderToggle: (path: string, seriesIndex: number) => void;
  onChapterChange: (path: string, chapter: number) => void;
  onSeriesPropertyChange: (
    path: string,
    seriesIndex: number,
    property: "useCover" | "isStorage" | "useTitle",
    value: boolean
  ) => void;
  showActionCombobox?: boolean;
  isUpdating?: boolean;
  showSearchButton?: boolean;
  showSkipButton?: boolean;
  showAddButton?: boolean;
  emptyMessage?: string;
}

// ─── Row item data (passed via react-window itemData prop) ────────────────────

interface RowItemData {
  items: ImportInfo[];
  onStatusChange: (path: string, status: ImportStatus) => void;
  onActionChange: (path: string, action: Action) => void;
  onProviderToggle: (path: string, seriesIndex: number) => void;
  onChapterChange: (path: string, chapter: number) => void;
  onSeriesPropertyChange: ImportCardProps["onSeriesPropertyChange"];
  showActionCombobox: boolean;
  isUpdating: boolean;
  showSearchButton: boolean;
  showSkipButton: boolean;
  showAddButton: boolean;
  getItemSize: (index: number) => number;
  setItemSize: (index: number, size: number) => void;
}

// ─── Row renderer — module-level so react-window gets a stable component ref ──
//
// Declared outside CardsScroll so its identity never changes between renders.
// All data it needs is received via react-window's itemData prop.

const Row = React.memo(function Row({
  index,
  style,
  data,
}: {
  index: number;
  style: React.CSSProperties;
  data: RowItemData;
}) {
  const itemRef = useRef<HTMLDivElement>(null);
  const importItem = data.items[index];

  if (!importItem) {
    return <div style={style} />;
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    if (itemRef.current) {
      const observer = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) return;
        // borderBoxSize includes padding + border; contentRect.height excludes both.
        // The Row wrapper carries padding-bottom for inter-card spacing, so we MUST
        // measure border-box to allocate the correct row height in react-window.
        const blockSize =
          entry.borderBoxSize && entry.borderBoxSize[0]
            ? entry.borderBoxSize[0].blockSize
            : entry.contentRect.height;
        if (blockSize !== data.getItemSize(index)) {
          data.setItemSize(index, blockSize);
        }
      });
      observer.observe(itemRef.current);
      return () => observer.disconnect();
    }
  }, [index, data]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={style} className="pr-2">
      {/*
        Inter-card gap lives HERE on the measured wrapper — not inside .iw-import-card.
        react-window's ResizeObserver reads this div's contentRect.height, so the
        14px padding-bottom adds real allocated space between rows AND sits OUTSIDE
        the card's frame (the card background does not extend through it), producing
        a true visible gap between cards.
      */}
      <div ref={itemRef} style={{ paddingBottom: 14 }}>
        <ImportCard
          key={importItem.path + "|" + importItem.title}
          import={importItem}
          onStatusChange={data.onStatusChange}
          onActionChange={data.onActionChange}
          onProviderToggle={data.onProviderToggle}
          onChapterChange={data.onChapterChange}
          onSeriesPropertyChange={data.onSeriesPropertyChange}
          showActionCombobox={data.showActionCombobox}
          showSkipButton={data.showSkipButton}
          showSearchButton={data.showSearchButton}
          showAddButton={data.showAddButton}
          isUpdating={data.isUpdating}
        />
      </div>
    </div>
  );
});

Row.displayName = "CardsScrollRow";

// ─── Component ────────────────────────────────────────────────────────────────

export const CardsScroll = React.memo(function CardsScroll({
  items,
  onStatusChange,
  onActionChange,
  onProviderToggle,
  onChapterChange,
  onSeriesPropertyChange,
  showActionCombobox = true,
  isUpdating = false,
  showSearchButton = false,
  showSkipButton = false,
  showAddButton = false,
  emptyMessage = "No items to display",
}: CardsScrollProps) {
  // ── react-window internals (identical to original VirtualizedImportList) ──
  const listRef = useRef<List>(null);
  const itemHeights = useRef<Map<number, number>>(new Map());
  const DEFAULT_ITEM_HEIGHT = 400;

  const prevItemsRef = useRef(items);

  useEffect(() => {
    function onlyPreferredChanged(
      prevItems: ImportInfo[],
      newItems: ImportInfo[]
    ): boolean {
      if (prevItems.length !== newItems.length) return false;
      for (let i = 0; i < prevItems.length; i++) {
        const prev = prevItems[i];
        const next = newItems[i];
        if (!prev || !next) return false;
        if (prev.path !== next.path) return false;
        if (prev.series && next.series) {
          for (let j = 0; j < prev.series.length; j++) {
            const prevS = prev.series[j];
            const nextS = next.series[j];
            if (!prevS || !nextS) return false;
            if (
              prevS.id === nextS.id &&
              prevS.title === nextS.title &&
              prevS.provider === nextS.provider &&
              prevS.preferred !== nextS.preferred
            ) {
              continue;
            }
            if (
              prevS.id !== nextS.id ||
              prevS.title !== nextS.title ||
              prevS.provider !== nextS.provider
            ) {
              return false;
            }
          }
        }
      }
      return true;
    }

    if (!onlyPreferredChanged(prevItemsRef.current, items)) {
      itemHeights.current.clear();
      if (listRef.current) {
        listRef.current.resetAfterIndex(0);
      }
    }
    prevItemsRef.current = items;
  }, [items]);

  const getItemSize = useCallback(
    (index: number) => itemHeights.current.get(index) || DEFAULT_ITEM_HEIGHT,
    []
  );

  const setItemSize = useCallback((index: number, size: number) => {
    itemHeights.current.set(index, size);
    if (listRef.current) {
      listRef.current.resetAfterIndex(index);
    }
  }, []);

  // ── Jump-to-top visibility ────────────────────────────────────────────────
  const [showJumpTop, setShowJumpTop] = useState(false);

  // ── Register scroll container with cover-popover ──────────────────────────
  const registerScrollRef = useCoverPopoverScrollRef();

  // We need the outerRef (the scrollable DOM element) from react-window.
  // <List outerRef={...}> calls this ref-callback with the outer scroll div.
  // We store the cleanup function in a ref so it persists between renders.
  const scrollCleanupRef = useRef<(() => void) | null>(null);

  const outerRef = useCallback(
    (el: HTMLDivElement | null) => {
      // Clean up previous listener if any
      if (scrollCleanupRef.current) {
        scrollCleanupRef.current();
        scrollCleanupRef.current = null;
      }

      registerScrollRef(el);

      if (!el) return;

      const handleScroll = () => {
        setShowJumpTop(el.scrollTop > 100);
      };
      el.addEventListener("scroll", handleScroll, { passive: true });
      scrollCleanupRef.current = () => {
        el.removeEventListener("scroll", handleScroll);
      };
    },
    [registerScrollRef]
  );

  // Clean up scroll listener on unmount
  useEffect(() => {
    return () => {
      if (scrollCleanupRef.current) {
        scrollCleanupRef.current();
        scrollCleanupRef.current = null;
      }
    };
  }, []);

  const handleJumpTop = useCallback(() => {
    if (listRef.current) {
      listRef.current.scrollTo(0);
    }
  }, []);

  // ── itemData — stable object passed to react-window so Row can read it ────
  const itemData: RowItemData = {
    items,
    onStatusChange,
    onActionChange,
    onProviderToggle,
    onChapterChange,
    onSeriesPropertyChange,
    showActionCombobox,
    isUpdating,
    showSearchButton,
    showSkipButton,
    showAddButton,
    getItemSize,
    setItemSize,
  };

  // ── Empty state ───────────────────────────────────────────────────────────
  if (items.length === 0) {
    return (
      <div className="iw-scroll-wrap">
        <div className="iw-scroll-empty">
          <span>{emptyMessage}</span>
        </div>
      </div>
    );
  }

  // ── Virtualized list ──────────────────────────────────────────────────────
  return (
    <div className="iw-scroll-wrap">
      <div className="iw-cards-height-container">
        <AutoSizer>
          {({ height, width }) => (
            <List
              ref={listRef}
              height={height}
              width={width}
              itemCount={items.length}
              itemSize={getItemSize}
              itemData={itemData}
              overscanCount={5}
              className="iw-cards-scroll"
              outerRef={outerRef}
            >
              {Row}
            </List>
          )}
        </AutoSizer>
      </div>

      {/* Bottom gradient fade */}
      <div className="iw-scroll-fade" aria-hidden="true" />

      {/* Jump-to-top button */}
      {showJumpTop && (
        <button
          className="iw-jump-top"
          onClick={handleJumpTop}
          aria-label="Jump to top"
        >
          <ChevronUp width={14} height={14} />
        </button>
      )}
    </div>
  );
}, (prevProps, nextProps) => {
  // Memoization: mirror original VirtualizedImportList comparison
  const propsEqual =
    prevProps.showActionCombobox === nextProps.showActionCombobox &&
    prevProps.isUpdating === nextProps.isUpdating &&
    prevProps.showSearchButton === nextProps.showSearchButton &&
    prevProps.showSkipButton === nextProps.showSkipButton &&
    prevProps.showAddButton === nextProps.showAddButton &&
    prevProps.onStatusChange === nextProps.onStatusChange &&
    prevProps.onActionChange === nextProps.onActionChange &&
    prevProps.onProviderToggle === nextProps.onProviderToggle &&
    prevProps.onChapterChange === nextProps.onChapterChange &&
    prevProps.onSeriesPropertyChange === nextProps.onSeriesPropertyChange;

  if (!propsEqual) return false;

  if (prevProps.items.length !== nextProps.items.length) return false;

  for (let i = 0; i < prevProps.items.length; i++) {
    const prev = prevProps.items[i];
    const next = nextProps.items[i];

    if (!prev || !next) return false;

    if (
      prev.path !== next.path ||
      prev.status !== next.status ||
      prev.action !== next.action ||
      prev.title !== next.title ||
      (prev.series || []).length !== (next.series || []).length
    ) {
      return false;
    }

    if (prev.series && next.series) {
      for (let j = 0; j < prev.series.length; j++) {
        const prevS = prev.series[j];
        const nextS = next.series[j];

        if (!prevS || !nextS) return false;

        if (
          prevS.id !== nextS.id ||
          prevS.title !== nextS.title ||
          prevS.provider !== nextS.provider
        ) {
          return false;
        }
      }
    }
  }

  return true;
});

CardsScroll.displayName = "CardsScroll";
