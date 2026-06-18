"use client";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Library, Sparkles, List, Activity, Plug, Users, LucideSettings } from "lucide-react";
import { Fragment, useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import path from "path";

// Breadcrumb uses a static lookup for page names/icons, independent of sidebar permissions
const breadcrumbItems: Record<string, { name: string; icon: React.ReactNode }> = {
  "/": { name: "Home", icon: <Library className="h-6 w-6" /> },
  "/library": { name: "Library", icon: <Library className="h-6 w-6" /> },
  "/cloud-latest": { name: "Newly Minted", icon: <Sparkles className="h-6 w-6" /> },
  "/queue": { name: "Queue", icon: <List className="h-6 w-6" /> },
  "/status": { name: "Status", icon: <Activity className="h-6 w-6" /> },
  "/providers": { name: "Sources", icon: <Plug className="h-6 w-6" /> },
  "/users": { name: "Users", icon: <Users className="h-6 w-6" /> },
  "/settings": { name: "Settings", icon: <LucideSettings className="h-6 w-6" /> },
};

interface CompBreadcrumbProps {
  seriesTitle?: string;
}

export default function CompBreadcrumb({ seriesTitle }: CompBreadcrumbProps = {}) {
  const pathname = usePathname();
  const paths = pathname.endsWith("/") && pathname !== "/" ? pathname.slice(0, -1) : pathname;
  const pathNames = paths.split("/").filter((path) => path);
  // Special handling for series detail page - if we have a series title, show Library > Series Title
  const isSeriesDetailPage = paths.includes("/library/series") && seriesTitle;
  
  // Top-level pages that should not show "Library" as parent
  const topLevelPages = ["/queue", "/cloud-latest", "/providers", "/settings", "/status", "/users"];
  const isTopLevelPage = topLevelPages.includes(paths);

  return (
    <Breadcrumb className="hidden md:flex">      <BreadcrumbList>
        {/* For top-level pages, show only the page name */}
        {isTopLevelPage ? (
          <BreadcrumbItem>
            <BreadcrumbPage className="flex items-center gap-1">
              {breadcrumbItems[paths]?.icon}
            {breadcrumbItems[paths]?.name || pathNames[0]![0]!.toUpperCase() + pathNames[0]!.slice(1)}
            </BreadcrumbPage>
          </BreadcrumbItem>
        ) : (
          /* For Library and series pages, show Library as root */
          <>
            {/* For series detail page, show simplified breadcrumb */}
            {isSeriesDetailPage ? (
              <>
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link 
                      href="/library" 
                      className="flex items-center gap-1"
                    >
                      <Library className="h-6 w-6" /> Library
                    </Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage className="flex items-center gap-1">
                    {seriesTitle}
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </>
            ) : paths === "/" || paths === "/library" ? (
              /* For root library page, show just Library */
              <BreadcrumbItem>
                <BreadcrumbPage className="flex items-center gap-1">
                  <Library className="h-6 w-6" /> Library
                </BreadcrumbPage>
              </BreadcrumbItem>
            ) : (
              /* Regular breadcrumb for other library sub-pages */
              <>
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link 
                      href="/library" 
                      className="flex items-center gap-1"
                    >
                      <Library className="h-6 w-6" /> Library
                    </Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                {pathNames.filter(link => link !== "library").map((link, index) => {
                const filteredPaths = pathNames.filter(p => p !== "library");
                const href = `/library/${filteredPaths.slice(0, index + 1).join("/")}`;// Get the proper name from breadcrumb items, fallback to capitalized path
                const itemName = breadcrumbItems[href]?.name || (link[0]!.toUpperCase() + link.slice(1, link.length));
                const icon = breadcrumbItems[href]?.icon;
                
                return (
                  <Fragment key={index}>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      <BreadcrumbLink asChild>
                        {paths === href ? (
                          <BreadcrumbPage className="flex items-center gap-1 ">
                            {icon}
                            {itemName}
                          </BreadcrumbPage>
                        ) : (
                          <Link
                            href={href}
                            className="flex items-center gap-1"
                          >
                            {icon}
                            {itemName}
                          </Link>
                        )}
                      </BreadcrumbLink>
                    </BreadcrumbItem>
                  </Fragment>
                );
              })}
              </>
            )}
          </>
        )}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
