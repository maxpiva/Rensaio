using Microsoft.EntityFrameworkCore;
using RensaioBackend.Data;
using RensaioBackend.Models.ContributionDatabase;

namespace RensaioBackend.Services.Contributions;

/// <summary>
/// PART 2 (data) of the SourceSeries normalization. Runs after the additive migration
/// (<c>AddSourceSeriesAndPackageId</c>) has created the columns/table.
///
/// Identity is now <c>package:url</c>, so several sources of the SAME package exposing the same
/// <c>Data.Url</c> must collapse onto ONE <see cref="ContributionSeriesEntity"/> row linked to
/// every contributing source through <see cref="ContributionSourceSeriesEntity"/>. Grouping by the
/// JSON <c>Data.Url</c> cannot be expressed reliably in SQL, hence this app-level pass.
///
/// PERFORMANCE (this runs against multi-million-row contributor.db):
///   * Per-package cheap skip: a package whose LIVE entries ALL already carry a non-empty
///     <c>PackageId</c> is guaranteed normalized (both the migrator and the writer only ever set
///     the canonical id together with PackageId) and is skipped WITHOUT reading <c>Data</c>.
///   * Entries are streamed in bounded batches and the change tracker is CLEARED between packages,
///     so <c>DetectChanges</c> never walks a growing graph (the previous O(n²) blow-up).
///   * Survivor <c>Data</c> is fetched in chunked batch queries, never per-row.
///   * Retires are set-based (<c>ExecuteUpdate</c>/<c>ExecuteDelete</c>), bypassing the tracker.
/// </summary>
public static class ContributionSourceSeriesMigrator
{
    private const int BatchSize = 5000;
    private const int IdChunkSize = 500;

    public static async Task RunAsync(ContributionDbContext db, ILogger logger, CancellationToken token)
    {
        // ── 1. Backfill Sources.PackageId (sources are few: one row per (package, sourceId)) ──
        var sources = await db.Sources.ToListAsync(token).ConfigureAwait(false);
        if (sources.Count == 0)
            return;

        int backfilled = 0;
        foreach (var s in sources)
        {
            if (s.PackageId == Guid.Empty)
            {
                s.PackageId = ContributionSourceEntity.DerivePackageId(s.Package);
                db.Entry(s).Property(x => x.PackageId).IsModified = true;
                backfilled++;
            }
        }
        if (backfilled > 0)
        {
            await db.SaveChangesAsync(token).ConfigureAwait(false);
            db.ChangeTracker.Clear();
            logger.LogInformation(
                "Contribution SourceSeries migration: backfilled PackageId on {Count} source(s).",
                backfilled);
        }
        else
        {
            db.ChangeTracker.Clear();
        }

        var packages = sources
            .GroupBy(s => s.Package, StringComparer.Ordinal)
            .Select(g => (Package: g.Key, SourceIds: g.Select(s => s.Id).ToHashSet()))
            .ToList();

        int consolidated = 0;
        int scanned = 0;

        foreach (var (package, sourceIds) in packages)
        {
            token.ThrowIfCancellationRequested();
            scanned++;

            // Cheap skip: if NO live entry for this package has an empty PackageId, the whole
            // package is already normalized. This reads ONLY the PackageId column (no Data JSON),
            // so re-runs and the already-migrated majority are near-free.
            bool needsWork = await db.SeriesEntries
                .Where(e => sourceIds.Contains(e.SourceId)
                    && e.Version != ContributionVersions.PendingDelete
                    && e.Version != ContributionVersions.UploadedDelete
                    && e.PackageId == Guid.Empty)
                .AnyAsync(token).ConfigureAwait(false);
            if (!needsWork)
                continue;

            int n = await ConsolidatePackageAsync(db, package, sourceIds, token).ConfigureAwait(false);
            consolidated += n;
            db.ChangeTracker.Clear();

            if ((scanned % 25) == 0)
                logger.LogInformation(
                    "Contribution SourceSeries migration: {Scanned}/{Total} package(s) scanned, {Consolidated} group(s) consolidated so far.",
                    scanned, packages.Count, consolidated);
        }

        logger.LogInformation(
            "Contribution SourceSeries migration: complete — {Scanned} package(s) scanned, {Consolidated} same-package same-url group(s) consolidated.",
            scanned, consolidated);
    }

