# SSO (OpenID Connect)

Rensaiō can log users in through any OpenID Connect provider (Authentik, Keycloak, Pocket ID, Authelia, Zitadel, ...). Password login keeps working alongside it, and OPDS / MCP access is unchanged because those use the per-user path, not the login.

## Setup

1. **Enable Authentication** in *Settings → Security* and set the **External Domain** (e.g. `https://rensaio.example.com`).
2. At your identity provider, create an OIDC client:
   - Type: *confidential* (with a client secret) or *public* (PKCE only, no secret). PKCE is always used.
   - Redirect / callback URL: `https://rensaio.example.com/api/auth/oidc/callback`
   - Scopes: `openid profile email` (add `groups` if you want group mapping)
3. Back in *Settings → Security*, turn on **Single Sign-On**, fill in the **Issuer URL** (the provider's base URL, without `/.well-known/openid-configuration`), the **Client ID** and, for a confidential client, the **Client Secret**. Save.
4. The login page now shows a **Single Sign-On** button.

On first sign-in a user is matched to an existing Rensaiō account with the same username (exact match first, then case-insensitive if unambiguous) and linked to it. Later sign-ins use the link, so renaming the account is safe. If no account matches, sign-in is refused unless **auto-register** is on (see below). The **Owner** account is never linked and always logs in with its password.

The client secret is write-only: the Settings page never displays it, and saving with the field empty keeps the stored value.

## Advanced options (`appsettings.json` or environment variables)

Everything beyond the four basics lives in the `Oidc` section of `appsettings.json`. Each key can also be set as an environment variable using the `Oidc__Key` form, which is convenient for Docker; environment variables override the file, and both override what is stored from the Settings page.

| Key | Default | Description |
| --- | --- | --- |
| `Enabled`, `Issuer`, `ClientId`, `ClientSecret`, `ButtonLabel` | *(from Settings)* | Set here to manage them outside the UI; the Settings fields become read-only |
| `Scopes` | `openid profile email groups` | Scopes requested from the provider |
| `UsernameClaim` | `preferred_username` | Claim used as the Rensaiō username (falls back to `name`, then `email`) |
| `GroupsClaim` | `groups` | Claim holding the user's groups |
| `AdminGroup` | *(empty)* | Members get the **Admin** level on every login |
| `ManagerGroup` | *(empty)* | Members get the **Manager** level on every login |
| `DefaultLevel` | `User` | Level for auto-registered users, and for mapped users in neither group |
| `AutoRegister` | `false` | Create a Rensaiō account on first sign-in when none matches |
| `HidePasswordLogin` | `false` | Hide the username/password form and show only the SSO button |
| `AutoRedirect` | `false` | Skip the login page and go straight to the provider |
| `SyncAvatar` | `true` | Copy the provider's profile picture (`picture` claim) to the user's avatar on each login |
| `RedirectUri` | *(derived)* | Override the callback URL when the External Domain is not what the provider sees |

When `AdminGroup` or `ManagerGroup` is set, the user's level is re-evaluated on every login that carries the groups claim: in the admin group → Admin, in the manager group → Manager, otherwise `DefaultLevel`. A login without the groups claim leaves the level untouched. The **Owner** level is never granted by SSO.

Docker example:

```yaml
environment:
  - Oidc__Enabled=true
  - Oidc__Issuer=https://id.example.com
  - Oidc__ClientId=rensaio
  - Oidc__ClientSecret=xxxxxxxx
  - Oidc__AdminGroup=rensaio-admins
  - Oidc__AutoRegister=true
  - Oidc__HidePasswordLogin=true
```
