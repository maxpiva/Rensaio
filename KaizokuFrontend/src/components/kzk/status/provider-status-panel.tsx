"use client";

import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Activity, CheckCircle2 } from 'lucide-react';
import { HealthStatusLevel, type ProviderHealth, type SeriesHealth } from '@/lib/api/types';
import { AlertBadgeWithLabel, AlertBadge } from '@/components/kzk/status/alert-badge';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface ProviderStatusPanelProps {
  providers: ProviderHealth[];
  onClearAlert: (targetType: number, targetId: string) => void;
}

function SeriesRow({ series, onClearAlert }: { series: SeriesHealth; onClearAlert: (targetType: number, targetId: string) => void }) {
  return (
    <div className="flex items-center justify-between py-2 px-4 rounded-lg hover:bg-muted/50 transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        <AlertBadge level={series.level} />
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{series.seriesTitle}</p>
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
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={() => onClearAlert(0, series.seriesId)}
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
                <AlertBadgeWithLabel level={provider.level} />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{provider.providerName}</p>
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
                variant="ghost"
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
                  <SeriesRow key={series.seriesId} series={series} onClearAlert={onClearAlert} />
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
        <p className="text-lg font-medium">All providers are healthy</p>
        <p className="text-sm">No provider alerts at this time</p>
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