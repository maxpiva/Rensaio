"use client";

import React from "react";
import { SeriesProvider, useSeriesContext } from "@/contexts/series-context";
import { PageLayout } from "@/components/comp/layout/page-layout";

function SeriesLayoutContent({ children }: { children: React.ReactNode }) {
  const { seriesTitle } = useSeriesContext();

  return (
    <PageLayout seriesTitle={seriesTitle} mainClassName="overflow-y-auto pb-8">
      {children}
    </PageLayout>
  );
}

export default function SeriesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SeriesProvider>
      <SeriesLayoutContent>{children}</SeriesLayoutContent>
    </SeriesProvider>
  );
}
