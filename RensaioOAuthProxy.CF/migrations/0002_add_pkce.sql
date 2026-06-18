-- Migration 0002: Add code_verifier for PKCE (MyAnimeList requirement)
-- MAL's OAuth2 flow requires PKCE with S256 challenge method.
-- The code_verifier is generated on auth URL creation, stored here,
-- and sent back during the token exchange.

ALTER TABLE oauth_sessions ADD COLUMN code_verifier TEXT;