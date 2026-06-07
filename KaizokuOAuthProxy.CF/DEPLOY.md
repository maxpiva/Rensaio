# Hosting Guide: Kaizoku OAuth Proxy on Cloudflare

This guide walks through deploying the [`KaizokuOAuthProxy.CF`](KaizokuOAuthProxy.CF/) Cloudflare Worker from scratch.

---

## Prerequisites

1. **Cloudflare account** — [sign up free](https://dash.cloudflare.com/signup)
2. **Node.js 18+** — verify with `node --version`
3. **OAuth app credentials** from each provider you want to support:
   - [AniList API](https://anilist.co/settings/developer)
   - [MyAnimeList API](https://myanimelist.net/apiconfig)
   - [Kitsu API](https://kitsu.io/api/oauth/applications)
   - [MangaDex API](https://mangadex.org/settings/developer)

---

## Step 1: Authenticate Wrangler

```powershell
# Navigate to the project
cd KaizokuOAuthProxy.CF

# Login to Cloudflare (opens browser)
npx wrangler login
```

This grants Wrangler (the Cloudflare CLI) permission to deploy workers and manage D1 databases on your account.

---

## Step 2: Create the D1 Database

```powershell
npx wrangler d1 create kaizoku-oauth-proxy
```

**Output:**
```
✅ Successfully created DB 'kaizoku-oauth-proxy' in region WEUR

[[d1_databases]]
binding = "DB"
database_name = "kaizoku-oauth-proxy"
database_id = "your-database-id-here"
```

Copy the `database_id` value and paste it into [`wrangler.toml`](KaizokuOAuthProxy.CF/wrangler.toml):

```toml
[[d1_databases]]
binding = "DB"
database_name = "kaizoku-oauth-proxy"
database_id = "your-database-id-here"   # ← paste here
```

---

## Step 3: Apply the Database Migration

```powershell
npx wrangler d1 migrations apply kaizoku-oauth-proxy
```

This runs [`migrations/0001_create_sessions.sql`](KaizokuOAuthProxy.CF/migrations/0001_create_sessions.sql) which creates the `oauth_sessions` table:

```sql
CREATE TABLE oauth_sessions (
  state         TEXT PRIMARY KEY NOT NULL,
  instance_key  TEXT NOT NULL,
  provider      TEXT NOT NULL,
  access_token  TEXT,
  refresh_token TEXT,
  expires_at    TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
```

---

## Step 4: Set Provider Credentials

### Client IDs (public — set in wrangler.toml)

Edit [`wrangler.toml`](KaizokuOAuthProxy.CF/wrangler.toml) and fill in your client IDs:

```toml
[vars]
PROXY_ANILIST_CLIENT_ID = "your_anilist_client_id"
PROXY_MYANIMELIST_CLIENT_ID = "your_mal_client_id"
PROXY_KITSU_CLIENT_ID = "your_kitsu_client_id"
PROXY_MANGADEX_CLIENT_ID = "your_mangadex_client_id"
```

### Client Secrets (sensitive — set via wrangler secret)

```powershell
npx wrangler secret put PROXY_ANILIST_CLIENT_SECRET
# Paste your AniList client secret, press Enter

npx wrangler secret put PROXY_MYANIMELIST_CLIENT_SECRET
# Paste your MAL client secret, press Enter

npx wrangler secret put PROXY_KITSU_CLIENT_SECRET
# Paste your Kitsu client secret, press Enter

npx wrangler secret put PROXY_MANGADEX_CLIENT_SECRET
# Paste your MangaDex client secret, press Enter
```

Secrets are encrypted at rest and injected as environment variables at runtime. They are never visible in `wrangler.toml` or your source code.

---

## Step 5: Configure the Route (Custom Domain)

If you have a domain (e.g., `oauth.kaizoku.net`) pointed to Cloudflare:

1. Add the domain to your Cloudflare account (DNS tab)
2. Update [`wrangler.toml`](KaizokuOAuthProxy.CF/wrangler.toml) with your zone ID:

```toml
routes = [
  { pattern = "oauth.kaizoku.net/*", zone_id = "your-zone-id" }
]
```

To find your zone ID: Cloudflare Dashboard → your domain → Overview → Zone ID (right sidebar).

**No custom domain?** Skip this step. The worker will be available at `kaizoku-oauth-proxy.your-subdomain.workers.dev`.

---

## Step 6: Deploy

```powershell
npx wrangler deploy
```

**Output:**
```
Total Upload: 5.23 KiB / gzip: 1.87 KiB
Uploaded kaizoku-oauth-proxy (2.21 sec)
Published kaizoku-oauth-proxy (0.33 sec)
  https://oauth.kaizoku.net (or https://kaizoku-oauth-proxy.your-subdomain.workers.dev)
```

---

## Step 7: Verify the Deployment

```powershell
# Health check
curl https://oauth.kaizoku.net/health
# → {"status":"ok","service":"kaizoku-oauth-proxy"}

# Test with missing instance key (should return 401)
curl -X POST https://oauth.kaizoku.net/api/oauth/anilist/url
# → {"error":"X-Instance-Key header required"}

# Test with unknown provider (should return 400)
curl -X POST https://oauth.kaizoku.net/api/oauth/unknown/url
# → {"error":"Unsupported provider: unknown"}
```

---

## Step 8: Configure Kaizoku Backend

In your Kaizoku instance's [`appsettings.json`](KaizokuBackend/appsettings.json), point the [`ProxyScrobblerProvider`](KaizokuBackend/Services/Scrobbling/Providers/ProxyScrobblerProvider.cs) to your new worker:

```json
"Scrobbling": {
    "ProxyUrl": "https://oauth.kaizoku.net",
    "Proxy": {
        "InstanceKey": "your-instance-key"
    }
}
```

No other changes needed — the API contract is identical to the ASP.NET Core version.

---

## Free Tier Limits

| Resource | Free Tier Limit | Our Usage |
|----------|----------------|-----------|
| **D1 reads** | 10M rows/month | ~3 reads per OAuth flow |
| **D1 writes** | 100k writes/day | ~3 writes per OAuth flow |
| **D1 storage** | 5 GB | Negligible (rows deleted after 5 min) |
| **Worker requests** | 100k/day | 1 request per API call |
| **Worker duration** | 10ms CPU / request | Well under limit |
| **Cron triggers** | 1 per day minimum | 1 per hour (free) |

**Real-world capacity:** With ~3 writes per OAuth flow, you can handle ~33,000 OAuth flows per day on the free tier.

---

## Updating

```powershell
# Pull latest changes, then:
npx wrangler deploy
```

## Viewing Logs

```powershell
npx wrangler tail
```

## Local Development

```powershell
npx wrangler dev
# Starts on http://localhost:8787
# Uses local D1 via --local flag automatically
```
