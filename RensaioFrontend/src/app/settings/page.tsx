"use client";

import React from 'react';
import { SettingsManager } from "@/components/comp/settings-manager";

export default function SettingsPage() {
  return (
    <SettingsManager
      showHeader={true}
      showSaveButton={true}
      showFooterSaveButton={true}
      title="Settings"
      description="Server-wide settings for your Rensaiō instance. Changes apply when you save."
    />
  );
}
