using System.Collections.Concurrent;

namespace KoodaamoJukebox.Api.Services
{
    class SemaphoreService
    {
        private readonly ConcurrentDictionary<string, SemaphoreSlim> _semaphores = new();

        public SemaphoreSlim GetSemaphore(string roomCode)
        {
            return _semaphores.GetOrAdd(roomCode, _ => new SemaphoreSlim(1, 1));
        }

        public void RemoveSemaphore(string roomCode)
        {
            if (_semaphores.TryRemove(roomCode, out var semaphore))
            {
                semaphore.Dispose();
            }
        }
    }
}
