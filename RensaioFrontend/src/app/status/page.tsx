"use client";

import React, { useState } from 'react';
import { Activity, AlertTriangle, Radio } from 'lucide-react';
import { useSeriesStatus, useProviderStatus, useClearAlert } from '@/lib/api/hooks/useStatus';
import { ProviderStatusPanel } from '@/components/comp/status/provider-status-panel';
import { SeriesStatusPanel } from '@/components/comp/status/series-status-panel';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/auth-context';

export default function StatusPage() {
  const [activeTab, setActiveTab] = useState("providers");
  const { data: series, isLoading: seriesLoading } = useSeriesStatus();
  const { data: providers, isLoading: providersLoading } = useProviderStatus();
  const { mutate: clearAlert } = useClearAlert();
  const { canAdmin } = useAuth();

  const handleClearAlert = (targetType: number, targetId: string) => {
    clearAlert({ targetType, targetId });
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Series Warnings</CardTitle>
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {series?.filter(s => s.level === 1).length ?? 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Series Critical</CardTitle>
            <Radio className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {series?.filter(s => s.level === 2).length ?? 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Source Warnings</CardTitle>
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {providers?.filter(p => p.level === 1).length ?? 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Source Critical</CardTitle>
            <Radio className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {providers?.filter(p => p.level === 2).length ?? 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList>
          <TabsTrigger value="providers">
            Sources
            {providers && providers.length > 0 && (
              <span className="ml-1 text-xs">({providers.length})</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="series">
            Series
            {series && series.length > 0 && (
              <span className="ml-1 text-xs">({series.length})</span>
            )}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="providers" className="mt-4">
          {providersLoading ? (
            <div className="space-y-3">
              <div className="h-24 w-full animate-pulse rounded-lg bg-muted" />
              <div className="h-24 w-full animate-pulse rounded-lg bg-muted" />
            </div>
          ) : (
            <ProviderStatusPanel
              providers={providers ?? []}
              onClearAlert={handleClearAlert}
              canAdmin={canAdmin}
            />
          )}
        </TabsContent>
        <TabsContent value="series" className="mt-4">
          {seriesLoading ? (
            <div className="space-y-2">
              <div className="h-16 w-full animate-pulse rounded-lg bg-muted" />
              <div className="h-16 w-full animate-pulse rounded-lg bg-muted" />
            </div>
          ) : (
            <SeriesStatusPanel
              series={series ?? []}
              onClearAlert={handleClearAlert}
              canAdmin={canAdmin}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
