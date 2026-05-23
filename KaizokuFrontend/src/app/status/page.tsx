"use client";

import React, { useState } from 'react';
import { Activity, AlertTriangle, Radio } from 'lucide-react';
import { useSeriesStatus, useProviderStatus, useClearAlert } from '@/lib/api/hooks/useStatus';
import { ProviderStatusPanel } from '@/components/kzk/status/provider-status-panel';
import { SeriesStatusPanel } from '@/components/kzk/status/series-status-panel';
import KzkHeader from '@/components/kzk/layout/header';
import KzkSidebar from '@/components/kzk/layout/sidebar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function StatusPage() {
  const [activeTab, setActiveTab] = useState("providers");
  const { data: series, isLoading: seriesLoading } = useSeriesStatus();
  const { data: providers, isLoading: providersLoading } = useProviderStatus();
  const { mutate: clearAlert } = useClearAlert();

  const handleClearAlert = (targetType: number, targetId: string) => {
    clearAlert({ targetType, targetId });
  };

  return (
    <div className="flex min-h-screen w-full flex-col bg-muted/40">
      <KzkSidebar />
      <div className="flex flex-col sm:gap-4 sm:py-4 sm:pl-14">
        <KzkHeader />
        <main className="grid flex-1 items-start gap-4 p-4 sm:px-6 sm:py-0">
          {/* Page Header */}
          <div className="flex items-center gap-3">
            <Activity className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Status</h1>
              <p className="text-sm text-muted-foreground">
                Monitor the health of your series and sources
              </p>
            </div>
          </div>

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
                <CardTitle className="text-sm font-medium">Provider Warnings</CardTitle>
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
                <CardTitle className="text-sm font-medium">Provider Critical</CardTitle>
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
                />
              )}
            </TabsContent>
          </Tabs>
        </main>
      </div>
    </div>
  );
}