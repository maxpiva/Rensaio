"use client";

import React from "react";

import { ActivityDock } from "@/components/comp/layout/activity-dock";
import { AppSidebar } from "@/components/comp/layout/app-sidebar";
import { CommandBar } from "@/components/comp/layout/command-bar";
import { MobileTabBar } from "@/components/comp/layout/mobile-tab-bar";
import { RibbonProvider } from "@/components/comp/layout/ribbon";
import { RequireAuth } from "@/components/auth/require-auth";

export { PageHeader, SectionHeading } from "@/components/comp/layout/page-header";
export type { PageHeaderProps } from "@/components/comp/layout/page-header";

interface PageLayoutProps {
  children: React.ReactNode;
  /**
   * Optional series title. Shown as the last crumb in the desktop top bar
   * (Rensaiō / Library / <seriesTitle>).
   */
  seriesTitle?: string;
  /**
   * Extra classes for the <main> element (padding, gap overrides, etc.).
   */
  mainClassName?: string;
}

/**
 * Shared Paper page shell.
 *
 *   ≥1024px  [ sidebar | top bar (crumb · ⌘K · downloads · theme · user)
 *                      | ribbon (page controls via <RibbonSlot>)
 *                      | main ]
 *   <1024px  [ top bar (brand · search · user)
 *              ribbon
 *              main
 *              bottom tab bar (Library · Just In · ＋ · Queue · More) ]
 *
 * The phone tab bar is a static flex child, not fixed, so `main` never sits
 * under it and pages need no extra bottom padding for it. The activity dock
 * floats above it.
 *
 * Pages render contextual controls (status tabs, filters, sort…) inside a
 * `<RibbonSlot>` and their masthead with `<PageHeader>` (re-exported here).
 */
export function PageLayout({
  children,
  seriesTitle,
  mainClassName = "p-4 pb-16 sm:px-6 sm:py-0 sm:pb-4 overflow-y-auto",
}: PageLayoutProps) {
  return (
    <RequireAuth>
      <RibbonProvider>
        <div className="paper-grain flex h-dvh w-full overflow-hidden bg-paper text-ink">
          <AppSidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <CommandBar seriesTitle={seriesTitle} />
            <main
              className={`page-shell-main flex-1 min-h-0 overscroll-contain ${mainClassName}`}
            >
              {children}
            </main>
            <MobileTabBar />
          </div>
          <ActivityDock />
        </div>
      </RibbonProvider>
    </RequireAuth>
  );
}
