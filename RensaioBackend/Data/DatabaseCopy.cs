using System.Data;
using System.Data.Common;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Storage;

namespace RensaioBackend.Data
{
    /// <summary>
    /// Copies every table of one <see cref="AppDbContext"/> into another, empty one on a
    /// different provider. Rows are read and written with plain SQL generated from the two
    /// models, never through entities: an INSERT built from the target model means column
    /// defaults never replace a real value (which <c>DbContext.Add</c> does for properties
    /// with <c>HasDefaultValue</c>), and a column whose value conversion is the same on
    /// both sides (JSON and CSV text) is moved as-is instead of being deserialized and
    /// re-serialized, which stored payloads do not always survive. Everything else goes
    /// through the source provider's conversion to the CLR value and the target provider's
    /// conversion back. Tables are written in foreign-key order.
    /// </summary>
    public static class DatabaseCopy
    {
        public sealed record TableResult(string Table, long SourceRows, long TargetRows)
        {
            public bool Matches => SourceRows == TargetRows;
        }

        public static IReadOnlyList<IEntityType> TablesInDependencyOrder(IModel model)
        {
            var types = model.GetEntityTypes().Where(t => !t.IsOwned() && t.GetTableName() != null).ToList();
            var ordered = new List<IEntityType>();
            var visiting = new HashSet<IEntityType>();

            void Visit(IEntityType type)
            {
                if (ordered.Contains(type))
                    return;
                if (!visiting.Add(type))
                    throw new InvalidOperationException($"Circular foreign keys involving {type.DisplayName()} are not supported by the copy.");
                foreach (var fk in type.GetForeignKeys())
                {
                    if (fk.PrincipalEntityType != type)
                        Visit(fk.PrincipalEntityType);
                }
                visiting.Remove(type);
                ordered.Add(type);
            }

            foreach (var type in types)
                Visit(type);
            return ordered;
        }

        public static async Task<bool> IsEmptyAsync(AppDbContext target, CancellationToken token = default)
        {
            foreach (var type in TablesInDependencyOrder(target.Model))
            {
                if (await CountAsync(target, type, token).ConfigureAwait(false) > 0)
                    return false;
            }
            return true;
        }

        /// <summary>
        /// Copies all tables. <paramref name="progress"/> receives one line per table.
        /// Returns per-table row counts on both sides for verification.
        /// </summary>
        public static async Task<IReadOnlyList<TableResult>> CopyAsync(AppDbContext source, AppDbContext target,
            Action<string>? progress = null, CancellationToken token = default)
        {
            var results = new List<TableResult>();
            var connection = target.Database.GetDbConnection();
            if (connection.State != ConnectionState.Open)
                await connection.OpenAsync(token).ConfigureAwait(false);

            await using var transaction = await target.Database.BeginTransactionAsync(token).ConfigureAwait(false);
            foreach (var targetType in TablesInDependencyOrder(target.Model))
            {
                var sourceType = source.Model.FindEntityType(targetType.ClrType)
                    ?? throw new InvalidOperationException($"{targetType.DisplayName()} is missing from the source model.");

                long copied = await CopyTableAsync(source, sourceType, target, targetType, connection, transaction.GetDbTransaction(), token).ConfigureAwait(false);
                progress?.Invoke($"{targetType.GetTableName()}: {copied} rows");
            }
            await transaction.CommitAsync(token).ConfigureAwait(false);

            foreach (var targetType in TablesInDependencyOrder(target.Model))
            {
                var sourceType = source.Model.FindEntityType(targetType.ClrType)!;
                long sourceRows = await CountAsync(source, sourceType, token).ConfigureAwait(false);
                long targetRows = await CountAsync(target, targetType, token).ConfigureAwait(false);
                results.Add(new TableResult(targetType.GetTableName()!, sourceRows, targetRows));
            }
            return results;
        }

        private sealed record ColumnPlan(
            string SourceColumn,
            string TargetColumn,
            RelationalTypeMapping SourceMapping,
            RelationalTypeMapping TargetMapping,
            bool PassThrough,
            Type TargetProviderType);

