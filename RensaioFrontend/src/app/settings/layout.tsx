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
    <PageLayout mainClassName="px-4 pt-4 pb-0 sm:px-6 sm:pt-4 overflow-y-auto">
      {children}
    </PageLayout>
  );
}
