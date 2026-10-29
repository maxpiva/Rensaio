# How it works

Rensaiō is a **series manager** that prioritizes simplicity, speed, and reliability.

When you subscribe to a series, it is downloaded automatically. Whenever the series is updated in any of your configured providers, new chapters are downloaded too, in a "drop and forget" fashion.

It uses **Mihon extensions** to connect with multiple sources. See [Android on .NET](android-on-dotnet.md) for how those run.

## Components

- **Frontend**: A beautiful UI forked from [Kaizoku Next by OAE](https://github.com/oae/kaizoku/tree/next) (Next.js).
- **Backend**: A custom .NET engine that manages schedules, downloads, metadata, OPDS/MCP servers, and scrobbler sync, with a Mihon Bridge that enables the use of Mihon Android extensions.

## Sources

- Chapters are only downloaded from **temporary** sources when there is no permanent source.
- They are auto-deleted if a **permanent** source later provides them.
- One series can be searched for and linked to **multiple sources/providers**.

## What ends up on disk

Inside each series folder in your library, Rensaiō stores:

- `cover.jpg`
- `rensaio.json`, holding the full metadata mapping and the read state
- `ComicInfo.xml` metadata inside each chapter, taken from the original source

Read state is kept in `rensaio.json` rather than the database, so where you left off is remembered across all your reading devices and stays with the series files.
