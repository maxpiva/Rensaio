"use client";

import React from "react";
import { PageLayout } from "@/components/comp/layout/page-layout";

export default function RouteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PageLayout mainClassName="p-4 sm:px-6 sm:py-4 overflow-y-auto">
      {children}
    </PageLayout>
  );
}
