using KoodaamoJukebox.Hubs;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using KoodaamoJukebox.Models;
using System.Collections.Concurrent;
using KoodaamoJukebox.Utilities;

namespace KoodaamoJukebox.Services
{
    public class QueueService
    {
        private readonly AppDbContext _dbContext;
        private readonly IHubContext<QueueHub> _hubContext;

        private static readonly ConcurrentDictionary<string, SemaphoreSlim> _semaphores = new();

        public QueueService(AppDbContext dbContext, IHubContext<QueueHub> hubContext)
        {
            _dbContext = dbContext;
            _hubContext = hubContext;
        }

        private SemaphoreSlim GetSemaphore(string instanceId)
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

        public async Task PauseResume(string instanceId, long sentAt, bool paused)
        {
            var semaphore = GetSemaphore(instanceId);
            await semaphore.WaitAsync();
            try
            {
                // if the sentAt difference is more than 5 seconds, ignore the request
                var currentTime = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                if (Math.Abs(currentTime - sentAt) > 5000)
                {
                    return;
                }

                var queue = await _dbContext.Queues
                    .Where(q => q.InstanceId == instanceId)
                    .FirstOrDefaultAsync();

                if (queue == null)
                {
                    throw new ArgumentException("Instance not found.", nameof(instanceId));
                }
                else if (queue.isPaused == paused)
                {
                    // If the state is already the same, do nothing
                    return;
                }

                await _hubContext.Clients.Group(instanceId).SendAsync("PauseResume", currentTime, paused);
            }
            finally
            {
                semaphore.Release();
            }
        }

        public async Task Skip(string instanceId, int index)
        {
            var semaphore = GetSemaphore(instanceId);
            await semaphore.WaitAsync();
            try
            {
                if (index < 0)
                {
                    throw new ArgumentOutOfRangeException(nameof(index), "Index must be a non-negative integer.");
                }

                var indexIsValid = await _dbContext.QueueItems.AnyAsync(qi => qi.InstanceId == instanceId && qi.Index == index && !qi.IsDeleted);
                if (!indexIsValid)
                {
                    throw new ArgumentOutOfRangeException(nameof(index), "Index is not valid for the current queue.");
                }

                await _dbContext.Queues
                    .Where(q => q.InstanceId == instanceId)
                    .ExecuteUpdateAsync(q => q
                        .SetProperty(q => q.CurrentTrackIndex, index)
                        .SetProperty(q => q.PlayingSince, (long?)null)
                        .SetProperty(q => q.isPaused, true));

                var playingSince = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() + 500;

                // Send skip command to the group
                await _hubContext.Clients.Group(instanceId).SendAsync("Skip", playingSince, index);
            }
            finally
            {
                semaphore.Release();
            }
        }

        public async Task Move(string instanceId, int from, int to)
        {
            var semaphore = GetSemaphore(instanceId);
            await semaphore.WaitAsync();
            try
            {
                var startTime = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

                if (from < 0 || to < 0)
                {
                    throw new ArgumentOutOfRangeException("Indices must be non-negative integers.");
                }

                var queue = await _dbContext.Queues
                    .Where(q => q.InstanceId == instanceId)
                    .FirstOrDefaultAsync();

                if (queue == null)
                {
                    throw new ArgumentException("Instance not found.", nameof(instanceId));
                }

                var queueList = await _dbContext.QueueItems
                    .Where(qi => qi.InstanceId == instanceId && !qi.IsDeleted)
                    .OrderBy(qi => qi.Index)
                    .ToListAsync();

                if (queueList.Count == 0)
                {
                    throw new InvalidOperationException("The queue is empty.");
                }

                if (from >= queueList.Count || to >= queueList.Count)
                {
                    throw new ArgumentOutOfRangeException("Indices are out of range of the current queue.");
                }

                if (from == to)
                {
                    // If the indices are the same, do nothing
                    return;
                }

                if (queue.CurrentTrackIndex == from)
                {
                    // If the current track index is being moved, update it to the new index
                    queue.CurrentTrackIndex = to;
                }
                else if (queue.CurrentTrackIndex > from && queue.CurrentTrackIndex <= to)
                {
                    // If the current track index is between the from and to indices, decrement it
                    queue.CurrentTrackIndex--;
                }
                else if (queue.CurrentTrackIndex < from && queue.CurrentTrackIndex >= to)
                {
                    // If the current track index is between the to and from indices, increment it
                    queue.CurrentTrackIndex++;
                }

                var movedItem = queueList[from];
                movedItem.Index = to;


                _dbContext.QueueItems.Update(movedItem);
                _dbContext.Queues.Update(queue);
                await _dbContext.SaveChangesAsync();

                // important: to make sure the client wont have to fetch shifted items
                var endTime = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

                queueList.RemoveAt(from);
                queueList.Insert(to, movedItem);

                // Re-assign indices to reflect the new order
                for (int i = 0; i < queueList.Count; i++)
                {
                    queueList[i].Index = i;
                }

                _dbContext.Queues.Update(queue);
                _dbContext.QueueItems.UpdateRange(queueList);
                await _dbContext.SaveChangesAsync();

                // Send move command to the group
                await _hubContext.Clients.Group(instanceId).SendAsync("QueueChange", startTime, endTime, queue.CurrentTrackIndex);
            }
            finally
            {
                semaphore.Release();
            }
        }

