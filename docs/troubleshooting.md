# Troubleshooting

## Logs

If you encounter any issues, check the `logs` folder in Rensaiō's data directory:

| Platform | Logs folder |
|----------|-------------|
| Docker / Unraid / Helm | `/config/logs` |
| Windows | `%LOCALAPPDATA%\Rensaio\logs` |
| macOS | `~/Library/Application Support/Rensaio/logs` |
| Linux | `~/.config/Rensaio/logs` |

If `RENSAIO_DATADIR` is set, the logs are in `logs` under that folder instead.

You can review the logs there or upload them to share feedback on [Discord](https://discord.gg/f53BRuyVZf) or in a [GitHub issue](https://github.com/maxpiva/Rensaio/issues).

## Permission errors on `/series`

The container runs as `PUID`/`PGID`. It takes ownership of `/config` on every start but never changes `/series`, so that user and group must already be able to write there. See [Docker → Permissions](install/docker.md#permissions).

## High memory use or many `jcef_helper` processes

Watch the log for `Renderer budget exhausted` or `WebView pool saturated`, then tune `cefMaxRenderers`. See [Resource usage](configuration/resource-usage.md). Restart Rensaiō rather than killing individual helper processes.

## SSO sign-in refused

- If no Rensaiō account matches the user, sign-in is refused unless `AutoRegister` is on.
- If the provider rejects the callback URL, check the **External Domain** in *Settings → Security*, or set `RedirectUri`.
- The **Owner** account always logs in with its password.

See [SSO (OpenID Connect)](configuration/sso-oidc.md).
