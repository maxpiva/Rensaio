using RensaioBackend.Utils;
using Xunit;

namespace RensaioBackend.Tests;

public class KeyedAsyncLockTests
{
    [Fact]
    public async Task SameKeyNeverRunsTwoHoldersAtOnce()
    {
        var locker = new KeyedAsyncLock();
        int inside = 0, maxInside = 0;

        // Smoke test for mutual exclusion and cleanup under contention. The race the reference
        // count closes (a releaser removing a semaphore another caller just acquired) is too
        // narrow to hit reliably here; the old implementation also passes this test.
        await Task.WhenAll(Enumerable.Range(0, Environment.ProcessorCount * 4).Select(_ => Task.Run(async () =>
        {
            for (int i = 0; i < 2000; i++)
            {
                using (await locker.LockAsync("series"))
                {
                    int now = Interlocked.Increment(ref inside);
                    InterlockedMax(ref maxInside, now);
                    Thread.SpinWait(20);
                    Interlocked.Decrement(ref inside);
                }
            }
        })));

        Assert.Equal(1, maxInside);
        Assert.Equal(0, locker.Count);
    }

    [Fact]
    public async Task CancelledWaiterLeavesNoEntryBehind()
    {
        var locker = new KeyedAsyncLock();
        var held = await locker.LockAsync("k");
        using var cts = new CancellationTokenSource();
        Task waiting = locker.LockAsync("k", cts.Token);
        cts.Cancel();
        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => waiting);
        held.Dispose();
        Assert.Equal(0, locker.Count);
    }

    private static void InterlockedMax(ref int target, int value)
    {
        int current;
        while (value > (current = Volatile.Read(ref target)) &&
               Interlocked.CompareExchange(ref target, value, current) != current) { }
    }
}
