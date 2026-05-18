'use client';

import React, { useCallback } from 'react';
import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react';
import { FixedSizeList, type ListChildComponentProps } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';
import { Card } from '@/components/ui/card';
import {
  COLUMN_WIDTHS,
  HEADER_HEIGHT,
  ROW_HEIGHT,
  type SortDir,
  type SortKey,
} from './queue-list-columns';

interface QueueListViewProps<TItemData> {
  itemData: TItemData;
  itemCount: number;
  sortKey: SortKey;
  sortDir: SortDir;
  onSortChange: (key: SortKey, dir: SortDir) => void;
  rowComponent: React.ComponentType<ListChildComponentProps<TItemData>>;
  showSortableColumns?: boolean;
  minHeight?: string;
}

interface HeaderButtonProps {
  label: string;
  columnKey: Exclude<SortKey, null>;
  currentKey: SortKey;
  currentDir: SortDir;
  onClick: (key: Exclude<SortKey, null>) => void;
  width: number | 'flex';
  align?: 'left' | 'right';
}

const HeaderButton = React.memo(function HeaderButton({
  label,
  columnKey,
  currentKey,
  currentDir,
  onClick,
  width,
  align = 'left',
}: HeaderButtonProps) {
  const isActive = currentKey === columnKey;
  const Icon = !isActive
    ? ChevronsUpDown
    : currentDir === 'asc'
      ? ChevronUp
      : ChevronDown;

  const style =
    width === 'flex'
      ? { flex: '1 1 0%', minWidth: 0 }
      : { width, flex: `0 0 ${width}px` };

  return (
    <button
      type="button"
      onClick={() => onClick(columnKey)}
      className={`group flex items-center gap-1 px-2 text-[11px] font-semibold uppercase tracking-wide transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm ${
        isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
      } ${align === 'right' ? 'justify-end' : 'justify-start'}`}
      style={style}
      title={`Sort by ${label}`}
    >
      <span className="truncate">{label}</span>
      <Icon
        className={`h-3 w-3 flex-shrink-0 transition-opacity ${
          isActive ? 'opacity-100' : 'opacity-40 group-hover:opacity-80'
        }`}
      />
    </button>
  );
});

function QueueListViewImpl<TItemData>({
  itemData,
  itemCount,
  sortKey,
  sortDir,
  onSortChange,
  rowComponent: Row,
  showSortableColumns = true,
  minHeight = 'min-h-[60vh]',
}: QueueListViewProps<TItemData>) {
  const handleSortClick = useCallback(
    (key: Exclude<SortKey, null>) => {
      if (sortKey !== key) {
        onSortChange(key, 'asc');
        return;
      }
      if (sortDir === 'asc') {
        onSortChange(key, 'desc');
        return;
      }
      // Cycle off
      onSortChange(null, 'asc');
    },
    [sortKey, sortDir, onSortChange],
  );

  return (
    <Card className={`flex flex-col overflow-hidden ${minHeight} p-0`}>
      {showSortableColumns && (
        <div
          className="flex items-center border-b border-border bg-muted/50 sticky top-0 z-10"
          style={{ height: HEADER_HEIGHT, minHeight: HEADER_HEIGHT }}
        >
          {/* thumbnail spacer */}
          <div
            style={{
              width: COLUMN_WIDTHS.thumbnail,
              flex: `0 0 ${COLUMN_WIDTHS.thumbnail}px`,
            }}
          />
          <HeaderButton
            label="Title"
            columnKey="title"
            currentKey={sortKey}
            currentDir={sortDir}
            onClick={handleSortClick}
            width="flex"
          />
          <HeaderButton
            label="Source"
            columnKey="source"
            currentKey={sortKey}
            currentDir={sortDir}
            onClick={handleSortClick}
            width={COLUMN_WIDTHS.source}
          />
          <HeaderButton
            label="Time"
            columnKey="time"
            currentKey={sortKey}
            currentDir={sortDir}
            onClick={handleSortClick}
            width={COLUMN_WIDTHS.time}
          />
          <HeaderButton
            label="Retries"
            columnKey="retries"
            currentKey={sortKey}
            currentDir={sortDir}
            onClick={handleSortClick}
            width={COLUMN_WIDTHS.retries}
          />
          <div
            className="px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground text-right"
            style={{
              width: COLUMN_WIDTHS.actions,
              flex: `0 0 ${COLUMN_WIDTHS.actions}px`,
            }}
          >
            Actions
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0">
        <AutoSizer>
          {({ height, width }) => (
            <FixedSizeList
              height={Math.max(height, 1)}
              width={width}
              itemCount={itemCount}
              itemSize={ROW_HEIGHT}
              itemData={itemData}
              overscanCount={6}
            >
              {Row}
            </FixedSizeList>
          )}
        </AutoSizer>
      </div>
    </Card>
  );
}

export const QueueListView = QueueListViewImpl as <TItemData>(
  props: QueueListViewProps<TItemData>,
) => React.ReactElement;
