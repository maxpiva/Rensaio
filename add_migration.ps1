param(
    [Parameter(Mandatory = $true)][string]$Name
)
# Adds one EF Core migration per database provider. Always run this instead of
# calling `dotnet ef migrations add` by hand, so the SQLite and PostgreSQL sets
# never drift apart. dotnet-ef comes from .config/dotnet-tools.json.

$project = "./RensaioBackend/RensaioBackend.csproj"
dotnet tool restore | Out-Null

dotnet ef migrations add $Name --project $project --context SqliteAppDbContext --output-dir Migrations/Rensaio/Sqlite
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
dotnet ef migrations add $Name --project $project --context PostgresAppDbContext --output-dir Migrations/Rensaio/Postgres --no-build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# The RensaioBackend.Migration namespace shadows EF's Migration base class inside
# RensaioBackend.Migrations.*, so the generated `: Migration` must be fully qualified.
$dir = Split-Path $project
foreach ($f in Get-ChildItem "$dir/Migrations/Rensaio/Sqlite/*_$Name.cs", "$dir/Migrations/Rensaio/Postgres/*_$Name.cs") {
    (Get-Content $f.FullName) -replace '(partial class \w+ : )Migration$', '$1Microsoft.EntityFrameworkCore.Migrations.Migration' | Set-Content $f.FullName
}
