"use client";

import React, { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight, CheckCircle2, ExternalLink, Database } from 'lucide-react';
import { HealthStatusLevel, type ProviderHealth, type SeriesHealth } from '@/lib/api/types';
import { AlertBadge } from '@/components/kzk/status/alert-badge';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { formatThumbnailUrl } from '@/lib/utils/thumbnail';

interface ProviderStatusPanelProps {
  providers: ProviderHealth[];
  onClearAlert: (targetType: number, targetId: string) => void;
}

function SeriesRow({ series, onClearAlert }: { series: SeriesHealth; onClearAlert: (targetType: number, targetId: string) => void }) {
  const router = useRouter();

  const handleSeriesClick = (seriesId: string) => {
    router.push(`/library/series?id=${seriesId}`);
  };

  return (
    <div className="flex items-center justify-between py-2 px-4 rounded-lg hover:bg-muted/50 transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        {/* Thumbnail on the left */}
        <div className="relative flex-shrink-0">
          <Image
            src={formatThumbnailUrl(series.thumbnailUrl)}
            alt={series.title}
            width={36}
            height={48}
            className="rounded object-cover"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.src = '/kaizoku.net.png';
            }}
          />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <AlertBadge level={series.level} />
            <span
              className="text-sm font-medium truncate cursor-pointer hover:text-primary transition-colors flex items-center gap-1"
              onClick={() => handleSeriesClick(series.id)}
              title={`View ${series.title} details`}
            >
              {series.title}
              <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground hover:text-primary" />
            </span>
          </div>
          <p className="text-xs text-muted-foreground truncate">{series.message}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {series.daysWithoutRelease != null && (
          <Badge variant="outline" className="text-xs">
            {series.daysWithoutRelease}d
          </Badge>
        )}
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() => onClearAlert(0, series.id)}
        >
          Dismiss
        </Button>
      </div>
    </div>
  );
}

function ProviderCard({ provider, onClearAlert }: { provider: ProviderHealth; onClearAlert: (targetType: number, targetId: string) => void }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className={provider.level === HealthStatusLevel.Red ? "border-red-300" : "border-yellow-300"}>
        <CardHeader className="py-3 px-4">
          <div className="flex items-center justify-between">
            <CollapsibleTrigger asChild>
              <div className="flex items-center gap-3 cursor-pointer flex-1 min-w-0">
                {isOpen ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
                {/* Source icon as thumbnail */}
                <div className="flex-shrink-0 h-9 w-9 rounded-lg bg-muted flex items-center justify-center">
                  <Database className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <AlertBadge level={provider.level} />
                    <p className="text-sm font-medium truncate">{provider.providerName}</p>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {provider.language}{provider.scanlator ? ` · ${provider.scanlator}` : ""}
                    {provider.consecutiveErrors > 0 && ` · ${provider.consecutiveErrors} errors`}
                  </p>
                </div>
              </div>
            </CollapsibleTrigger>
            <div className="flex items-center gap-2 shrink-0">
              {!provider.isMihonInstalled && (
                <Badge variant="secondary" className="text-xs">User Provider</Badge>
              )}
              {provider.affectedSeries.length > 0 && (
                <Badge variant="outline" className="text-xs">
                  {provider.affectedSeries.length} series
                </Badge>
              )}
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => onClearAlert(1, provider.providerId)}
              >
                Dismiss
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-1 ml-9">{provider.message}</p>
        </CardHeader>
        {provider.affectedSeries.length > 0 && (
          <CollapsibleContent>
            <CardContent className="py-2 px-4 border-t">
              <div className="space-y-1">
                {provider.affectedSeries.map((series) => (
                  <SeriesRow key={series.id} series={series} onClearAlert={onClearAlert} />
                ))}
              </div>
            </CardContent>
          </CollapsibleContent>
        )}
      </Card>
    </Collapsible>
  );
}

export function ProviderStatusPanel({ providers, onClearAlert }: ProviderStatusPanelProps) {
  if (providers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <CheckCircle2 className="h-12 w-12 text-green-500 mb-4" />
        <p className="text-lg font-medium">All sources are healthy</p>
        <p className="text-sm">No source alerts at this time</p>
      </div>
    );
  }

  // Sort: Red first, then Yellow
  const sorted = [...providers].sort((a, b) => a.level - b.level);

  return (
    <div className="space-y-3">
      {sorted.map((provider) => (
        <ProviderCard key={provider.providerId} provider={provider} onClearAlert={onClearAlert} />
      ))}
    </div>
  );
}
