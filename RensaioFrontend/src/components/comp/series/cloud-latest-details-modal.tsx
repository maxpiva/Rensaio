"use client";

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Plus, ExternalLink, BookOpen } from 'lucide-react';
import Image from 'next/image';
import { type LatestSeriesInfo, InLibraryStatus } from '@/lib/api/types';
import ReactCountryFlag from "react-country-flag";
import { getCountryCodeForLanguage } from "@/lib/utils/language-country-mapping";
import { formatThumbnailUrl } from "@/lib/utils/thumbnail";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";
import { SeriesStatusTag } from "@/components/comp/series/cloud-latest-status";

interface CloudLatestDetailsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: LatestSeriesInfo;
  onAddSeries?: () => void;
}

const DROP_CAP =
  "first-letter:float-left first-letter:mr-2 first-letter:mt-1 first-letter:font-serif first-letter:text-[2.9em] first-letter:leading-[0.8] first-letter:text-ink";

export const CloudLatestDetailsModal: React.FC<CloudLatestDetailsModalProps> = ({
  open,
  onOpenChange,
  item,
  onAddSeries,
}) => {
  const isDesktop = useMediaQuery("(min-width: 768px)");

  const handleViewSource = () => {
    if (item.url) {
      window.open(item.url, '_blank', 'noopener,noreferrer');
    }
  };

  const handleAddSeries = () => {
    onOpenChange(false);
    onAddSeries?.();
  };

  const formatUpdatedDate = () => {
    if (!item.fetchDate) return null;
    const date = new Date(item.fetchDate);
    const month = date.toLocaleString('en-US', { month: 'short' });
    const year = date.getFullYear();
    return `Updated ${month} ${year}`;
  };

  const chapters = item.chapterCount ?? item.latestChapter;
  const hasChapters = chapters !== undefined && chapters !== null;
  const updated = formatUpdatedDate();
  const canAdd = item.inLibrary === InLibraryStatus.NotInLibrary && onAddSeries;
  // The drop cap only reads well on a real paragraph, not a one-liner.
  const dropCap = (item.description?.length ?? 0) > 160 ? DROP_CAP : undefined;

  const sourceBadge = (clickable: boolean) => {
    const inner = (
      <>
        <ReactCountryFlag
          countryCode={getCountryCodeForLanguage(item.language)}
          svg
          className="shrink-0"
          style={{ width: '16px', height: '12px', borderRadius: '2px' }}
          title={item.language.toUpperCase()}
        />
        <span className="truncate">{item.provider}</span>
        {clickable && <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />}
      </>
    );
    const base =
      "inline-flex max-w-full items-center gap-1.5 rounded-[4px] border border-rule bg-paper-2 px-2 py-1 font-mono text-[11.5px] text-ink-2";
    return clickable ? (
      <button
        type="button"
        className={cn(base, "cursor-pointer transition-colors hover:border-accent-line hover:text-accent-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-md:min-h-11 max-md:px-3")}
        onClick={handleViewSource}
        title="Click to open in the source"
      >
        {inner}
      </button>
    ) : (
      <span className={base}>{inner}</span>
    );
  };

  const byline = () => {
    const parts: string[] = [];
    if (item.author) parts.push(`by ${item.author}`);
    if (item.artist && item.artist !== item.author) parts.push(`art by ${item.artist}`);
    return parts.length > 0 ? parts.join(" · ") : null;
  };

  const cover = (width: string) => (
    <div className={cn("relative shrink-0", width)}>
      {/* Offset print shadow */}
      <div aria-hidden className="absolute inset-0 translate-x-1.5 translate-y-1.5 rounded-[3px] bg-rule-2" />
      <div className="relative aspect-[2/3] overflow-hidden rounded-[3px] bg-paper-2 ring-1 ring-rule">
        <Image
          src={formatThumbnailUrl(item.thumbnailUrl)}
          alt={item.title}
          fill
          className="object-cover"
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            if (target.src !== window.location.origin + '/rensaio.png') {
              target.src = '/rensaio.png';
            }
          }}
        />
      </div>
    </div>
  );

  const genres = (size: string) =>
    item.genre && item.genre.length > 0 ? (
      <ul className="flex flex-wrap gap-1.5" aria-label="Genres">
        {item.genre.map((g) => (
          <li
            key={g}
            className={cn("inline-flex items-center rounded-full border border-rule-2 px-2.5 py-0.5 text-ink-2", size)}
          >
            {g}
          </li>
        ))}
      </ul>
    ) : null;

  const metaTags = (
    <div className="flex flex-wrap items-center gap-1.5">
      <SeriesStatusTag status={item.status} />
      {hasChapters && (
        <span className="inline-flex h-[22px] items-center gap-1 rounded-[4px] border border-rule bg-paper-1 px-2 text-[11.5px] font-semibold text-ink-2">
          <BookOpen className="h-3 w-3" aria-hidden />
          {chapters} chapters
        </span>
      )}
    </div>
  );

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[95vw] gap-0 overflow-hidden p-0 sm:p-0 md:max-w-[620px]">
          {/* Masthead */}
          <div className="border-b border-rule px-6 pb-4 pr-14 pt-5">
            <p className="paper-eyebrow truncate">
              {item.provider}
              {updated && <span> · {updated}</span>}
            </p>
            <DialogTitle className="mt-1.5 font-serif text-[26px] font-normal leading-tight tracking-[-0.01em] text-ink">
              {item.title}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Details for {item.title}
            </DialogDescription>
          </div>

          {/* Content area */}
          <div className="flex items-start gap-6 px-6 py-5">
            <div className="flex w-[140px] shrink-0 flex-col items-center gap-3">
              {cover("w-[140px]")}
              <div className="mt-1 flex w-full justify-center">
                {item.url ? sourceBadge(true) : sourceBadge(false)}
              </div>
            </div>

            <div className="min-w-0 flex-1 space-y-3">
              {metaTags}
              {byline() && (
                <p className="text-[13px] text-ink-3">{byline()}</p>
              )}
              <p className={cn("line-clamp-6 text-[14px] leading-relaxed text-ink-2", dropCap)}>
                {item.description?.length ? item.description : "No description available"}
              </p>
              {genres("text-[11.5px]")}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 border-t border-rule bg-paper-1 px-6 py-3.5">
            <div className="flex shrink-0 gap-2">
              {item.url && (
                <Button variant="outline" className="gap-1.5" onClick={handleViewSource}>
                  <ExternalLink className="h-4 w-4" />
                  View Source
                </Button>
              )}
              {canAdd && (
                <Button className="gap-1.5" onClick={handleAddSeries}>
                  <Plus className="h-4 w-4" />
                  Add to Library
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="bg-paper">
        <DrawerHeader className="sr-only">
          <DrawerTitle>{item.title}</DrawerTitle>
          <DrawerDescription>Details for {item.title}</DrawerDescription>
        </DrawerHeader>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto" data-vaul-no-drag>
          {/* Masthead */}
          <div className="flex gap-4 border-b border-rule px-5 pb-5 pt-3">
            {cover("w-[96px]")}
            <div className="min-w-0 flex-1 pt-1">
              <p className="paper-eyebrow truncate">{item.provider}</p>
              <p aria-hidden className="mt-1 font-serif text-[21px] leading-tight text-ink [overflow-wrap:anywhere]">
                {item.title}
              </p>
              {byline() && (
                <p className="mt-1 text-[12px] text-ink-3">{byline()}</p>
              )}
              <div className="mt-2.5">{metaTags}</div>
              {updated && (
                <p className="mt-2 font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-3">{updated}</p>
              )}
            </div>
          </div>

          {/* Description */}
          <div className="space-y-3 border-b border-rule px-5 py-4">
            <p className={cn("text-[13.5px] leading-relaxed text-ink-2", dropCap)}>
              {item.description?.length ? item.description : "No description available"}
            </p>
            {genres("text-[11px]")}
          </div>

          {/* Source */}
          <div className="flex flex-wrap items-center gap-2 px-5 py-3">
            <span className="paper-eyebrow">Source</span>
            {item.url ? sourceBadge(true) : sourceBadge(false)}
          </div>
        </div>

        {/* Footer */}
        <DrawerFooter className="flex-col gap-2 border-t border-rule bg-paper-1 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {canAdd && (
            <Button className="h-11 w-full gap-1.5" onClick={handleAddSeries}>
              <Plus className="h-4 w-4" />
              Add to Library
            </Button>
          )}
          {item.url && (
            <Button variant="outline" className="h-11 w-full gap-1.5" onClick={handleViewSource}>
              <ExternalLink className="h-4 w-4" />
              View Source
            </Button>
          )}
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
};
