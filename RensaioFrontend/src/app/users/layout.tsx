"use client";

import React from "react";
import { PageLayout } from "@/components/comp/layout/page-layout";

export default function RouteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PageLayout mainClassName="overflow-y-auto px-4 pb-10 pt-5 sm:px-8 sm:pt-7">
      {children}
    </PageLayout>
  );
}
