"use client";

import React from 'react';

import { PageHeader } from "@/components/comp/layout/page-header";
import { SourcesList } from "@/components/comp/sources/sources-list";
import { useSearch } from "@/contexts/search-context";

export default function ProvidersPage() {
  const { searchTerm, clearSearch } = useSearch();

  return (
    <div className="space-y-6 pb-6 md:space-y-8">
      <PageHeader
        folio="05"
        eyebrow="Sources · Mihon extensions"
        title={<em>Sources</em>}
        description="Install, enable, and health-check Mihon extensions."
        tate="出典"
      />

      <SourcesList searchTerm={searchTerm} clearSearch={clearSearch} />
    </div>
  );
}
