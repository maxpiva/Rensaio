# Modal Redesign Backlog

Tracking which dialogs/drawers/wizards still need to be redesigned in the spotlight / glass aesthetic
established by the AddSeries modal rewrite (`cmd-card`, `as-*` CSS tokens, Fraunces display type,
single responsive Dialog — no vaul Drawer).

**Status legend**
- ✅ Done
- 🟡 In progress
- ⬜ Not started
- ⏭️ Skip (already polished enough)

---

## ✅ Already redesigned

| Modal | File | Notes |
|---|---|---|
| AddSeries / Search / Approve | `KaizokuFrontend/src/components/kzk/series/add-series/**` | Reference implementation. Drives Add, Add Sources, Request, Approve modes. |
| Import Wizard | `KaizokuFrontend/src/components/kzk/import-wizard/**` + `KaizokuFrontend/src/components/kzk/setup-wizard/steps/**` | Spotlight Stage archetype. New `WizardShell` + `ProgressPill` chrome. `ConfirmImportsStep` split into focused `confirm-imports/` folder (sticky head, virtualized scroll, body-level cover popover, match-row with per-source cover thumbs). Steps 1/3/4 re-skinned with `.iw-scan-card`, `.iw-stats-row`, `.iw-radio-card`, banner classes. Trigger relocated from Jobs modal to user-menu dropdown (below Settings). |
| Search Series Requester | `KaizokuFrontend/src/components/kzk/setup-wizard/search-series-requester.tsx` | Re-skinned alongside the Import Wizard. Dropped Drawer + `useMediaQuery` fork; single responsive Dialog with mobile fullscreen. Prop API + `onResult` callback unchanged. |

---

## ⬜ Wizards

| Modal | File | Complexity | Notes |
|---|---|---|---|
| Setup Wizard | `KaizokuFrontend/src/components/kzk/setup-wizard/index.tsx` | Complex (6 steps) | Onboarding: preferences → sources → import local → confirm → schedule → finish. **Step internals already redesigned** alongside the Import Wizard (shared components); only the outer chrome (Dialog framing, stepper, header, footer) still needs the Spotlight Stage treatment. |

---

## ⬜ Complex / high-impact

| Modal | File | Complexity | Notes |
|---|---|---|---|
| Provider Match Dialog | `KaizokuFrontend/src/components/dialogs/provider-match-dialog.tsx` | Complex | Chapter-by-chapter source matching. Multi-select, range fill, paint mode, keyboard shortcuts. Most interaction-dense modal in the app. |
| Provider Preferences Modal | `KaizokuFrontend/src/components/kzk/provider-preferences-requester.tsx` | Medium | Per-source settings (Switch / ComboBox / TextBox grid). Triggered from each provider card's gear icon — high frequency. |

---

## ⬜ Medium

| Modal | File | Complexity | Notes |
|---|---|---|---|
| Create/Edit Permission Preset | `KaizokuFrontend/src/components/kzk/settings/permissions-tab.tsx` (lines 65–169) | Medium | Grouped permission toggles (Access / Content / Library / Management). |
| Cloud Latest Details Modal | `KaizokuFrontend/src/components/kzk/series/cloud-latest-details-modal.tsx` | Simple | Manga metadata viewer launched from Cloud Latest grid. |
| Create User Dialog | `KaizokuFrontend/src/components/kzk/settings/users-tab.tsx` (lines 313–394) | Simple | Username / email / password / permission preset. |

---

## ⬜ Simple

| Modal | File | Complexity | Notes |
|---|---|---|---|
| Request Series Dialog | `KaizokuFrontend/src/components/kzk/series/request-series-dialog.tsx` | Simple | Submit a manga request to admins with optional note. Triggered from Cloud Latest grid. |
| Create Invite Dialog | `KaizokuFrontend/src/components/kzk/settings/users-tab.tsx` | Simple | Generate invite link with optional expiry. |
| Series Verify Integrity Dialog | `KaizokuFrontend/src/app/library/series/page.tsx` | Simple | Runs integrity check and shows results; offers cleanup option. |

---

## ⏭️ Skip

| Modal | File | Reason |
|---|---|---|
| Password Change Dialog | `KaizokuFrontend/src/components/auth/password-change-dialog.tsx` | Already highly polished — strength indicators, show/hide toggles, animated entrance. Revisit only if visual style drifts. |

---

## ⬜ Trivial confirms (batch into one styling pass)

Single shared "small dialog" component with the spotlight glass treatment can replace all four.

| Modal | File |
|---|---|
| Series Delete Confirmation | `KaizokuFrontend/src/app/library/series/page.tsx` (lines 75–81) |
| Provider Delete Confirmation | `KaizokuFrontend/src/components/kzk/series/detail/provider-card.tsx` (lines 423–444) |
| Deny Request Dialog | `KaizokuFrontend/src/components/kzk/settings/requests-tab.tsx` (lines 53–97) |
| Clear Downloads Confirmation | `KaizokuFrontend/src/app/queue/page.tsx` (lines 78–100+) |

---

## Recommended order

1. **Provider Preferences** — daily-use, currently dated grid, redesign is straightforward (no painful interaction logic). Highest ROI per hour spent.
2. **Provider Match Dialog** — second-most-touched, but the interaction surface is large; scope carefully before starting.
3. **Setup Wizard shell** — step internals already redesigned alongside the Import Wizard; only the chrome (Dialog framing, stepper, header/footer) remains. Smaller scope than originally estimated.
4. **Permission Preset editor** — admin-only, lower volume; do after the user-facing ones.
5. **Trivial confirms** — bundle into a single small-dialog styling pass; apply across all four sites.
