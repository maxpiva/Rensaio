"use client";

import React from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { CheckCircle2, ExternalLink } from 'lucide-react';
import { type SeriesHealth } from '@/lib/api/types';
import { AlertBadge } from '@/components/kzk/status/alert-badge';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { formatThumbnailUrl } from '@/lib/utils/thumbnail';

interface SeriesStatusPanelProps {
  series: SeriesHealth[];
  onClearAlert: (targetType: number, targetId: string) => void;
}

export function SeriesStatusPanel({ series, onClearAlert }: SeriesStatusPanelProps) {
  const router = useRouter();

  if (series.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <CheckCircle2 className="h-12 w-12 text-green-500 mb-4" />
        <p className="text-lg font-medium">All series are healthy</p>
        <p className="text-sm">No series alerts at this time</p>
      </div>
    );
  }

  // Sort: Red first, then Yellow
  const sorted = [...series].sort((a, b) => a.level - b.level);

  const handleSeriesClick = (seriesId: string) => {
    router.push(`/library/series?id=${seriesId}`);
  };

  return (
    <div className="space-y-2">
      {sorted.map((s) => (
        <Card key={s.id} className={s.level === 2 ? "border-red-300" : "border-yellow-300"}>
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-3">
              {/* Thumbnail on the left */}
              <div className="relative flex-shrink-0">
                <Image
                  src={formatThumbnailUrl(s.thumbnailUrl)}
                  alt={s.title}
                  width={48}
                  height={64}
                  className="rounded-md object-cover"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.src = '/kaizoku.net.png';
                  }}
                />
              </div>

              {/* Content area */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {/* Status icon in front of title */}
                  <AlertBadge level={s.level} />
                  {/* Title with link icon at the end */}
                  <span
                    className="text-sm font-medium truncate cursor-pointer hover:text-primary transition-colors flex items-center gap-1"
                    onClick={() => handleSeriesClick(s.id)}
                    title={`View ${s.title} details`}
                  >
                    {s.title}
                    <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground hover:text-primary" />
                  </span>
                </div>
                <p className="text-xs text-muted-foreground truncate mt-0.5">{s.message}</p>
                {s.providers.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {s.providers.map((p) => (
                      <Badge key={p.providerId} variant="secondary" className="text-xs">
                        {p.providerName} ({p.language})
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {/* Actions on the right */}
              <div className="flex items-center gap-2 shrink-0">
                {s.daysWithoutRelease != null && (
                  <Badge variant="outline" className="text-xs">
                    {s.daysWithoutRelease}d
                  </Badge>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => onClearAlert(0, s.id)}
                >
                  Dismiss
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
