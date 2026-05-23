"use client";

import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import { type SeriesHealth } from '@/lib/api/types';
import { AlertBadgeWithLabel } from '@/components/kzk/status/alert-badge';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface SeriesStatusPanelProps {
  series: SeriesHealth[];
  onClearAlert: (targetType: number, targetId: string) => void;
}

export function SeriesStatusPanel({ series, onClearAlert }: SeriesStatusPanelProps) {
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

  return (
    <div className="space-y-2">
      {sorted.map((s) => (
        <Card key={s.seriesId} className={s.level === 2 ? "border-red-300" : "border-yellow-300"}>
          <CardContent className="py-3 px-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <AlertBadgeWithLabel level={s.level} />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{s.seriesTitle}</p>
                  <p className="text-xs text-muted-foreground truncate">{s.message}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {s.daysWithoutRelease != null && (
                  <Badge variant="outline" className="text-xs">
                    {s.daysWithoutRelease}d
                  </Badge>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => onClearAlert(0, s.seriesId)}
                >
                  Dismiss
                </Button>
              </div>
            </div>
            {s.providers.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2 ml-9">
                {s.providers.map((p) => (
                  <Badge key={p.providerId} variant="secondary" className="text-xs">
                    {p.providerName} ({p.language})
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}