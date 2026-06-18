# User-Based Provider Match Support Plan

## Problem Statement

Currently, the "Match Source" feature only supports matching "Unknown" chapters to existing **Mihon-linked providers** (extension-based sources). However, the database already supports user-based (non-Mihon) providers via the `SeriesProviderEntity` entity, where fields like `MihonProviderId`, `MihonId`, and `BridgeItemInfo` are nullable. When chapters are detected but cannot be matched to a specific extension provider (e.g., the original provider is uninstalled/dead, or the user manually added a source), these chapters are assigned to an "Unknown" provider.

The system must allow users to:
1. Match "Unknown" chapters to existing user-based (non-Mihon) providers within the same series
2. Create new user-based providers as a match target for "Unknown" chapters

---

## Current State Analysis

### Database Entity: `SeriesProviderEntity` (`KaizokuBackend/Models/Database/SeriesProviderEntity.cs:14`)
- `Id` (Guid) - Primary key
- `SeriesId` (Guid) - FK to the parent series
- `MihonProviderId` (string?) - Null for user-based providers
- `MihonId` (string?) - Null for user-based providers
- `BridgeItemInfo` (string?) - Null for user-based providers
- `Provider` (string) - Name of the provider
- `Scanlator` (string) - Scanlator/group name
- `Language` (string) - Language code
- `IsUnknown` (bool) - True if this is the "Unknown" catch-all provider
- `Chapters` (List<Chapter>) - The chapters belonging to this provider

### Match Flow (Current)
1. `GET /api/serie/match/{providerId}` → `SeriesProviderService.GetMatchAsync()`
   - Loads the unknown provider and its chapters
   - Searches for **other** providers on the same series where `!IsUnknown && !string.IsNullOrWhiteSpace(MihonId)`
   - Returns those as match targets (`MatchInfoDto` list)
   - **Problem**: Excludes user-based providers (those with null `MihonId`)

2. `POST /api/serie/match` → `SeriesProviderService.SetMatchAsync()`
   - Iterates match chapters, each has a `MatchInfoId` pointing to a target provider
   - Renames files and moves chapter records from unknown → target provider
   - **Problem**: Cannot create new providers - only moves chapters to existing ones

### Backend Service: `SeriesProviderService.GetMatchAsync()` (`KaizokuBackend/Services/Series/SeriesProviderService.cs:42`)
```csharp
// Line 47: Filter excludes user-based providers
if (provider == null || (!string.IsNullOrWhiteSpace(provider.MihonId) && !provider.IsUnknown))
    return null;

// Line 51: Only finds providers with MihonId - excludes user-based ones
List<SeriesProviderEntity> providers = await _db.SeriesProviders
    .Where(a => a.SeriesId == provider.SeriesId && !a.IsUnknown && !string.IsNullOrWhiteSpace(a.MihonId))
    ...
```

### Frontend Match Types (`KaizokuFrontend/src/lib/api/types.ts`)
- `ProviderMatch` - Contains `id`, `matchInfos: MatchInfo[]`, `chapters: ProviderMatchChapter[]`
- `MatchInfo` - Currently maps from `MatchInfoDto` which extends `ProviderSummaryBase` (has `provider`, `scanlator`, `language`, etc.) plus an `id` field
- `ProviderMatchChapter` - Has `filename`, `chapterName`, `chapterNumber`, `matchInfoId`

### Frontend Dialog: `ProviderMatchDialog` (`KaizokuFrontend/src/components/dialogs/provider-match-dialog.tsx`)
- Shows chapters from the unknown provider
- Allows selecting a match target from `matchInfos` (the "Providers" dropdown)
- Supports batch-match, range-match, and per-chapter matching
- On save, sends back the updated `ProviderMatch` with assigned `matchInfoId` values

---

## Gaps Identified

