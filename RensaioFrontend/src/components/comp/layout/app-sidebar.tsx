"use client";

import { Brand } from "@/components/comp/layout/brand";
import { ExternalLinks } from "@/components/comp/layout/external-links";
import { SidebarNav } from "@/components/comp/layout/section-pills";

/**
 * Desktop sidebar (≥1024px): brand masthead, numbered primary nav, the
 * Manage group, and the project links in the foot. Hidden below `lg`, where
 * the phone top bar + bottom tab bar take over.
 */
export function AppSidebar() {
  return (
    <aside
      aria-label="Sidebar"
      className="hidden w-[240px] shrink-0 flex-col overflow-y-auto border-r border-rule bg-paper-1/70 px-3.5 pb-3 pt-[18px] lg:flex"
    >
      <div className="rule-double-b mb-1.5 px-1.5 pb-3.5 pt-0.5">
        <Brand />
      </div>

      <SidebarNav />

      <div className="mt-auto flex flex-col gap-2 pt-3.5">
        <div className="h-px bg-rule" />
        <ExternalLinks className="justify-start" />
      </div>
    </aside>
  );
}