    private sealed class GroupAcc
    {
        public Guid CanonicalId;
        public bool HasCanonicalMember;
        public Guid SurvivorSeriesId;
        // member ids by version bucket (0 = delete locally, -2 = tombstone so the delete propagates)
        public List<Guid> DeleteIds = [];
        public List<Guid> TombstoneIds = [];
        public HashSet<Guid> SourceIds = [];
        public HashSet<Guid> SeriesIds = [];
    }

    private static async Task<int> ConsolidatePackageAsync(
        ContributionDbContext db, string package, HashSet<Guid> sourceIds, CancellationToken token)
    {
        var packageId = ContributionSeriesEntity.DerivePackageId(package);

        // ── Stream the package's live entries in bounded pages, building per-url groups in memory.
        //    (Skip/Take on the package-scoped, indexed source set keeps each page cheap.) ──
        var groups = new Dictionary<Guid, GroupAcc>();
        int offset = 0;
        while (true)
        {
            var batch = await db.SeriesEntries
                .AsNoTracking()
                .Where(e => sourceIds.Contains(e.SourceId)
                    && e.Version != ContributionVersions.PendingDelete
                    && e.Version != ContributionVersions.UploadedDelete)
                .OrderBy(e => e.Id)
                .Skip(offset)
                .Take(BatchSize)
                .ToListAsync(token).ConfigureAwait(false);
            if (batch.Count == 0)
                break;

            foreach (var e in batch)
            {
                var url = (e.Data?.Url ?? string.Empty).ToLowerInvariant();
                var canonicalId = ContributionSeriesEntity.DeriveId(package, url);

                if (!groups.TryGetValue(canonicalId, out var g))
                    groups[canonicalId] = g = new GroupAcc { CanonicalId = canonicalId };

                if (e.SourceId != Guid.Empty)
                    g.SourceIds.Add(e.SourceId);
                g.SeriesIds.Add(e.SeriesId);

                if (e.Id == canonicalId)
                {
                    g.HasCanonicalMember = true;
                    g.SurvivorSeriesId = e.SeriesId;
                }
                else if (g.SurvivorSeriesId == Guid.Empty)
                {
                    g.SurvivorSeriesId = e.SeriesId;
                }

                if (e.Version == ContributionVersions.Uploaded)
                    g.TombstoneIds.Add(e.Id);
                else
                    g.DeleteIds.Add(e.Id);
            }

            offset += batch.Count;
            if (batch.Count < BatchSize)
                break;
        }

        if (groups.Count == 0)
            return 0;

        // Merge the series that a single (package,url) group spans, so titles/metadata from every
        // member's series survive on the survivor. GATED to multi-series groups (rare) so the
        // common path stays cheap; uses set-based SQL (no tracker growth).
        foreach (var g in groups.Values.Where(g => g.SeriesIds.Count > 1))
        {
            var absorbed = g.SeriesIds.Where(id => id != g.SurvivorSeriesId).ToList();
            if (absorbed.Count > 0)
                await MergeSeriesIntoAsync(db, g.SurvivorSeriesId, absorbed, token).ConfigureAwait(false);
        }

        // Groups that still need a canonical row (none of their members IS the canonical row).
        var groupsNeedingRow = groups.Values
            .Where(g => !g.HasCanonicalMember)
            .ToList();

        // Survivor Data to copy for those groups: pick the lowest-id member (deterministic) and
        // batch-fetch its full row. Only the Data/series fields are needed.
        var survivorByGroup = new Dictionary<Guid, Guid>();
        foreach (var g in groupsNeedingRow)
        {
            // lowest member id == first entry in DeleteIds/TombstoneIds buckets (ordered by Id)
            var candidates = g.DeleteIds.Count > 0 ? g.DeleteIds : g.TombstoneIds;
            survivorByGroup[g.CanonicalId] = candidates.Min();
        }

        var survivorIds = survivorByGroup.Values.Distinct().ToList();
        var survivorRows = new Dictionary<Guid, ContributionSeriesEntity>();
        foreach (var chunk in Chunk(survivorIds, IdChunkSize))
        {
            var rows = await db.SeriesEntries
                .AsNoTracking()
                .Where(e => chunk.Contains(e.Id))
                .ToListAsync(token).ConfigureAwait(false);
            foreach (var r in rows)
                survivorRows[r.Id] = r;
        }

        // Canonical ids already present in the DB (ANY version) — avoid PK collisions and
        // resurrect a previously-tombstoned canonical row instead of inserting a duplicate.
        var canonicalIds = groups.Keys.ToList();
        var existingCanonical = new Dictionary<Guid, int>();
        foreach (var chunk in Chunk(canonicalIds, IdChunkSize))
        {
            var rows = await db.SeriesEntries
                .AsNoTracking()
                .Where(e => chunk.Contains(e.Id))
                .Select(e => new { e.Id, e.Version })
                .ToListAsync(token).ConfigureAwait(false);
            foreach (var r in rows)
                existingCanonical[r.Id] = r.Version;
        }

        // Existing associations for these canonical ids (avoid duplicate composite-key inserts).
        var existingAssoc = new HashSet<(Guid, Guid)>();
        foreach (var chunk in Chunk(canonicalIds, IdChunkSize))
        {
            var rows = await db.SourceSeries
                .AsNoTracking()
                .Where(ss => chunk.Contains(ss.SeriesEntityId))
                .Select(ss => new { ss.SourceId, ss.SeriesEntityId })
                .ToListAsync(token).ConfigureAwait(false);
            foreach (var r in rows)
                existingAssoc.Add((r.SourceId, r.SeriesEntityId));
        }

        var newCanonicals = new List<ContributionSeriesEntity>();
        var resurrectCanonicals = new List<Guid>();
        var newAssocs = new List<ContributionSourceSeriesEntity>();

        foreach (var g in groups.Values)
        {
            bool needRow = !g.HasCanonicalMember;
            if (needRow)
            {
                if (existingCanonical.TryGetValue(g.CanonicalId, out var existingVersion))
                {
                    if (!ContributionVersions.IsLive(existingVersion))
                        resurrectCanonicals.Add(g.CanonicalId);
                }
                else if (survivorByGroup.TryGetValue(g.CanonicalId, out var survivorId)
                    && survivorRows.TryGetValue(survivorId, out var survivor))
                {
                    newCanonicals.Add(new ContributionSeriesEntity
                    {
                        Id = g.CanonicalId,
                        SeriesId = survivor.SeriesId,
                        PackageId = packageId,
                        SourceId = survivor.SourceId,
                        Data = survivor.Data,
                        VerifiedDateUTC = survivor.VerifiedDateUTC,
                        Metadata = survivor.Metadata,
                        Version = ContributionVersions.AddOrUpdate,
                    });
                }
            }

            foreach (var sourceId in g.SourceIds)
            {
                if (existingAssoc.Add((sourceId, g.CanonicalId)))
                {
                    newAssocs.Add(new ContributionSourceSeriesEntity
                    {
                        SourceId = sourceId,
                        SeriesEntityId = g.CanonicalId,
                        Version = ContributionVersions.AddOrUpdate,
                    });
                }
            }
        }

        if (newCanonicals.Count > 0)
            db.SeriesEntries.AddRange(newCanonicals);
        if (newAssocs.Count > 0)
            db.SourceSeries.AddRange(newAssocs);
        if (newCanonicals.Count > 0 || newAssocs.Count > 0)
            await db.SaveChangesAsync(token).ConfigureAwait(false);

        // ── Retire the legacy members (set-based, tracker-free). Canonical rows are excluded;
        //    a member that IS the canonical row is left live. ──
        var deleteIds = new List<Guid>();
        var tombstoneIds = new List<Guid>();
        foreach (var g in groups.Values)
        {
            deleteIds.AddRange(g.DeleteIds.Where(id => id != g.CanonicalId));
            tombstoneIds.AddRange(g.TombstoneIds.Where(id => id != g.CanonicalId));
        }

        foreach (var chunk in Chunk(tombstoneIds, IdChunkSize))
        {
            var ids = chunk.ToList();
            await db.SeriesEntries
                .Where(e => ids.Contains(e.Id))
                .ExecuteUpdateAsync(s => s.SetProperty(e => e.Version, ContributionVersions.PendingDelete), token)
                .ConfigureAwait(false);
        }
        foreach (var chunk in Chunk(deleteIds, IdChunkSize))
        {
            var ids = chunk.ToList();
            await db.SeriesEntries
                .Where(e => ids.Contains(e.Id))
                .ExecuteDeleteAsync(token).ConfigureAwait(false);
        }

        // Resurrect any previously-tombstoned canonical rows.
        foreach (var chunk in Chunk(resurrectCanonicals, IdChunkSize))
        {
            var ids = chunk.ToList();
            await db.SeriesEntries
                .Where(e => ids.Contains(e.Id))
                .ExecuteUpdateAsync(s => s
                    .SetProperty(e => e.Version, ContributionVersions.AddOrUpdate)
                    .SetProperty(e => e.PackageId, packageId), token)
                .ConfigureAwait(false);
        }

        return groups.Count;
    }

