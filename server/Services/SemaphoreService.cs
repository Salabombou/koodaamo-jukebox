using System.Collections.Concurrent;

namespace KoodaamoJukebox.Services
{
    class SemaphoreService
    {
        private readonly ConcurrentDictionary<string, SemaphoreSlim> _semaphores = new();

        public SemaphoreSlim GetSemaphore(string instanceId)
        {
            return _semaphores.GetOrAdd(instanceId, _ => new SemaphoreSlim(1, 1));
        }

        public void RemoveSemaphore(string instanceId)
        {
            if (_semaphores.TryRemove(instanceId, out var semaphore))
            {
                semaphore.Dispose();
            }
        }
    }
}
