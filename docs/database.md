# Database: SQLite or PostgreSQL

**Rensaiō uses SQLite by default and needs no database setup.** This page is for people who already run a PostgreSQL server and want Rensaiō on it: Kubernetes, network storage where SQLite locking is unreliable, or a wish for real server-side backups.

SQLite stays the right choice for the desktop app and for a single Docker container on local disk. Nothing else changes when you switch; the `/config` volume is still required either way, because thumbnails, extension data and the contributor cache stay on disk.

## Using PostgreSQL

Create an empty database and a user that owns it, then give Rensaiō the connection. Five environment variables are the usual way:

```yaml
environment:
  - Database__Provider=postgres
  - Database__Host=postgres
  - Database__Port=5432
  - Database__Name=rensaio
  - Database__Username=rensaio
  - Database__Password=xxxxxxxx
```

On first start Rensaiō creates its tables and is ready to use. A complete Compose file with a bundled PostgreSQL service is at [`examples/docker-compose.postgres.yml`](../examples/docker-compose.postgres.yml), and Helm values at [`examples/helm-values-postgres.yaml`](../examples/helm-values-postgres.yaml).

If PostgreSQL is unreachable at startup Rensaiō stops with an error naming the host and database. It never falls back to SQLite on its own.

## Moving an existing library to PostgreSQL

1. Stop Rensaiō. Back up `/config` as usual.
2. Run the copy once with the same `/config` and the PostgreSQL variables above:

   ```bash
   docker run --rm -v /path/to/your/config:/config \
     -e Database__Host=postgres -e Database__Name=rensaio \
     -e Database__Username=rensaio -e Database__Password=xxxxxxxx \
     maxpiva/rensaio:latest migrate-db --to postgres
   ```

   With Compose: `docker compose run --rm rensaio migrate-db --to postgres`.
   Desktop: `RensaioBackend migrate-db --to postgres` with the variables set in the shell, or the equivalent `Database` section in `appsettings.json`.

3. It prints one line per table and a row-count check, then `Done.` The SQLite file is left untouched.
4. Start Rensaiō with `Database__Provider=postgres` and the same variables.

**Going back:** start Rensaiō without the `Database__*` variables. The SQLite file is still there, exactly as it was. Changes made while on PostgreSQL are not in it; `migrate-db --to sqlite` copies them into a fresh file if you need them (move the old file away first).

A marker file `rensaio.db.migrated-to-postgres` is written next to the SQLite file. If Rensaiō later starts on SQLite with that marker present it logs a warning, so a lost `Database__Provider` setting is noticed instead of silently running on stale data.

Exit codes of `migrate-db`: `0` done, `1` bad arguments or configuration, `2` target not empty, `3` row counts differed after the copy (drop the target database and retry).

## What is different on PostgreSQL

- The daily database backup in `/config/Backups` is off. Back the database up on the server.
- The one-time Kaizoku 1.0 import only runs on SQLite. Upgrade on SQLite first, then move.
- Run one instance against one database. Rensaiō is not designed for several replicas.

## Configuration reference (`appsettings.json` or environment variables)

| Key | Default | Description |
| --- | --- | --- |
| `Database__Provider` | *(inferred)* | `sqlite` or `postgres`. Without it, PostgreSQL is chosen when `Database__Host` or a PostgreSQL connection string is set |
| `Database__Host`, `Port`, `Name`, `Username`, `Password` | `5432`, `rensaio` | Discrete connection settings |
| `Database__SslMode` | `prefer` | `disable`, `allow`, `prefer`, `require`, `verify-ca`, `verify-full` |
| `Database__RootCertificate` | *(none)* | Path to the CA certificate for `verify-ca` / `verify-full` |
| `ConnectionStrings__DefaultConnection` | `Data Source=rensaio.db` | Instead of the discrete settings: a `postgresql://user:pass@host:5432/db?sslmode=verify-full&sslrootcert=/path/ca.crt` URI or an Npgsql `Host=...;Database=...;` string. For SQLite, the file path |

`PGSSLMODE` and `PGSSLROOTCERT` are also honoured, as by any PostgreSQL client.

Precedence:

1. `Database__Provider` decides the engine when set.
2. Otherwise PostgreSQL is chosen when `Database__Host` is set, or when `ConnectionStrings__DefaultConnection` is a `postgresql://` URI or an Npgsql `Host=...` string.
3. Otherwise SQLite, at `ConnectionStrings__DefaultConnection` (default `rensaio.db` in the data directory).

For PostgreSQL, `ConnectionStrings__DefaultConnection` is used when it is PostgreSQL-shaped; otherwise the `Database__*` parts are assembled. Environment variables override `appsettings.json`.

## Kubernetes with a Secret from an operator

