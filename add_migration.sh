#!/usr/bin/env sh
# Adds one EF Core migration per database provider. Always run this instead of
# calling `dotnet ef migrations add` by hand, so the SQLite and PostgreSQL sets
# never drift apart. dotnet-ef comes from .config/dotnet-tools.json.
set -e
if [ -z "$1" ]; then
  echo "usage: $0 <MigrationName>" >&2
  exit 1
fi
project="$(dirname "$0")/RensaioBackend/RensaioBackend.csproj"
dotnet tool restore >/dev/null

dotnet ef migrations add "$1" --project "$project" --context SqliteAppDbContext --output-dir Migrations/Rensaio/Sqlite
dotnet ef migrations add "$1" --project "$project" --context PostgresAppDbContext --output-dir Migrations/Rensaio/Postgres --no-build

# The RensaioBackend.Migration namespace shadows EF's Migration base class inside
# RensaioBackend.Migrations.*, so the generated `: Migration` must be fully qualified.
for f in "$(dirname "$project")"/Migrations/Rensaio/Sqlite/*_"$1".cs "$(dirname "$project")"/Migrations/Rensaio/Postgres/*_"$1".cs; do
  sed -i 's/\(partial class [A-Za-z0-9_]* : \)Migration$/\1Microsoft.EntityFrameworkCore.Migrations.Migration/' "$f"
done