        private static async Task<long> CopyTableAsync(AppDbContext source, IEntityType sourceType,
            AppDbContext target, IEntityType targetType, DbConnection connection, DbTransaction transaction, CancellationToken token)
        {
            string tableName = targetType.GetTableName()!;
            var sourceTable = StoreObjectIdentifier.Table(sourceType.GetTableName()!, sourceType.GetSchema());
            var targetTable = StoreObjectIdentifier.Table(tableName, targetType.GetSchema());

            var plan = new List<ColumnPlan>();
            foreach (var targetProperty in targetType.GetProperties())
            {
                var sourceProperty = sourceType.FindProperty(targetProperty.Name)
                    ?? throw new InvalidOperationException($"{targetType.DisplayName()}.{targetProperty.Name} is missing from the source model.");
                var sourceMapping = sourceProperty.GetRelationalTypeMapping();
                var targetMapping = targetProperty.GetRelationalTypeMapping();
                Type targetProviderType = Nullable.GetUnderlyingType(targetMapping.Converter?.ProviderClrType ?? targetMapping.ClrType)
                                          ?? (targetMapping.Converter?.ProviderClrType ?? targetMapping.ClrType);
                // A property-level converter on both sides means the stored representation
                // is the application's own (JSON, CSV, enum as int) and identical per provider.
                bool passThrough = sourceProperty.GetValueConverter() is not null && targetProperty.GetValueConverter() is not null;
                plan.Add(new ColumnPlan(
                    sourceProperty.GetColumnName(sourceTable)!,
                    targetProperty.GetColumnName(targetTable)!,
                    sourceMapping, targetMapping, passThrough, targetProviderType));
            }

            await using var insert = connection.CreateCommand();
            insert.Transaction = transaction;
            insert.CommandText = $"INSERT INTO {Quote(tableName)} ({string.Join(", ", plan.Select(c => Quote(c.TargetColumn)))}) " +
                                 $"VALUES ({string.Join(", ", plan.Select((_, i) => "@p" + i))})";
            var parameters = new DbParameter[plan.Count];
            for (int i = 0; i < plan.Count; i++)
            {
                parameters[i] = plan[i].TargetMapping.CreateParameter(insert, "@p" + i, null, nullable: true);
                insert.Parameters.Add(parameters[i]);
            }

            var sourceConnection = source.Database.GetDbConnection();
            if (sourceConnection.State != ConnectionState.Open)
                await sourceConnection.OpenAsync(token).ConfigureAwait(false);
            await using var select = sourceConnection.CreateCommand();
            select.CommandText = $"SELECT {string.Join(", ", plan.Select(c => Quote(c.SourceColumn)))} FROM {Quote(sourceType.GetTableName()!)}";

            long count = 0;
            await using var reader = await select.ExecuteReaderAsync(token).ConfigureAwait(false);
            while (await reader.ReadAsync(token).ConfigureAwait(false))
            {
                for (int i = 0; i < plan.Count; i++)
                {
                    object? raw = reader.IsDBNull(i) ? null : reader.GetValue(i);
                    parameters[i].Value = raw is null ? DBNull.Value : Transfer(raw, plan[i]);
                }
                await insert.ExecuteNonQueryAsync(token).ConfigureAwait(false);
                count++;
            }
            return count;
        }

        /// <summary>Turns one raw source value into the value the target column expects.</summary>
        private static object Transfer(object raw, ColumnPlan column)
        {
            if (column.PassThrough)
                return Coerce(raw, column.TargetProviderType);

            // Source provider representation -> CLR value.
            object clr = raw;
            var sourceConverter = column.SourceMapping.Converter;
            if (sourceConverter is not null)
                clr = sourceConverter.ConvertFromProvider(Coerce(raw, sourceConverter.ProviderClrType))!;
            else
                clr = Coerce(raw, Nullable.GetUnderlyingType(column.SourceMapping.ClrType) ?? column.SourceMapping.ClrType);

            // CLR value -> target provider representation.
            var targetConverter = column.TargetMapping.Converter;
            if (targetConverter is not null)
                return targetConverter.ConvertToProvider(clr)!;
            return Coerce(clr, column.TargetProviderType);
        }

        /// <summary>
        /// Providers hand back different CLR types for the same column (SQLite reads every
        /// integer as <see cref="long"/>); bring the value to the type a converter or
        /// parameter expects.
        /// </summary>
        private static object Coerce(object value, Type type)
        {
            type = Nullable.GetUnderlyingType(type) ?? type;
            if (type.IsInstanceOfType(value))
                return value;
            if (type.IsEnum)
                return Enum.ToObject(type, Convert.ChangeType(value, Enum.GetUnderlyingType(type), System.Globalization.CultureInfo.InvariantCulture));
            if (value is string s)
            {
                if (type == typeof(Guid)) return Guid.Parse(s);
                if (type == typeof(DateTime)) return DateTime.Parse(s, System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.RoundtripKind);
                if (type == typeof(TimeSpan)) return TimeSpan.Parse(s, System.Globalization.CultureInfo.InvariantCulture);
                if (type == typeof(decimal)) return decimal.Parse(s, System.Globalization.CultureInfo.InvariantCulture);
            }
            if (value is IConvertible && typeof(IConvertible).IsAssignableFrom(type))
                return Convert.ChangeType(value, type, System.Globalization.CultureInfo.InvariantCulture);
            throw new InvalidOperationException($"Cannot convert a {value.GetType().Name} to {type.Name} during the copy.");
        }

        private static async Task<long> CountAsync(AppDbContext db, IEntityType type, CancellationToken token)
        {
            var connection = db.Database.GetDbConnection();
            if (connection.State != ConnectionState.Open)
                await connection.OpenAsync(token).ConfigureAwait(false);
            await using var command = connection.CreateCommand();
            command.Transaction = db.Database.CurrentTransaction?.GetDbTransaction();
            command.CommandText = $"SELECT COUNT(*) FROM {Quote(type.GetTableName()!)}";
            object? result = await command.ExecuteScalarAsync(token).ConfigureAwait(false);
            return Convert.ToInt64(result);
        }

        private static string Quote(string identifier) => "\"" + identifier.Replace("\"", "\"\"") + "\"";
    }
}
