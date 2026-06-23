"use client";

/**
 * imports-context.tsx
 *
 * Shared React context that allows ImportCard and MatchRow (deep children) to
 * call back into the top-level updateImportField without prop-drilling.
 */

import { createContext } from "react";

export interface ImportsContextType {
  updateImportField: (
    path: string,
    field: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    value: any,
    seriesIndex?: number
  ) => void;
}

export const ImportsContext = createContext<ImportsContextType | undefined>(
  undefined
);
