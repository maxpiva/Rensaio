"use client";

import React from 'react';
import { SettingsManager } from "@/components/comp/settings-manager";
import { ScrobblerSettings } from "@/components/comp/scrobbler/scrobbler-settings";
import { Separator } from "@/components/ui/separator";

export default function SettingsPage() {
  return (
    <div className="space-y-8">
      <SettingsManager
        showHeader={true}
        showSaveButton={true}
        title="Settings"
        description="Configure your Rensaiō application settings"
      />

      <Separator />

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Scrobbler</h2>
          <p className="text-sm text-muted-foreground">
            Link external trackers (AniList, MyAnimeList, Kitsu, …) to sync your reading progress.
          </p>
        </div>
        <ScrobblerSettings />
      </section>
    </div>
  );
}
