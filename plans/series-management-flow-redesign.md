# Series Management Flow Redesign v4

## Changes

### Change 1: Move Pause/Resume Button to Sources Panel (frontend only)

**Before:** Pause/Resume button sits among action buttons in the series header (Verify, Delete).

**After:** A small "Download Settings" bar directly above the Sources list.

```
┌─ Series Header ─────────────────────────────────────┐
│ [Verify] [Delete]                                    │
│ ... (poster, info)                                   │
├─ Download Settings ──────────────────────────────────┤
│ Status: [⏸ PAUSED] or [▶ Active]                    │
│ [▶ Resume with pulse animation if paused]            │
├─ Sources ────────────────────────────────────────────┤
│ ... (provider cards)                                 │
├─ Latest Downloads ───────────────────────────────────┤
│ ...                                                  │
```

### Change 2: Auto-Pause on Download-Affecting Changes (frontend only)

When the user modifies any setting that affects what gets downloaded, auto-pause the series:

**Triggers auto-pause:**
- Enable/Disable a provider (Power button)
- Change "Continue After Chapter" value
- Delete a provider
- Match/Re-match a provider source

**Does NOT trigger auto-pause:**
- Use Storage / Use Cover / Use Title toggles (cosmetic/metadata only)
- Adding a new source (handled by separate Add Series flow)

The frontend simply sends `pausedDownloads: true` in the PATCH payload alongside the provider change. The existing [`UpdateSeriesAsync`](KaizokuBackend/Services/Series/SeriesCommandService.cs) already sets `dbSeries.PauseDownloads = series.PausedDownloads` — no backend change needed.

### Change 3: Per-Provider Download Control = Existing Enable/Disable Toggle

The current Enable/Disable (Power) button on each `ProviderCard` **is** the per-provider download control. When disabled:
- [`GetChaptersAsync`](KaizokuBackend/Services/Series/SeriesCommandService.cs:395) skips fetching chapters entirely
- No downloads can queue from that provider

This already works correctly. No change needed — just acknowledging this is the intended mechanism.

### Change 4: PAUSED Status Badge + Resume Animation

When auto-paused:
- **"⏸ PAUSED"** badge shown in Download Settings bar with distinct styling (yellow/amber background)
- **Resume button** gets a subtle pulse animation to draw attention after auto-pause
- **Series header status badge** also reflects paused state

When user clicks Resume:
- Sends `pausedDownloads: false` to backend
- Backend runs `RescheduleIfNeededAsync` which evaluates and queues pending downloads
- Badge/button return to normal active state

## Backend Changes: None

All behavior uses existing API endpoints and logic:
- [`PATCH /api/serie`](KaizokuBackend/Controllers/SeriesController.cs:244) — handles updates
- [`UpdateSeriesAsync`](KaizokuBackend/Services/Series/SeriesCommandService.cs:133) — persists PauseDownloads
- [`RescheduleIfNeededAsync`](KaizokuBackend/Services/Series/SeriesCommandService.cs:169) — evaluates downloads on unpause

## Frontend Changes: 1 file

| File | What |
|------|------|
| [`page.tsx`](KaizokuFrontend/src/app/library/series/page.tsx) | Restructure: extract Pause/Resume from header to new bar above Sources. Add auto-pause logic in `handleDisabledChange`, `handleFromChapterChange`, `handleDeleteProvider`. Add PAUSED badge. Add pulse animation to Resume. |

## Flow Diagram

```mermaid
sequenceDiagram
    participant User
    participant UI as Series Page
    participant Backend

    User->>UI: Change Continue After Chapter
    UI->>UI: Detect download-affecting change
    UI->>UI: Set pausedDownloads=true
    UI->>Backend: PATCH /api/serie { providers: [...], pausedDownloads: true }
    Backend->>Backend: Update provider, set PauseDownloads=true
    Backend-->>UI: Updated series
    UI->>UI: Show ⏸ PAUSED badge + pulsing Resume

    User->>UI: Click [▶ Resume]
    UI->>Backend: PATCH /api/serie { pausedDownloads: false }
    Backend->>Backend: GenerateDownloadsFromChapterData
    Backend->>Backend: Queue eligible chapters
    Backend-->>UI: Updated series
    UI->>UI: Show Active status