        public async Task Add(string instanceId, string urlOrQuery)
        {
            var semaphore = GetSemaphore(instanceId);
            await semaphore.WaitAsync();
            try
            {
                var startTime = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

                if (string.IsNullOrWhiteSpace(urlOrQuery))
                {
                    throw new ArgumentException("URL/Query cannot be null or empty.", nameof(urlOrQuery));
                }

                var queue = await _dbContext.Queues
                    .Where(q => q.InstanceId == instanceId)
                    .FirstOrDefaultAsync();

                if (queue == null)
                {
                    throw new ArgumentException("Instance not found.", nameof(instanceId));
                }

                var tracks = await YtDlp.GetTracks(urlOrQuery);
                if (tracks == null || tracks.Length == 0)
                {
                    throw new ArgumentException("No valid tracks found for the provided URL/Query.", nameof(urlOrQuery));
                }

                // Deduplicate tracks by TrackId
                var uniqueTracks = tracks.GroupBy(t => t.TrackId).Select(g => g.First()).ToList();
                var trackIds = uniqueTracks.Select(t => t.TrackId).ToList();

                var existingTracks = await _dbContext.Tracks
                    .Where(t => trackIds.Contains(t.TrackId))
                    .ToDictionaryAsync(t => t.TrackId);

                foreach (var track in uniqueTracks)
                {
                    if (existingTracks.TryGetValue(track.TrackId, out var existingTrack))
                    {
                        bool updated = false;
                        if (existingTrack.Title != track.Title)
                        {
                            existingTrack.Title = track.Title;
                            updated = true;
                        }
                        if (existingTrack.Uploader != track.Uploader)
                        {
                            existingTrack.Uploader = track.Uploader;
                            updated = true;
                        }
                        if (existingTrack.AlbumArt != track.AlbumArt)
                        {
                            existingTrack.AlbumArt = track.AlbumArt;
                            updated = true;
                        }
                        if (updated)
                        {
                            _dbContext.Tracks.Update(existingTrack);
                        }
                        // If no changes, skip updating
                    }
                    else
                    {
                        await _dbContext.Tracks.AddAsync(track);
                    }
                }

                await _dbContext.SaveChangesAsync();

                // move the track indexes to the right of the current index
                var itemsToShift = await _dbContext.QueueItems
                    .Where(qi => qi.InstanceId == instanceId && qi.Index > queue.CurrentTrackIndex && !qi.IsDeleted)
                    .OrderBy(qi => qi.Index)
                    .ToListAsync();

                for (int i = 0; i < itemsToShift.Count; i++)
                {
                    itemsToShift[i].Index += trackIds.Count;
                }

                // Add new items to the queue
                var newItems = trackIds.Select((videoId, index) => new QueueItem
                {
                    InstanceId = instanceId,
                    TrackId = videoId,
                    Index = queue.CurrentTrackIndex + index + 1, // Insert after the current track
                    IsDeleted = false,
                }).ToList();

                await _dbContext.QueueItems.AddRangeAsync(newItems);
                await _dbContext.SaveChangesAsync();

                // important: to make sure the client wont have to fetch shifted items
                var endTime = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

                _dbContext.QueueItems.UpdateRange(itemsToShift);
                await _dbContext.SaveChangesAsync();

                await _hubContext.Clients.Group(instanceId).SendAsync("QueueChange", startTime, endTime, queue.CurrentTrackIndex);
            }
            finally
            {
                semaphore.Release();
            }
        }

        public async Task Remove(string instanceId, int id)
        {
            var semaphore = GetSemaphore(instanceId);
            await semaphore.WaitAsync();
            try
            {
                var startTime = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

                if (id < 0)
                {
                    throw new ArgumentOutOfRangeException(nameof(id), "ID must be a non-negative integer.");
                }

                var queue = await _dbContext.Queues
                    .Where(q => q.InstanceId == instanceId)
                    .FirstOrDefaultAsync();
                if (queue == null)
                {
                    throw new ArgumentException("Instance not found.", nameof(instanceId));
                }

                var item = await _dbContext.QueueItems.FindAsync(id);

                if (item == null)
                {
                    throw new ArgumentException("Item not found.", nameof(id));
                }
                else if (item.InstanceId != instanceId)
                {
                    throw new ArgumentException("Item does not belong to the specified instance.", nameof(instanceId));
                }
                item.IsDeleted = true;
                _dbContext.QueueItems.Update(item);
                await _dbContext.SaveChangesAsync();

                // important: to make sure the client wont have to fetch shifted items
                var endTime = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

                // Only update indices of items to the right of the deleted item
                var itemsToUpdate = await _dbContext.QueueItems
                    .Where(qi => qi.InstanceId == instanceId && qi.Index > item.Index && !qi.IsDeleted)
                    .OrderBy(qi => qi.Index)
                    .ToListAsync();

                for (int i = 0; i < itemsToUpdate.Count; i++)
                {
                    itemsToUpdate[i].Index = item.Index + 1 + i - 1; // shift left by 1
                }
                _dbContext.QueueItems.UpdateRange(itemsToUpdate);
                await _dbContext.SaveChangesAsync();

                // Send remove command to the group
                await _hubContext.Clients.Group(instanceId).SendAsync("QueueChange", startTime, endTime, queue.CurrentTrackIndex);
            }
            finally
            {
                semaphore.Release();
            }
        }
    }
}
