using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace RensaioBackend.Utils
{
    /// <summary>
    /// One async mutex per key. An entry is removed only when no caller holds or waits on it,
    /// so two callers can never end up with different semaphores for the same key.
    /// </summary>
    public class KeyedAsyncLock
    {
        private readonly Dictionary<string, Entry> _locks = new();

        private sealed class Entry
        {
            public readonly SemaphoreSlim Semaphore = new(1, 1);
            public int References; // holders plus waiters, guarded by _locks
        }

        /// <summary>Number of live keys; exposed for tests.</summary>
        internal int Count
        {
            get { lock (_locks) return _locks.Count; }
        }

        public async Task<IDisposable> LockAsync(string key, CancellationToken token = default)
        {
            Entry entry;
            lock (_locks)
            {
                if (!_locks.TryGetValue(key, out entry!))
                {
                    entry = new Entry();
                    _locks[key] = entry;
                }
                entry.References++;
            }
            try
            {
                await entry.Semaphore.WaitAsync(token).ConfigureAwait(false);
            }
            catch
            {
                Leave(key, entry);
                throw;
            }
            return new Releaser(this, key, entry);
        }

        private void Leave(string key, Entry entry)
        {
            lock (_locks)
            {
                if (--entry.References == 0)
                {
                    _locks.Remove(key);
                    entry.Semaphore.Dispose();
                }
            }
        }

        private sealed class Releaser : IDisposable
        {
            private readonly KeyedAsyncLock _parent;
            private readonly string _key;
            private readonly Entry _entry;
            private int _disposed;

            public Releaser(KeyedAsyncLock parent, string key, Entry entry)
            {
                _parent = parent;
                _key = key;
                _entry = entry;
            }

            public void Dispose()
            {
                if (Interlocked.Exchange(ref _disposed, 1) != 0) return;
                _entry.Semaphore.Release();
                _parent.Leave(_key, _entry);
            }
        }
    }
}
