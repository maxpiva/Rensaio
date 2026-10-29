<div align="center">

<img width="500px" src="./RensaioFrontend/public/rensaiow.png" alt="Rensaiō">
<br/>

</div>

<div align="center">

[![Discord](https://img.shields.io/discord/1516878111239700510?label&logo=discord&logoColor=white&color=blue)](https://discord.gg/f53BRuyVZf)&nbsp;&nbsp;
[![Website](https://img.shields.io/badge/-rensaio.net-blue?logo=googlechrome&logoColor=white)](https://www.rensaio.net)&nbsp;&nbsp;
[![License](https://img.shields.io/github/license/maxpiva/rensaio?label&color=blue)](./LICENSE)&nbsp;&nbsp;
[![Docker Pulls](https://img.shields.io/docker/pulls/maxpiva/rensaio?label&logo=docker&logoColor=white&color=blue)](https://hub.docker.com/r/maxpiva/rensaio)&nbsp;&nbsp;
[![Release](https://img.shields.io/github/v/release/maxpiva/rensaio?label&logo=github&color=blue)](https://github.com/maxpiva/Rensaio/releases)

</div>

<div align="center">

<strong>Rensaiō</strong> is a modern fork of the original <strong>Kaizoku</strong> and <strong>Kaizoku Next Gen</strong> by OAE, built to fill the void and bring a streamlined series manager back to life.

<strong>What does it do?</strong><br/>

When you subscribe to a series, it will automatically download it. Whenever the series is updated in any of your configured providers, new chapters will be downloaded automatically, in a "drop and forget" fashion.

It connects to sources through <strong>Mihon</strong> extensions.

</div>

> [!IMPORTANT]
> ⬆️ **You can upgrade directly from Kaizoku.Net to Rensaiō.** No changes are required on your side: simply run the new executable or update your Docker image, and everything will be upgraded automatically.
>
> Nevertheless, **before upgrading**, make sure to back up your config directory, including your database. Since the devil never rests.
>
> See [Upgrading](./docs/install/upgrading.md).

---

## 🚀 Quick Start

```bash
docker run -d \
  --name rensaio \
  --network host \
  -e PUID=99 -e PGID=100 -e UMASK=022 \
  -v /path/to/config:/config \
  -v /path/to/series:/series \
  maxpiva/rensaio:latest
```

Open `http://<host-ip>:9833` and follow the setup wizard.

For Docker Compose, Unraid, Kubernetes (Helm), or the desktop app, see the [install guides](./docs/README.md#install).

---

## ✨ Key Features

- 🧙‍♂️ **Startup Wizard**  
  Automatically imports your existing library.

- 🔁 **Temporary vs Permanent Sources**  
  - Chapters are only downloaded from **temporary** sources when there are no permanent sources.
  - Auto-deleted if a **permanent** source later provides them.

- 🔎 **Multi-Search & Multi-Linking**  
  Search and link one series to **multiple sources/providers**.

- 📥 **Automatic Downloads**  
  Downloads, retries and rescheduling are all automatic, with a dedicated downloads page.

- 🔄 **Auto-Updates**  
  Extensions are kept up to date.

- 👥 **Multi-User System**  
  Create separate accounts with different permission levels. Invite people, and control who has access to what. Optionally enable authentication to restrict access to authorized users only, with password login or [Single Sign-On](./docs/configuration/sso-oidc.md) through any OpenID Connect provider.

- 🩺 **Status & Health Dashboard**  
  A dedicated page that shows which series and providers need attention. Color-coded alerts (green/yellow/red) help you spot issues at a glance like broken providers, stale series with no new chapters, and more.

- 📡 **OPDS Server**  
  Read your library from any OPDS-compatible reader app. Browse by all series, what's new, what you're currently reading, categories, and tags. Reading progress syncs back automatically. Each user gets their own unique random OPDS path (e.g. `door-pebble`) for private access. Example: `https://rensaio.example.com/door-pebble`

- 🤖 **MCP Server (AI Integration)**  
  Expose your library to AI tools through the Model Context Protocol. Let LLMs search your series, check status, and more, all respecting user permissions. Just add `/mcp` to your OPDS path. Example: `https://rensaio.example.com/door-pebble/mcp`

- 📖 **Read State Tracking**  
  Remembers where you left off reading each chapter, across all your devices. It is stored with your series, not in the database.

- 🔗 **External Scrobbler Sync**  
  Sync your reading progress with external trackers. Supported providers: **AniList**, **MyAnimeList**, **Kitsu**, **MangaDex**. Each user controls their own connections and sync settings.

- 🧹 **Filename Normalization**  
  Rebuild your library with consistent naming, which makes reimporting easy when needed.

- 🧾 **ComicInfo.xml Injection**  
  Chapters include rich metadata from the original source.

- 🖼️ **Extras**
  - Stores `cover.jpg` per series
  - Stores `rensaio.json` for full metadata mapping, and read-state stored with your series.
  - External Domain Support for reverse proxy scenarios.
  - Support for jxl, jp2, avif image formats, with real-time transcoding for clients not supporting them.
  - And much more...

---

## 📚 Documentation

Everything else lives in [`docs/`](./docs/README.md):

- **Install:** [Docker](./docs/install/docker.md) · [Unraid](./docs/install/unraid.md) · [Helm](./docs/install/helm.md) · [Desktop](./docs/install/desktop.md) · [Upgrading](./docs/install/upgrading.md)
- **Configure:** [SSO (OpenID Connect)](./docs/configuration/sso-oidc.md) · [Resource usage](./docs/configuration/resource-usage.md)
- **Understand:** [How it works](./docs/concepts/how-it-works.md) · [Android on .NET](./docs/concepts/android-on-dotnet.md)
- **Develop:** [Building](./docs/development/building.md) · [Contributing](./CONTRIBUTING.md)
- **Help:** [Troubleshooting](./docs/troubleshooting.md)

---

## 🤝 Contributing

Frontend devs, you're needed. Backend PRs are welcome too. See [Contributing](./CONTRIBUTING.md).

---

## 📄 License

Licensed under the [GNU General Public License v3.0](./LICENSE).

---

## 🏴‍☠️ Brace Yourself

This app *just works™*  until it doesn't. But it's here.
Start managing your series with the style it deserves.
