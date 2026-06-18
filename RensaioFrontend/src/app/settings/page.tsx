"use client";

import React from 'react';
import { SettingsManager } from "@/components/comp/settings-manager";

export default function SettingsPage() {
  return (
    <SettingsManager
      showHeader={true}
      showSaveButton={true}
      title="Settings"
      description="Configure your Rensaiō application settings"
    />
  );
}
