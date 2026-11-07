"use client";

import "@/styles/globals.css";
import React from "react";

// Fonts are bundled locally so builds work offline: the `geist` package ships
// the sans/mono files, and the Fraunces display serif is self-hosted via
// @font-face in globals.css. next/font/google needs network at build time and
// breaks Turbopack dev here, so it is intentionally not used.
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";

import { ThemeProvider } from "@/components/theme/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import QueryProvider from "@/components/providers/query-provider";
import { AuthProvider } from "@/contexts/auth-context";
import { SetupWizardProvider } from "@/components/providers/setup-wizard-provider";
import { ImportWizardProvider } from "@/components/providers/import-wizard-provider";
import { ClientSideSetupWizard } from "@/components/comp/setup-wizard/client-wrapper";
import { ImportProgressPill } from "@/components/comp/setup-wizard/import-progress-pill";
import { ImportWizard } from "@/components/comp/import-wizard";
import { FontLoader } from "@/components/ui/font-loader";
import { Toaster } from "@/components/ui/sonner";
import { SearchProvider } from "@/contexts/search-context";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head>
        <title>Rensaiō</title>
        <meta name="description" content="Series Downloader" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png"/>
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png"/>
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png"/>
        <link rel="manifest" href="/site.webmanifest" crossOrigin="use-credentials"/>
        <meta name="theme-color" content="#f5f1e8"/>
        <meta name="mobile-web-app-capable" content="yes"/>
        <meta name="apple-mobile-web-app-capable" content="yes"/>
        <meta name="apple-mobile-web-app-title" content="Rensaiō"/>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var storageKey = 'rensaio-theme';
                  var theme = localStorage.getItem(storageKey);
                  var systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
                  
                  if (theme === 'dark' || (theme === 'system' && systemTheme === 'dark') || (!theme && systemTheme === 'dark')) {
                    document.documentElement.classList.add('dark');
                    document.documentElement.style.colorScheme = 'dark';
                  } else {
                    document.documentElement.classList.remove('dark');
                    document.documentElement.style.colorScheme = 'light';
                  }
                } catch (_) {
                  // Fallback to system preference
                  if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
                    document.documentElement.classList.add('dark');
                    document.documentElement.style.colorScheme = 'dark';
                  }
                }
              })();
            `,
          }}
        />
        <style dangerouslySetInnerHTML={{
          __html: `
            /* Prevent any flash by setting initial colors immediately */
            html { background: #f5f1e8; }
            html.dark { background: #15120e; }
            @media (prefers-color-scheme: dark) {
              html:not(.light) { background: #15120e; }
            }
          `
        }} />
      </head>
      <body suppressHydrationWarning>        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
          storageKey="rensaio-theme"
        >
          <TooltipProvider>
            <QueryProvider>
              <AuthProvider>
                <SetupWizardProvider>
                  <ImportWizardProvider>
                    <SearchProvider>
                      <FontLoader />
                      <ClientSideSetupWizard />
                      <ImportProgressPill />
                      <ImportWizard />
                      {children}
                      <Toaster />
                    </SearchProvider>
                  </ImportWizardProvider>
                </SetupWizardProvider>
              </AuthProvider>
            </QueryProvider>
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