    /// <summary>
    /// Folds each absorbed series into <paramref name="targetSeriesId"/>: unions title links
    /// (duplicates retired) and migrates metadata rows on (ProviderId, ProviderKey), strongest
    /// status wins. Set-based (ExecuteUpdate/ExecuteDelete) so the change tracker stays bounded.
    /// Mirrors the manual Join semantics.
    /// </summary>
    private static async Task MergeSeriesIntoAsync(
        ContributionDbContext db, Guid targetSeriesId, IReadOnlyCollection<Guid> absorbedSeriesIds,
        CancellationToken token)
    {
        if (!await db.Series.AnyAsync(s => s.Id == targetSeriesId, token).ConfigureAwait(false))
            db.Series.Add(new SeriesEntity { Id = targetSeriesId });

        // ── Title links ──
        var targetTitleRows = await db.SeriesTitles
            .AsNoTracking()
            .Where(mt => mt.SeriesId == targetSeriesId)
            .ToListAsync(token).ConfigureAwait(false);
        var targetLiveTitleIds = targetTitleRows
            .Where(mt => ContributionVersions.IsLive(mt.Version))
            .Select(mt => mt.TitleId)
            .ToHashSet();
        var targetTitleIdsAny = targetTitleRows.Select(mt => mt.TitleId).ToHashSet();

        var absorbedTitleRows = await db.SeriesTitles
            .AsNoTracking()
            .Where(mt => absorbedSeriesIds.Contains(mt.SeriesId)
                && mt.Version != ContributionVersions.PendingDelete
                && mt.Version != ContributionVersions.UploadedDelete)
            .ToListAsync(token).ConfigureAwait(false);

        var addLinks = new List<SeriesTitleEntity>();
        var resurrectLinks = new List<(Guid SeriesId, Guid TitleId)>();
        var retireLinks = new List<(Guid SeriesId, Guid TitleId, bool Uploaded)>();

        foreach (var link in absorbedTitleRows)
        {
            if (targetLiveTitleIds.Add(link.TitleId))
            {
                if (targetTitleIdsAny.Contains(link.TitleId))
                    resurrectLinks.Add((targetSeriesId, link.TitleId));
                else
                    addLinks.Add(new SeriesTitleEntity
                    {
                        SeriesId = targetSeriesId,
                        TitleId = link.TitleId,
                        Version = ContributionVersions.AddOrUpdate,
                    });
            }
            retireLinks.Add((link.SeriesId, link.TitleId, link.Version == ContributionVersions.Uploaded));
        }

        if (addLinks.Count > 0)
            db.SeriesTitles.AddRange(addLinks);
        foreach (var (sid, tid) in resurrectLinks)
            await db.SeriesTitles
                .Where(mt => mt.SeriesId == sid && mt.TitleId == tid)
                .ExecuteUpdateAsync(s => s.SetProperty(mt => mt.Version, ContributionVersions.AddOrUpdate), token)
                .ConfigureAwait(false);
        foreach (var group in retireLinks.GroupBy(r => r.Uploaded))
        {
            var pairs = group.Select(r => (r.SeriesId, r.TitleId)).ToList();
            if (group.Key)
            {
                var seriesIds = pairs.Select(p => p.SeriesId).Distinct().ToList();
                var titleIds = pairs.Select(p => p.TitleId).Distinct().ToList();
                await db.SeriesTitles
                    .Where(mt => seriesIds.Contains(mt.SeriesId) && titleIds.Contains(mt.TitleId))
                    .ExecuteUpdateAsync(s => s.SetProperty(mt => mt.Version, ContributionVersions.PendingDelete), token)
                    .ConfigureAwait(false);
            }
            else
            {
                var seriesIds = pairs.Select(p => p.SeriesId).Distinct().ToList();
                var titleIds = pairs.Select(p => p.TitleId).Distinct().ToList();
                await db.SeriesTitles
                    .Where(mt => seriesIds.Contains(mt.SeriesId) && titleIds.Contains(mt.TitleId))
                    .ExecuteDeleteAsync(token).ConfigureAwait(false);
            }
        }

        // ── Metadata ──
        var targetMeta = await db.Metadata
            .AsNoTracking()
            .Where(m => m.SeriesId == targetSeriesId)
            .ToListAsync(token).ConfigureAwait(false);
        var metaByKey = new Dictionary<(int, string), ContributionMetadataEntity>();
        foreach (var m in targetMeta)
            if (ContributionVersions.IsLive(m.Version))
                metaByKey.TryAdd((m.ProviderId, m.ProviderKey ?? string.Empty), m);

        var absorbedMeta = await db.Metadata
            .AsNoTracking()
            .Where(m => absorbedSeriesIds.Contains(m.SeriesId)
                && m.Version != ContributionVersions.PendingDelete
                && m.Version != ContributionVersions.UploadedDelete)
            .ToListAsync(token).ConfigureAwait(false);

        var reparentMetaIds = new List<Guid>();
        var retireMetaUploadedIds = new List<Guid>();
        var retireMetaLocalIds = new List<Guid>();
        var targetUpgrades = new List<ContributionMetadataEntity>();

        foreach (var m in absorbedMeta)
        {
            var key = (m.ProviderId, m.ProviderKey ?? string.Empty);
            if (metaByKey.TryGetValue(key, out var existing))
            {
                if (Priority(m.MappingStatus) > Priority(existing.MappingStatus))
                {
                    existing.MappingStatus = m.MappingStatus;
                    existing.LinkedDate = m.LinkedDate;
                    existing.Version = ContributionVersions.AddOrUpdate;
                    targetUpgrades.Add(existing);
                }
                if (m.Version == ContributionVersions.Uploaded)
                    retireMetaUploadedIds.Add(m.Id);
                else
                    retireMetaLocalIds.Add(m.Id);
            }
            else
            {
                reparentMetaIds.Add(m.Id);
                metaByKey[key] = m;
            }
        }

        if (targetUpgrades.Count > 0)
        {
            var upgraded = targetUpgrades.ToList();
            db.Metadata.AttachRange(upgraded);
            foreach (var m in upgraded)
                db.Entry(m).Property(x => x.Version).IsModified = true;
        }
        foreach (var chunk in Chunk(reparentMetaIds, IdChunkSize))
        {
            var ids = chunk.ToList();
            await db.Metadata
                .Where(m => ids.Contains(m.Id))
                .ExecuteUpdateAsync(s => s
                    .SetProperty(m => m.SeriesId, targetSeriesId)
                    .SetProperty(m => m.Version, ContributionVersions.AddOrUpdate), token)
                .ConfigureAwait(false);
        }
        foreach (var chunk in Chunk(retireMetaUploadedIds, IdChunkSize))
        {
            var ids = chunk.ToList();
            await db.Metadata
                .Where(m => ids.Contains(m.Id))
                .ExecuteUpdateAsync(s => s.SetProperty(m => m.Version, ContributionVersions.PendingDelete), token)
                .ConfigureAwait(false);
        }
        foreach (var chunk in Chunk(retireMetaLocalIds, IdChunkSize))
        {
            var ids = chunk.ToList();
            await db.Metadata.Where(m => ids.Contains(m.Id)).ExecuteDeleteAsync(token).ConfigureAwait(false);
        }

        if (addLinks.Count > 0 || targetUpgrades.Count > 0)
            await db.SaveChangesAsync(token).ConfigureAwait(false);
    }

    private static IEnumerable<List<T>> Chunk<T>(IReadOnlyList<T> items, int size)
    {
        for (int i = 0; i < items.Count; i += size)
            yield return items.Skip(i).Take(size).ToList();
    }

    private static int Priority(RensaioBackend.Models.Database.SeriesMappingStatus status) => status switch
    {
        RensaioBackend.Models.Database.SeriesMappingStatus.UserConfirmed => 5,
        RensaioBackend.Models.Database.SeriesMappingStatus.Blocked => 4,
        RensaioBackend.Models.Database.SeriesMappingStatus.AutoMatched => 3,
        RensaioBackend.Models.Database.SeriesMappingStatus.ForeverIgnored => 2,
        RensaioBackend.Models.Database.SeriesMappingStatus.ManualIgnore => 1,
        _ => 0,
    };
}
