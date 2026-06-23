"use client";

import React, { useCallback } from 'react';
import { SourcesList } from "@/components/comp/sources/sources-list";
import { type Provider } from "@/lib/api/types";

interface AddProvidersStepProps {
  setError: (error: string | null) => void;
  setIsLoading: (loading: boolean) => void;
  setCanProgress: (canProgress: boolean) => void;
}

export default function AddProvidersStep({
  setError,
  setIsLoading,
  setCanProgress,
}: AddProvidersStepProps) {
  // Stable callbacks so the embedded SourcesList effects don't loop.
  const handleError = useCallback(
    (error: string | null) => setError(error),
    [setError],
  );
  const handleLoadingChange = useCallback(
    (loading: boolean) => setIsLoading(loading),
    [setIsLoading],
  );
  const handleExtensionsChange = useCallback(
    (extensions: Provider[]) => {
      const installedCount = extensions.filter((ext) => ext.isInstaled).length;
      setCanProgress(installedCount > 0);
    },
    [setCanProgress],
  );

  return (
    <div className="min-h-[90%] overflow-y-auto pr-1 max-[768px]:overflow-visible max-[768px]:pr-0">
      <SourcesList
        embedded
        description={
          <>
            Install sources to access different websites. At least one source is required to continue. It&apos;s recommended to install enough sources to cover all your series.<br />
            After installation, adjust each source&apos;s settings. Be sure to choose whether each source is temporary or permanent, depending on how you plan to store the data.<br />
            If the storage folder was previously used in Rensaiō, your previously installed sources will be restored automatically in the next step.
          </>
        }
        onError={handleError}
        onLoadingChange={handleLoadingChange}
        onExtensionsChange={handleExtensionsChange}
      />
    </div>
  );
}

// Also export as named export for compatibility
export { AddProvidersStep };