Operators such as CloudNativePG, Zalando or Crunchy write a Secret with separate keys. Map them one to one:

```yaml
env:
  - name: Database__Provider
    value: postgres
  - name: Database__Host
    valueFrom: { secretKeyRef: { name: rensaio-postgres, key: host } }
  - name: Database__Port
    valueFrom: { secretKeyRef: { name: rensaio-postgres, key: port } }
  - name: Database__Name
    valueFrom: { secretKeyRef: { name: rensaio-postgres, key: dbname } }
  - name: Database__Username
    valueFrom: { secretKeyRef: { name: rensaio-postgres, key: user } }
  - name: Database__Password
    valueFrom: { secretKeyRef: { name: rensaio-postgres, key: password } }
```

For a server that requires TLS verification, mount the CA and point at it with either `Database__RootCertificate` or the standard `PGSSLROOTCERT` (plus `PGSSLMODE=verify-full`). Both are read by the PostgreSQL driver without any Rensaiō-specific setting.

To run the copy in a cluster, use a one-off pod or Job with the same `/config` volume and the same environment, and:

```yaml
command: ["/app/entrypoint.sh", "migrate-db", "--to", "postgres"]
```

## A `postgresql://` URI from a managed host

Paste it into `ConnectionStrings__DefaultConnection`. Rensaiō translates it for the .NET driver, which does not read URIs itself. Supported query parameters: `sslmode`, `sslrootcert`. Anything else (`application_name`, `connect_timeout`, `options`, ...) is rejected with a message naming the parameter; drop it, or use an Npgsql keyword string instead:

```
Host=db.example.com;Port=5432;Database=rensaio;Username=rensaio;Password=...;SSL Mode=VerifyFull;Root Certificate=/etc/ssl/ca.crt
```

## `pgloader` instead of `migrate-db` (unsupported)

`migrate-db` is the supported path. If you prefer `pgloader`, let Rensaiō create the schema first (start it once against the empty database, then stop it), then load data only with identifiers quoted:

```bash
pgloader --with "data only" --with "quote identifiers" \
  --set "timezone='UTC'" \
  /config/rensaio.db 'postgresql://rensaio:password@host/rensaio'
```

Booleans arrive as `0`/`1` and dates as text without a time zone; PostgreSQL parses both. There are no sequences to reset: every key is a UUID or a natural key.

## Troubleshooting

| Message | Cause | Fix |
| --- | --- | --- |
| `Cannot connect to PostgreSQL host:5432/db as user` | Wrong host, port, credentials, or the server rejects the client (`pg_hba.conf`) | Check the five settings; test with `psql` from the same network |
| `Keyword not supported: ...` | An Npgsql keyword string with a libpq-style name (`sslrootcert`, `dbname`, `user`, ...) | Use the Npgsql names: `Root Certificate`, `Database`, `Username`, `SSL Mode` |
| `Unsupported parameter '...' in the PostgreSQL URI` | Query parameter the translator does not know | Remove it, or switch to a keyword string |
| `PostgreSQL was selected but no server was given` | `Database__Provider=postgres` without `Database__Host` or a connection string | Add the settings |
| `The target database already contains data` | `migrate-db` into a non-empty database | Point at an empty database, or drop and recreate it |
| `Cannot write DateTime with Kind=Unspecified` | A code path bypassed the model's UTC conversion | Report it; include the stack trace |
| Warning: `This SQLite database was copied to PostgreSQL` | Rensaiō started on SQLite after a copy | Set `Database__Provider=postgres`, or delete the marker file to stay on SQLite |

## For contributors

- A schema change needs a migration for **both** providers. Run `./add_migration.sh Name` (or `add_migration.ps1`), never `dotnet ef migrations add` by hand. The scripts pick up `dotnet-ef` from `.config/dotnet-tools.json`. The "Backend tests" workflow fails when either set is behind the model.
- The entity configuration in `AppDbContext` is written for SQLite. Provider differences are applied in one place at the end of `OnModelCreating` (`ApplyProviderConventions`); do not branch per property.
- `RensaioBackend.Tests` runs every database spec on SQLite and on PostgreSQL (Testcontainers, needs Docker or a Podman socket). Set `RENSAIO_TEST_POSTGRES` to an Npgsql connection string with `CREATE DATABASE` rights to use an existing server instead. To run only SQLite: `dotnet test --filter "FullyQualifiedName!~Postgres"`.
- `migrate-db` copies with SQL generated from the two models, not with entities: column defaults never overwrite real values, and JSON/CSV columns move as text without being deserialized (stored payloads do not always survive a round trip).
- `ContributionDbContext` (the contributor cache) is always SQLite. It mirrors the Cloudflare D1 store byte for byte and is rebuilt from `metadata.bin`, so there is nothing to gain from moving it.
