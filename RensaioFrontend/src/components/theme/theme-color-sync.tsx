"use client";

import * as React from "react";
import { useTheme } from "next-themes";

// Phone browsers and installed web apps paint the system status bar (and on
// Android the navigation bar) with <meta name="theme-color">. Keep it in step
// with the resolved app theme so dark mode doesn't get white system bars.
// These match the app bars (--paper-1 in globals.css). The inline script in
// layout.tsx creates the tag with the same values before first paint.
export const THEME_COLORS = { light: "#fbf8f2", dark: "#1c1813" } as const;

export function ThemeColorSync() {
  const { resolvedTheme } = useTheme();

  React.useEffect(() => {
    if (resolvedTheme !== "dark" && resolvedTheme !== "light") return;
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "theme-color");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", THEME_COLORS[resolvedTheme]);
  }, [resolvedTheme]);

  return null;
}
