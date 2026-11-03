# Contributing

## Frontend devs: you're needed

Help clean up the mess left behind by our overenthusiastic friends, Copilot, Claude and ~~Fable~~ (banned).

## Backend devs: PRs welcome

PRs are welcome to improve stability and architecture.

## Getting started

1. Clone with Git LFS and install the prerequisites: see [Building](building.md).
2. Build the frontend once, so the backend has its embedded UI: `.\build_frontend.ps1`.
3. Point the backend at a scratch data folder. Without it, a dev run uses the same data folder as an installed desktop app and upgrades its database:

   ```bash
   export RENSAIO_DATADIR=/tmp/rensaio-dev    # PowerShell: $env:RENSAIO_DATADIR = "C:\temp\rensaio-dev"
   ```

4. Run the backend. It listens on `http://localhost:9833` (set under `Kestrel:Ports` in `appsettings.json`):

   ```bash
   dotnet run --project RensaioBackend --no-launch-profile
   ```

   `--no-launch-profile` skips the `Development` environment from `launchSettings.json`. In `Development`, .NET's dependency-injection scope checks currently reject some service registrations and the backend exits on startup. The Docker image starts the backend under `xvfb-run` for its embedded browser; do the same on a headless Linux machine.

5. For frontend work, run the Next.js dev server in another terminal. In development it talks to the backend at `http://127.0.0.1:9833`:

   ```bash
   cd RensaioFrontend
   pnpm install
   pnpm dev
   ```

6. Open a pull request against `main`.

## Writing docs

User and developer docs live in [`docs/`](../README.md). When adding or moving a page:

- Put it in the folder for what the reader is trying to do: `install/`, `configuration/`, `concepts/`, `development/`, or `services/`.
- One topic per file, kebab-case filename, and an H1 that matches it.
- Add the page to the [docs index](../README.md).
- Use relative links, including into `examples/` and `charts/`.
- Keep the root `README.md` to a landing page: a short blurb and a link into `docs/`, not the full guide.