1. **Backend `GetMatchAsync`**: Excludes user-based providers (`!string.IsNullOrWhiteSpace(a.MihonId)` filter). Must also include providers without MihonId.
2. **Backend `SetMatchAsync`**: Cannot create new user-based providers as match targets. A chapter can only be moved to an existing provider.
3. **Backend `GetMatchAsync`**: The early-exit condition `(!string.IsNullOrWhiteSpace(provider.MihonId) && !provider.IsUnknown)` is too restrictive - it returns null if the source provider has a MihonId (which would mean it's ALREADY matched).
4. **Frontend `ProviderMatchDialog`**: No UI for creating a new user-based provider from within the match dialog.
5. **Frontend types**: `MatchInfo` has no `id` property for null/undefined (for creating new providers).
6. **Series `HasUnknown` flag**: In `SeriesInfoDto`, `HasUnknown` checks `s.Sources.Any(a => !a.IsUnknown)` - this is **inverted logic**! It should be `a.IsUnknown`.
7. **Import flow**: When import encounters leftover unmatched chapters, it creates an "Unknown" provider. The match flow should also work during/after import.
8. **Frontend series page**: The "Match Source" button appears when `provider.isUnknown` is true - only for the Unknown provider. This is correct, but the match dialog needs to also show user-based providers.

---

## Detailed Implementation Plan

### Part 1: Backend - `SeriesProviderService` (Match Query)

**File**: `KaizokuBackend/Services/Series/SeriesProviderService.cs`

**1a. Fix `GetMatchAsync`** (lines 42-72):
- Remove the early-exit condition that checks `MihonId` 
- Change the match target query to include ALL non-unknown providers regardless of `MihonId`
- The match target providers should include both Mihon-linked AND user-based providers

```csharp
// New logic for GetMatchAsync:
public async Task<ProviderMatchDto?> GetMatchAsync(Guid providerId, CancellationToken token = default)
{
    SeriesProviderEntity? provider = await _db.SeriesProviders.Where(a => a.Id == providerId).AsNoTracking()
        .FirstOrDefaultAsync(token).ConfigureAwait(false);
    if (provider == null || !provider.IsUnknown)
        return null;
    
    // Include ALL non-unknown providers, both Mihon-linked and user-based
    List<SeriesProviderEntity> providers = await _db.SeriesProviders
        .Where(a => a.SeriesId == provider.SeriesId && !a.IsUnknown).AsNoTracking()
        .ToListAsync(token).ConfigureAwait(false);
    
    // ... rest of method same, but also add a special "Create New Provider" option
}
```

**1b. Add `matchInfoId = null` support in `GetMatchAsync`**:
- Currently chapters have no match and `matchInfoId = null`
- Add a virtual "Create New Provider" option that sends `matchInfoId = Guid.Empty` (sentinel for "create new")
- This sentinel will be handled in `SetMatchAsync`

### Part 2: Backend - `SeriesProviderService` (Match Set)

**File**: `KaizokuBackend/Services/Series/SeriesProviderService.cs`

**2a. Update `SetMatchAsync`** (lines 80-160):
- Handle `matchInfoId == Guid.Empty` (sentinel for "create new user-based provider")
- When creating a new provider, use the chapter's `provider`, `scanlator`, and `language` from the match info
- The new provider should have: `IsUnknown = false`, `IsLocal = true`, no `MihonId`, no `MihonProviderId`
- Handle partial matches where some chapters go to existing providers and others create new ones

```csharp
// Enhance SetMatchAsync:
Guid? NEW_PROVIDER_SENTINEL = Guid.Empty;

// In the match info dictionary, handle null/empty sentinel
foreach (ProviderMatchChapterDto chap in pm.Chapters)
{
    if (chap.MatchInfoId == null)
        continue;
    
    if (chap.MatchInfoId.Value == NEW_PROVIDER_SENTINEL)
    {
        // Create new user-based provider for this chapter
        // Use metadata from the match info or chapter to populate provider name
        SeriesProviderEntity newProvider = CreateUserBasedProvider(series, chap);
        // Move chapter to new provider
    }
    else
    {
        SeriesProviderEntity mi = minfo[chap.MatchInfoId.Value];
        // Existing logic...
    }
}
```

### Part 3: Backend - `SeriesProviderEntity` New Method

**File**: `KaizokuBackend/Models/Database/SeriesProviderEntity.cs`

Add a factory method to create a user-based provider:

```csharp
public static SeriesProviderEntity CreateUserBased(string provider, string scanlator, string language, string title = "")
{
    return new SeriesProviderEntity
    {
        Id = Guid.NewGuid(),
        Provider = provider,
        Scanlator = scanlator ?? string.Empty,
        Language = language,
        Title = title,
        IsUnknown = false,
        IsLocal = true,
        IsStorage = false,
        IsDisabled = false,
        Chapters = new List<Chapter>()
    };
}
```

### Part 4: Backend - Fix `HasUnknown` Inverted Logic

**File**: `KaizokuBackend/Extensions/ModelExtensions.cs:268`

Fix the inverted `HasUnknown` check:

```csharp
// Current (WRONG - checks !a.IsUnknown):
HasUnknown = s.Sources.Any(a => !a.IsUnknown),

// Fixed (checks a.IsUnknown):
HasUnknown = s.Sources.Any(a => a.IsUnknown),
```

Also fix `SeriesExtensions.cs:392`:
```csharp
// Current:
IsActive = series.Sources.Any(a => !a.IsDisabled && !a.IsUninstalled && !a.IsUnknown),

// This is already correct - isActive should exclude unknown providers from activation check
```

But check `ToSeriesInfo` at line 392 more carefully:
```csharp
// Current:
IsActive = series.Sources.Any(a => !a.IsDisabled && !a.IsUninstalled && !a.IsUnknown),
// This is correct - excludes unknown from active status
```

### Part 5: Frontend - API Types

**File**: `KaizokuFrontend/src/lib/api/types.ts`

**5a. Add sentinel for new provider creation**:
```typescript
export const NEW_PROVIDER_SENTINEL = "00000000-0000-0000-0000-000000000000";
```

**5b. Update `MatchInfo` interface** if needed - it already has all required fields.

**5c. Update `ProviderMatch` interface** if needed.

### Part 6: Frontend - `ProviderMatchDialog` Enhancements

**File**: `KaizokuFrontend/src/components/dialogs/provider-match-dialog.tsx`

**6a. Add "Create New Provider" option to the Providers dropdown**:
- Add a special entry at the bottom of the providers select called "+ Create New Provider"
- When selected, show a sub-dialog or inline form to enter: Provider Name, Scanlator, Language
- The resulting `matchInfoId` should be set to the sentinel GUID

**6b. Handle the `matchInfoId = null` case** better in display.

**6c. Support editing provider/scanlator/language for chapters being matched to a new provider**:
- When "Create New Provider" is selected for a batch of chapters, show a form to set the new provider's metadata

### Part 7: Frontend - Series Page Integration

**File**: `KaizokuFrontend/src/app/library/series/page.tsx`

**7a. Ensure the "Match Source" button appears for unknown providers** - already implemented correctly.

**7b. After match save, refresh series data** - already handled via query invalidation.

### Part 8: Backend - Import Command Service

**File**: `KaizokuBackend/Services/Import/ImportCommandService.cs`

**8a. During import, when creating unknown providers for unmatched chapters**:
- The `ToSeriesProvider()` method at `SeriesExtensions.cs:856` already sets `IsUnknown = (ImportProviderSnapshot.Provider == "Unknown")`
- Ensure user-based providers from import snapshots are preserved correctly

### Part 9: Backend - Series Command Service

**File**: `KaizokuBackend/Services/Series/SeriesCommandService.cs`

**9a. Ensure `ProcessSeriesProvidersAsync`** handles user-based providers during series updates:
- Currently at line 479, `IsMatchingProvider` only checks title/provider/language/scanlator equality
- This should work fine for user-based providers since the matching doesn't depend on `MihonId`

### Part 10: Migration / EF Core

**File**: `KaizokuBackend/Data/AppDbContext.cs`

No database migration is needed since:
- `MihonProviderId`, `MihonId`, `BridgeItemInfo` are already nullable
- `IsUnknown`, `IsLocal`, `IsStorage` already exist
- The schema already supports user-based providers

---

## Data Flow Diagram

```mermaid
flowchart TD
    A[Unknown Provider with\norphaned chapters] --> B[User clicks\n"Match Source"]
    B --> C[GET /api/serie/match/{id}]
    C --> D{SeriesProviderService\n.GetMatchAsync}
    D --> E[Load unknown provider]
    D --> F[Find ALL non-unknown\nproviders on same series]
    F --> G[Include Mihon-linked\nproviders]
    F --> H[Include user-based\nproviders]
    G --> I[Return MatchInfo list +\nchapters from unknown]
    H --> I
    I --> J[Frontend shows\nProviderMatchDialog]
    
    J --> K{User action}
    K --> L[Match to existing\nprovider]
    K --> M[Create new user-based\nprovider]
    K --> N[Partial match:\nsome to existing,\nsome to new]
    
    L --> O[POST /api/serie/match\nwith MatchInfoId set]
    M --> P[POST /api/serie/match\nwith MatchInfoId = sentinel]
    N --> O
    
    O --> Q{SeriesProviderService\n.SetMatchAsync}
    Q --> R{MatchInfoId ==\nsentinel?}
    R -->|Yes| S[Create new SeriesProviderEntity\nIsUnknown=false, IsLocal=true\nNo MihonId]
    R -->|No| T[Move chapters to\nexisting provider]
    S --> U[Move chapters to\nnew provider]
    T --> U
    U --> V[If unknown provider\nhas no chapters left,\ndelete it]
    V --> W[SaveChanges + save\nimport snapshot to disk]
```

---

## Backend API Changes Summary

| Endpoint | Change | Status |
|----------|--------|--------|
| `GET /api/serie/match/{id}` | Include user-based providers in match targets | Change |
| `POST /api/serie/match` | Support creating new user-based providers via sentinel GUID | Change |

## New Concepts

- **Sentinel GUID** (`00000000-0000-0000-0000-000000000000`): Used as `matchInfoId` to indicate "create a new user-based provider" rather than matching to an existing one
- **User-Based Provider**: A `SeriesProviderEntity` with `IsUnknown = false`, `IsLocal = true`, and no `MihonId`/`MihonProviderId`/`BridgeItemInfo`

---

## Todo List

### Backend Changes

- [ ] **`KaizokuBackend/Services/Series/SeriesProviderService.cs`**: Modify `GetMatchAsync` to include non-Mihon (user-based) providers as match targets
- [ ] **`KaizokuBackend/Services/Series/SeriesProviderService.cs`**: Modify `SetMatchAsync` to handle sentinel GUID for creating new user-based providers
- [ ] **`KaizokuBackend/Models/Database/SeriesProviderEntity.cs`**: Add static factory method `CreateUserBased()`
- [ ] **`KaizokuBackend/Extensions/ModelExtensions.cs`**: Fix inverted `HasUnknown` logic at line 268

### Frontend Changes

- [ ] **`KaizokuFrontend/src/lib/api/types.ts`**: Add `NEW_PROVIDER_SENTINEL` constant
- [ ] **`KaizokuFrontend/src/components/dialogs/provider-match-dialog.tsx`**: Add "Create New Provider" option to providers dropdown with inline form
- [ ] **`KaizokuFrontend/src/components/dialogs/provider-match-dialog.tsx`**: Handle sentinel GUID on save to signal new provider creation
- [ ] **`KaizokuFrontend/src/app/library/series/page.tsx`**: Verify match flow works with new provider creation
