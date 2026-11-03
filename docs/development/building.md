# Building

## Prerequisites

- [Git LFS](https://git-lfs.com/): every `.dll` and `.jar` in the repo is stored in LFS, and the build fails without them. Run `git lfs install` before cloning, or `git lfs pull` in an existing clone.
- [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0) for the backend and tray app
- [Node.js](https://nodejs.org/) 20 and [pnpm](https://pnpm.io/) 10 for the frontend (the versions CI uses)
- [PowerShell](https://learn.microsoft.com/powershell/) to run the build scripts
- Docker with `buildx`, only for building images

## Frontend

```powershell
.\build_frontend.ps1
```

Builds the Next.js frontend and packages it as `wwwroot.zip` (plus `wwwroot.sha256`) for the backend to serve. Run this before building the backend: both files are embedded into it and are not committed.

## Docker image

```powershell
.\build_docker.ps1
```

Restores and publishes the backend for `linux-x64` and `linux-arm64`, then builds and pushes a multi-arch Docker image.

> [!NOTE]
> This is the release script: it pushes to `maxpiva/rensaio:latest`. For a local image, run its two `dotnet publish` steps, then its `docker buildx build` line from `RensaioBackend/` with your own tag, a single `--platform`, and `--load` instead of `--push`.

## Desktop apps and backend

```powershell
.\build_apps.ps1
```

Publishes the backend and tray app for `win-x64`, `win-arm64`, `linux-x64`, `linux-arm64`, and `osx-arm64`, then zips the tray binaries.
