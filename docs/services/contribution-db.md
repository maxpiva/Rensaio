# Contribution DB

A [Cloudflare Worker](https://developers.cloudflare.com/workers/) that powers the Rensaio **contribution database** — a shared, community-maintained dataset of manga titles, sources, and metadata provider links.

Contributors (user machines running Rensaio) submit `ContributionSnapshotV1` payloads through the API. The worker stores them in a [Cloudflare D1](https://developers.cloudflare.com/d1/) database, and once per day bumps the **Replication Version Number** and publishes the latest state to a GitHub repository as a single encrypted `metadata.bin` file.

---

## Table of Contents

- [How it works](#how-it-works)
- [Data model](#data-model)
- [Replication Version Number](#replication-version-number)
- [API endpoints](#api-endpoints)
  - [Validate Contributor](#validate-contributor)
  - [Upload Contribution Snapshot](#upload-contribution-snapshot)
  - [Get Replication Version](#get-replication-version)
  - [Get the Encryption Key](#get-the-encryption-key)
  - [Ban Contributor](#ban-contributor-admin-only)
- [Actions: version 0 / -1](#actions-version-0---1)
- [Admin maintenance endpoints](#admin-maintenance-endpoints)
- [Daily export](#daily-export)
- [Reconciliation: banning & re-uploading](#reconciliation-banning--re-uploading)
- [Deployment](#deployment)

---

## How it works

```text
                    ┌────────────────────────────────────────────┐
                    │                Cloudflare Worker            │
  Contributor ──►  GET /contributor   ──► validate               │
  Contributor ──►  POST /upload       ──► store + dedup          │
  Any client ──►  GET /replication   ──► current version         │
  Admin       ──►  POST /admin/ban    ──► deactivate + scrub     │
                    │                    ┌──────────────────┐    │
                    │                    │   D1 database    │    │
                    │                    │ contributors     │    │
                    │                    │ replication       │    │
                    │                    │ titles            │    │
                    │                    │ mappings          │    │
                    │                    │ mapping_titles    │    │
                    │                    │ sources           │    │
                    │                    │ series            │    │
                    │                    │ metadata          │    │
                    │                    └──────────────────┘    │
                    │                                            │
  Daily cron (06:00 UTC) ──► scrub ──► bump version ──► export  │
                    │         metadata.bin  ──► GitHub repo     │
                    └────────────────────────────────────────────┘
```

**The async contribution loop:**

1. The daily cron bumps the Replication Version Number and exports the latest state to GitHub as one **`metadata.bin`** (protobuf → tag+compress → AES-256).
2. A contributor machine downloads `metadata.bin`, reverses the transform, and scans its local sources — auto-matching titles and creating metadata.
3. The contributor uploads its results via `POST /upload` as a `ContributionSnapshotV1`.
4. The next daily export includes the new data, and other contributors pick it up.

---

## Data model

Eight tables in D1 (SQLite), mirroring the backend `Models/ContributionDatabase`:

| Table | Mirrors | Notes |
|-------|---------|-------|
| `contributors` | — | Auth only (seeded out-of-band) |
| `replication` | — | Singleton row (`id=1`) holding the Replication Version Number |
| `titles` | `TitleEntity` | `id` = MD5(normalized title) |
| `mappings` | `MappingEntity` | Aggregate root |
| `mapping_titles` | `MappingTitleEntity` | Join mapping ↔ title |
| `sources` | `ContributionSourceEntity` | Canonical source defs |
| `series` | `ContributionSeriesEntity` | Per-series source entries (record flattened) |
| `metadata` | `ContributionMetadataEntity` | Metadata provider links |

All deletes are **soft deletes** — `archived_at` is set instead of removing the row. Archived rows are hard-deleted by the daily cron after 30 days.

---

## Replication Version Number

- Lives in the singleton `replication` row (`id = 1`).
- **Bumped by +1 every day** at the start of the 06:00 UTC cron export.
- Read it via `GET /replication`.
- The current version is embedded in the exported snapshot (`v` field of the protobuf `ContributionSnapshotV1`) and in every uploaded payload's `v` so contributors can tell how fresh their baseline is.
- On each entity row, `v` — the **replication version** — encodes the action: `0` = add/update, `-1` = delete.

---

## API endpoints

All endpoints accept the contributor UUID as a query parameter — **there is no API key**. The UUID *is* the authentication.

### Validate Contributor

```http
GET /contributor?contributor={UUID}
```

Verifies whether a contributor UUID exists and is active.

```json
// Response (200 OK)
{ "active": true, "admin": false, "ban_reason": null }
```

| Code | Meaning |
|------|---------|
| 200 | Contributor found — `active`, `admin`, `ban_reason` |
| 400 | Missing `contributor` query parameter |
| 404 | Contributor not found |

> **Auto-creation is no longer supported.** `POST /contributor` returns **410**. Contributors are seeded out-of-band (D1 console).

### Upload Contribution Snapshot

```http
POST /upload?contributor={UUID}
Content-Type: application/json
```

Submits a `ContributionSnapshotV1` — the same shape as the backend's [`ContributionSnapshotV1`](../../RensaioBackend/Services/Contributions/Snapshot/ContributionSnapshotModels.cs). Entity lists use the backend's one-letter JSON keys, and each row carries a `v` (replication version) field (`0` add/update, `-1` delete).

```jsonc
{
  "e": 1,                                     // schema version (must be 1)
  "u": "2026-09-11T00:00:00Z",                // generated UTC
  "v": 42,                                    // client's observed collection version
  "t": [ { "i": "<guid>", "t": "My Manga", "v": 0 } ],
  "m": [ { "m": "<guid>", "t": "<guid>", "v": 0 } ],
  "s": [ { "i": "<guid>", "p": "en.mihon", "s": 123456, "n": "My Manga", "l": "en", "b": null, "v": 0 } ],
  "i": [ { "i": "<guid>", "m": "<guid>", "s": "<guid>", "d": { "v": 1, "i": "<guid>", "t": null, "s": 0, "p": false, "e": false, "l": null, "u": null }, "v": 0 } ],
  "d": [ { "i": "<guid>", "m": "<guid>", "p": 1, "k": "12345", "s": 0, "u": null, "v": 0 } ]
}
```

```json
// Response (200 OK)
{
  "processed": 5,
  "errors": []
}
```

| Code | Meaning |
|------|---------|
| 200 | Snapshot processed — `processed`, per-row `errors` |
| 400 | Missing `contributor`, invalid JSON, or unsupported schema version `e` |
| 403 | Contributor is banned |
| 404 | Contributor not found |

Every valid statement runs in a single D1 batch (atomic). Per-row validation failures are returned in `errors` (`list` = `t`/`m`/`s`/`i`/`d`, `index` = row index).

### Get Replication Version

```http
GET /replication
```

```json
// Response (200 OK)
{ "version": 43 }
```

### Get the Encryption Key

```http
GET /key
```

Returns the base64 concatenation of the AES-256 key + IV (the `AESKEY256IV` secret) as plain text — needed to reverse the daily export's AES step.

| Code | Meaning |
|------|---------|
| 200 | Body is the base64 `AESKEY256IV` value |
| 500 | `AESKEY256IV` secret not configured |

### Ban Contributor (Admin Only)

```http
POST /admin/ban?admin={adminUUID}
```

Deactivates a bad-actor contributor and archives all of their contributed data.

```json
{
  "contributor_id": "7b3f7c9e-...",
  "ban_reason": "Submitting malicious metadata links"
}
```

```json
// Response (200 OK)
{
  "banned": true,
  "contributor_id": "7b3f7c9e-...",
  "ban_reason": "Submitting malicious metadata links",
  "scrubbed": { "sources": 12, "series": 12, "metadata": 3 }
}
```

| Code | Meaning |
|------|---------|
| 200 | Contributor banned — scrub summary returned |
| 400 | Missing fields, or target is an admin |
| 403 | Caller is not an active admin |
| 404 | Admin or target not found |
| 409 | Target already banned |

The ban runs atomically: it deactivates the contributor, then archives all their non-archived series and metadata. Titles / mappings / sources are a shared registry — never auto-archived.

---

## Actions: version 0 / -1

Every entity row in an upload carries a `v` (replication version):

| v | Behavior |
|---|----------|
| `0` | **Add / update (UPSERT).** Record missing → insert. Record exists → update (values + ownership transfer to the caller); archived rows are resurrected. |
| `-1` | **Logical delete (tombstone).** Soft-deletes (`archived_at`) the active record by its id. |

The top-level snapshot `v` is informational only — the server merges blindly (no staleness rejection).

---

## Admin maintenance endpoints

Both require an **active admin** contributor UUID as a query parameter.

### Clean the Data Tables

```http
POST /admin/clean?admin={adminUUID}
```

Hard-deletes all rows from the data tables (series, mapping_titles, metadata, sources, titles, mappings) in foreign-key order. The `contributors` table is intentionally left intact.

```json
// Response (200 OK)
{
  "cleaned": true,
  "deleted": { "sources": 12, "series": 12, "mappingTitles": 8, "metadata": 3, "titles": 4, "mappings": 2 }
}
```

### Trigger the Export Manually

```http
POST /admin/export?admin={adminUUID}
```

Runs the same pipeline as the daily cron (scrub + archive orphan titles + bump version + push `metadata.bin`) on demand.

```json
// Response (200 OK)
{
  "exported": true,
  "files": ["metadata.bin"],
  "scrubbed": { "sources": 0, "metadata": 0, "titles": 0 },
  "orphanTitlesArchived": 0,
  "version": 43,
  "compression": 0
}
```

---

## Daily export

The worker runs once per day at **06:00 UTC** via a cron trigger:

1. **Scrub** — hard-deletes records soft-deleted (archived) for more than 30 days, in foreign-key order.
2. **Archive orphans** — archives titles with no active references.
3. **Bump the Replication Version Number** (`+1`).
4. **Export `metadata.bin`** — pushes one file to the configured GitHub repo (via the Contents API).

### The `metadata.bin` pipeline

```text
D1 rows ──► protobuf encode (no intermediate JSON)
         ──► [1-byte compression tag] + compress
         ──► AES-256-CBC encrypt
         ──► base64 ──► GitHub Contents API (metadata.bin)
```

- **Protobuf:** [`proto/contribution_snapshot_v1.proto`](../../RensaioContributionDB.CF/proto/contribution_snapshot_v1.proto) is the source of truth; the codec in `src/proto/` streams rows directly into protobuf.
- **Compression:** configured via the `EXPORT_COMPRESSION` var — `"0"` = ZSTD (default), `"1"` = Brotli. A **1-byte tag** is prepended: `0x00` = ZSTD, `0x01` = Brotli.
- **Encryption:** AES-256-CBC using the `AESKEY256IV` secret over the entire tagged+compressed stream.

**Decoding a snapshot:**

```text
metadata.bin ──► base64 decode ──► AES-256-CBC decrypt ──► read 1-byte tag
             ──► decompress (ZSTD | Brotli) ──► protobuf decode ──► ContributionSnapshotV1
```

`contributor_id` is **never exported**. The exported snapshot contains only the entity lists + schema version + generation timestamp + Replication Version Number.

---

## Reconciliation: banning & re-uploading

If a contributor is banned, all their series/metadata are archived. Other contributors who download the next export will see those rows missing and can re-upload the data under their own ownership. Archived rows are never treated as duplicates, so this flow always works.

Records that a banned contributor created but that were later updated by someone else belong to the new owner and survive the ban.

---

## Deployment

See [Contribution DB deployment](contribution-db-deploy.md) for the full step-by-step guide: creating the D1 database, applying migrations, setting the `GITHUB_TOKEN`/`AESKEY256IV` secrets, seeding contributors, and deploying with Wrangler.

Quick reference:

```powershell
cd RensaioContributionDB.CF
npm install
npx wrangler login
npx wrangler d1 create rensaio-contribution-db   # paste database_id into wrangler.toml
npx wrangler d1 migrations apply rensaio-contribution-db
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put AESKEY256IV            # base64(32B AES-256 key + 16B IV)
npx wrangler deploy
```

Then seed contributors directly in D1 (Cloudflare Dashboard → D1 → Console):

```sql
INSERT INTO contributors (id, admin, active, ban_reason, last_change)
VALUES ('<uuid>', 1, 1, NULL, datetime('now'));
```
