"use client";

import React from "react";
import { PageLayout } from "@/components/comp/layout/page-layout";

export default function RouteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // No bottom padding: the Settings unsaved-changes bar sticks to the very
  // bottom of this scroll area and the page adds its own end spacing.
  return (
    <PageLayout mainClassName="overflow-y-auto px-4 pt-5 pb-0 sm:px-8 sm:pt-7">
      {children}
    </PageLayout>
  );
}
