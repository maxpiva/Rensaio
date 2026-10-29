# Rensaio OAuth Proxy Worker

Cloudflare Worker that handles the OAuth sign-in for AniList and MyAnimeList scrobbling. Kitsu and MangaDex log in directly and don't use it. [`RensaioOAuthProxy/`](../RensaioOAuthProxy/) is an ASP.NET Core version with the same API.

- Deploying it: [docs/services/oauth-proxy-deploy.md](../docs/services/oauth-proxy-deploy.md)
