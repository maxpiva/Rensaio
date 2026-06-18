"use client";

import "@/styles/globals.css";
import React from "react";

import { GeistSans } from "geist/font/sans";
import { Fraunces, JetBrains_Mono } from "next/font/google";
import { Toaster } from "sonner";

const fraunces = Fraunces({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-fraunces",
  axes: ["opsz"],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-jetbrains-mono",
});

import { ThemeProvider } from "@/components/theme/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import QueryProvider from "@/components/providers/query-provider";
import { AuthProvider } from "@/contexts/auth-context";
import { SetupWizardProvider } from "@/components/providers/setup-wizard-provider";
import { ImportWizardProvider } from "@/components/providers/import-wizard-provider";
import { ClientSideSetupWizard } from "@/components/comp/setup-wizard/client-wrapper";
import { ImportWizard } from "@/components/comp/import-wizard";
import { FontLoader } from "@/components/ui/font-loader";
import { SearchProvider } from "@/contexts/search-context";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${fraunces.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
      <head>
        <title>Rensaiō</title>
        <meta name="description" content="Series Downloader" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png"/>
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png"/>
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png"/>
        <link rel="manifest" href="/site.webmanifest"/>
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
            html { background: white; }
            html.dark { background: hsl(20, 14.3%, 4.1%); }
            @media (prefers-color-scheme: dark) {
              html:not(.light) { background: hsl(20, 14.3%, 4.1%); }
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
                      <ImportWizard />
                      {children}
                      <Toaster position="top-center" richColors />
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
