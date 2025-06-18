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
        private readonly IHubContext<RoomHub> _hubContext;

        private static readonly ConcurrentDictionary<string, SemaphoreSlim> _semaphores = new();

        public QueueService(AppDbContext dbContext, IHubContext<RoomHub> hubContext)
        {
            _dbContext = dbContext;
            _hubContext = hubContext;
        }

        private SemaphoreSlim GetSemaphore(string roomCode)
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

        public async Task Pause(string roomCode, bool paused)
        {
            var semaphore = GetSemaphore(roomCode);
            await semaphore.WaitAsync();
            try
            {
                var currentTime = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

                var queue = await _dbContext.RoomInfos
                    .Where(q => q.RoomCode == roomCode)
                    .FirstOrDefaultAsync();

                if (queue == null)
                {
                    throw new ArgumentException("Instance not found.", nameof(roomCode));
                }
                else if (queue.IsPaused == paused && queue.PlayingSince.HasValue)
                {
                    // If the state is already the same, do nothing
                    return;
                }

                queue.IsPaused = paused;
                if (paused)
                {
                    queue.PausedAt = currentTime;
                }
                else if (!queue.PlayingSince.HasValue)
                {
                    queue.PlayingSince = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() + 500;
                }
                else
                {
                    queue.PlayingSince += currentTime - queue.PausedAt ?? 0;
                    queue.PlayingSince -= 250; // Adjust to account for the time it takes to process the request
                }
                await _dbContext.SaveChangesAsync();

                await _hubContext.Clients.Group(roomCode).SendAsync("RoomUpdate", new RoomInfoDto(queue), Array.Empty<QueueItemDto>());
            }
            finally
            {
                semaphore.Release();
            }
        }

        public async Task Seek(string roomCode, int seekTime)
        {
            var semaphore = GetSemaphore(roomCode);
            await semaphore.WaitAsync();
            try
            {
                if (seekTime < 0)
                {
                    throw new ArgumentOutOfRangeException(nameof(seekTime), "Seek time must be a non-negative integer.");
                }

                long currentTime = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

                var roomInfo = await _dbContext.RoomInfos
                    .Where(q => q.RoomCode == roomCode)
                    .FirstOrDefaultAsync() ?? throw new ArgumentException("Instance not found.", nameof(roomCode));
                if (!roomInfo.PlayingSince.HasValue)
                {
                    roomInfo.PlayingSince = currentTime;
                }
                if (roomInfo.IsPaused) {
                    roomInfo.PausedAt = currentTime;
                }

                long elapsedTime = currentTime - (roomInfo.PlayingSince ?? currentTime);
                roomInfo.PlayingSince += elapsedTime - seekTime * 1000;
                await _dbContext.SaveChangesAsync();

                await _hubContext.Clients.Group(roomCode).SendAsync("RoomUpdate", new RoomInfoDto(roomInfo), Array.Empty<QueueItemDto>());
            }
            finally
            {
                semaphore.Release();
            }
        }

        public async Task Loop(string roomCode, bool loop)
        {
            var semaphore = GetSemaphore(roomCode);
            await semaphore.WaitAsync();
            try
            {
                var queue = await _dbContext.RoomInfos
                    .Where(q => q.RoomCode == roomCode)
                    .FirstOrDefaultAsync() ?? throw new ArgumentException("Instance not found.", nameof(roomCode));
                if (queue.IsLooping == loop)
                {
                    // If the state is already the same, do nothing
                    return;
                }

                queue.IsLooping = loop;
                await _dbContext.SaveChangesAsync();

                await _hubContext.Clients.Group(roomCode).SendAsync("RoomUpdate", new RoomInfoDto(queue), Array.Empty<QueueItemDto>());
            }
            finally
            {
                semaphore.Release();
            }
        }

        public async Task Skip(string roomCode, int index)
        {
            var semaphore = GetSemaphore(roomCode);
            await semaphore.WaitAsync();
            try
            {
                if (index < 0)
                {
                    throw new ArgumentOutOfRangeException(nameof(index), "Index must be a non-negative integer.");
                }

                var queue = await _dbContext.RoomInfos
                    .Where(q => q.RoomCode == roomCode)
                    .FirstOrDefaultAsync() ?? throw new ArgumentException("Instance not found.", nameof(roomCode));
                if (queue.CurrentTrackIndex == index)
                {
                    // If the current track index is already the same, do nothing
                    return;
                }

                var indexIsValid = await _dbContext.QueueItems.AnyAsync(qi => qi.RoomCode == roomCode && (queue.IsShuffled ? qi.ShuffleIndex : qi.Index) == index && !qi.IsDeleted);
                if (!indexIsValid)
                {
                    throw new ArgumentOutOfRangeException(nameof(index), "Index is not valid for the current queue.");
                }

                queue.CurrentTrackIndex = index;
                queue.IsPaused = false;
                queue.PlayingSince = null;
                
                await _dbContext.SaveChangesAsync();

                await _hubContext.Clients.Group(roomCode).SendAsync("RoomUpdate", new RoomInfoDto(queue), Array.Empty<QueueItemDto>());
            }
            finally
            {
                semaphore.Release();
            }
        }

        public async Task Move(string roomCode, int from, int to)
        {
            var semaphore = GetSemaphore(roomCode);
            await semaphore.WaitAsync();
            try
            {
                if (from < 0 || to < 0)
                {
                    throw new ArgumentOutOfRangeException("Indices must be non-negative integers.");
                }

                var queue = await _dbContext.RoomInfos
                    .Where(q => q.RoomCode == roomCode)
                    .FirstOrDefaultAsync() ?? throw new ArgumentException("Instance not found.", nameof(roomCode));
                var queueList = await _dbContext.QueueItems
                    .Where(qi => qi.RoomCode == roomCode && !qi.IsDeleted)
                    .OrderBy(qi => queue.IsShuffled ? qi.ShuffleIndex : qi.Index)
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
                if (queue.IsShuffled)
                {
                    movedItem.ShuffleIndex = to;
                }
                else
                {
                    movedItem.Index = to;
                }

                queueList.RemoveAt(from);
                queueList.Insert(to, movedItem);

                // Re-assign indices to reflect the new order
                for (int i = 0; i < queueList.Count; i++)
                {
                    if (queue.IsShuffled)
                    {
                        queueList[i].ShuffleIndex = i;
                    }
                    else
                    {
                        queueList[i].Index = i;
                    }
                }

                _dbContext.RoomInfos.Update(queue);
                _dbContext.QueueItems.UpdateRange(queueList);
                await _dbContext.SaveChangesAsync();

                var updatedItems = queueList.Select(i => new QueueItemDto(i)).ToList();

                // Send move command to the group
                await _hubContext.Clients.Group(roomCode).SendAsync("RoomUpdate", new RoomInfoDto(queue), updatedItems);
            }
            finally
            {
                semaphore.Release();
            }
        }

        public async Task Add(string roomCode, string urlOrQuery)
        {
            var semaphore = GetSemaphore(roomCode);
            await semaphore.WaitAsync();
            try
            {
                if (string.IsNullOrWhiteSpace(urlOrQuery))
                {
                    throw new ArgumentException("URL/Query cannot be null or empty.", nameof(urlOrQuery));
                }

                var queue = await _dbContext.RoomInfos
                    .Where(q => q.RoomCode == roomCode)
                    .FirstOrDefaultAsync() ?? throw new ArgumentException("Instance not found.", nameof(roomCode));
                var updatedItems = new List<QueueItemDto>();

                var tracks = await YtDlp.GetTracks(urlOrQuery);
                if (tracks == null || tracks.Length == 0)
                {
                    throw new ArgumentException("No valid tracks found for the provided URL/Query.", nameof(urlOrQuery));
                }

                // Deduplicate tracks by TrackId
                var uniqueTracks = tracks.GroupBy(t => t.WebpageUrlHash).Select(g => g.First()).ToList();
                var trackIds = uniqueTracks.Select(t => t.WebpageUrlHash).ToList();

                var existingTracks = await _dbContext.Tracks
                    .Where(t => trackIds.Contains(t.WebpageUrlHash))
                    .ToDictionaryAsync(t => t.WebpageUrlHash);

                foreach (var track in uniqueTracks)
                {
                    if (existingTracks.TryGetValue(track.WebpageUrlHash, out var existingTrack))
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
                        if (existingTrack.ThumbnailHigh != track.ThumbnailHigh)
                        {
                            existingTrack.ThumbnailHigh = track.ThumbnailHigh;
                            updated = true;
                        }
                        if (existingTrack.ThumbnailLow != track.ThumbnailLow)
                        {
                            existingTrack.ThumbnailLow = track.ThumbnailLow;
                            updated = true;
                        }
                        if (existingTrack.Type != track.Type)
                        {
                            existingTrack.Type = track.Type;
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

                // insert new items into the queue to be played next
                var queueItems = await _dbContext.QueueItems
                    .Where(qi => qi.RoomCode == roomCode && !qi.IsDeleted)
                    .ToListAsync();

                int insertIndex = queue.CurrentTrackIndex ?? -1;
                int insertUnshuffledIndex = insertIndex;
                int insertShuffledIndex = insertIndex;

                // Find the current track's unshuffled index (for shuffled mode)
                if (queue.IsShuffled)
                {
                    var currentTrack = queueItems.FirstOrDefault(qi => qi.ShuffleIndex == insertIndex);
                    if (currentTrack != null)
                    {
                        insertUnshuffledIndex = currentTrack.Index;
                    }
                }

                // Shift indices of items after the insertion point
                if (queue.IsShuffled)
                {
                    foreach (var item in queueItems)
                    {
                        if (item.ShuffleIndex.HasValue && item.ShuffleIndex > insertShuffledIndex)
                        {
                            item.ShuffleIndex += uniqueTracks.Count;
                        }
                        if (item.Index > insertUnshuffledIndex)
                        {
                            item.Index += uniqueTracks.Count;
                        }
                    }
                }
                else
                {
                    foreach (var item in queueItems)
                    {
                        if (item.Index > insertIndex)
                        {
                            item.Index += uniqueTracks.Count;
                        }
                    }
                }

                // Insert new items at the correct position
                var newQueueItems = new List<QueueItem>();
                for (int i = 0; i < uniqueTracks.Count; i++)
                {
                    var track = uniqueTracks[i];
                    var queueItem = new QueueItem
                    {
                        RoomCode = roomCode,
                        TrackId = track.WebpageUrlHash,
                        IsDeleted = false,
                        Index = (queue.IsShuffled ? insertUnshuffledIndex : insertIndex) + 1 + i,
                        ShuffleIndex = queue.IsShuffled ? insertShuffledIndex + 1 + i : null
                    };
                    newQueueItems.Add(queueItem);
                }
                await _dbContext.QueueItems.AddRangeAsync(newQueueItems);
                // Update all shifted items
                _dbContext.QueueItems.UpdateRange(queueItems);

                if (queue.CurrentTrackIndex == null && newQueueItems.Count > 0)
                {
                    // If the queue was empty, set the current track to the first added item
                    queue.CurrentTrackIndex = newQueueItems[0].ShuffleIndex ?? newQueueItems[0].Index;
                }

                await _dbContext.SaveChangesAsync();

                // Prepare updated items for client
                updatedItems.AddRange(newQueueItems.Select(i => new QueueItemDto(i)));
                updatedItems.AddRange(queueItems.Select(i => new QueueItemDto(i)));

                await _hubContext.Clients.Group(roomCode).SendAsync("RoomUpdate", new RoomInfoDto(queue), updatedItems);
            }
            finally
            {
                semaphore.Release();
            }
        }

        public async Task Remove(string roomCode, int id)
        {
            var semaphore = GetSemaphore(roomCode);
            await semaphore.WaitAsync();
            try
            {
                if (id < 0)
                {
                    throw new ArgumentOutOfRangeException(nameof(id), "ID must be a non-negative integer.");
                }

                var queue = await _dbContext.RoomInfos
                    .Where(q => q.RoomCode == roomCode)
                    .FirstOrDefaultAsync() ?? throw new ArgumentException("Instance not found.", nameof(roomCode));
                var item = await _dbContext.QueueItems.FindAsync(id);

                if (item == null)
                {
                    throw new ArgumentException("Item not found.", nameof(id));
                }
                else if (item.RoomCode != roomCode)
                {
                    throw new ArgumentException("Item does not belong to the specified room code", nameof(roomCode));
                }
                else if (queue.IsShuffled
                    ? item.ShuffleIndex == queue.CurrentTrackIndex
                    : item.Index == queue.CurrentTrackIndex
                )
                {
                    throw new InvalidOperationException("Cannot remove the current track from the queue.");
                }
                item.IsDeleted = true;
                _dbContext.QueueItems.Update(item);
                await _dbContext.SaveChangesAsync();

                // important: to make sure the client wont have to fetch shifted items
                var endTime = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

                // Only update indices of items to the right of the deleted item
                var itemsToUpdate = await _dbContext.QueueItems
                    .Where(qi => qi.RoomCode == roomCode &&
                        (queue.IsShuffled ? qi.ShuffleIndex > item.ShuffleIndex : qi.Index > item.Index) &&
                        !qi.IsDeleted)
                    .OrderBy(qi => queue.IsShuffled ? qi.ShuffleIndex : qi.Index)
                    .ToListAsync();

                for (int i = 0; i < itemsToUpdate.Count; i++)
                {
                    if (queue.IsShuffled)
                    {
                        itemsToUpdate[i].ShuffleIndex = item.ShuffleIndex + i; // shift left by 1
                    }
                    else
                    {
                        itemsToUpdate[i].Index = item.Index + i; // shift left by 1
                    }
                }
                _dbContext.QueueItems.UpdateRange(itemsToUpdate);
                await _dbContext.SaveChangesAsync();

                var updatedItems = itemsToUpdate.Select(i => new QueueItemDto(i)).ToList();
                updatedItems.Insert(0, new QueueItemDto(item)); // Include the removed item in the update

                // Send remove command to the group
                await _hubContext.Clients.Group(roomCode).SendAsync("RoomUpdate", new RoomInfoDto(queue), updatedItems);
            }
            finally
            {
                semaphore.Release();
            }
        }

        public async Task Shuffle(string roomCode, bool shuffled)
        {
            var semaphore = GetSemaphore(roomCode);
            await semaphore.WaitAsync();
            try
            {
                var roomInfo = await _dbContext.RoomInfos
                    .Where(q => q.RoomCode == roomCode)
                    .FirstOrDefaultAsync() ?? throw new ArgumentException("Instance not found.", nameof(roomCode));
                if (roomInfo.IsShuffled == shuffled)
                {
                    // If the state is already the same, do nothing
                    return;
                }

                var queueItems = await _dbContext.QueueItems
                    .Where(qi => qi.RoomCode == roomCode && !qi.IsDeleted)
                    .ToListAsync();

                if (queueItems.Count == 0)
                {
                    throw new InvalidOperationException("The queue is empty.");
                }

                roomInfo.IsShuffled = shuffled;
                if (shuffled)
                {
                    var currentTrack = queueItems
                        .FirstOrDefault(qi => qi.Index == roomInfo.CurrentTrackIndex && !qi.IsDeleted);
                    if (currentTrack != null)
                    {
                        queueItems.Remove(currentTrack);
                    }

                    var rng = new Random();
                    var shuffledItems = queueItems
                        .OrderBy(x => rng.Next())
                        .ToList();
                    if (currentTrack != null)
                    {
                        shuffledItems.Insert(0, currentTrack);
                    }

                    for (int i = 0; i < shuffledItems.Count; i++)
                    {
                        shuffledItems[i].ShuffleIndex = i;
                    }

                    roomInfo.CurrentTrackIndex = 0;
                    _dbContext.QueueItems.UpdateRange(shuffledItems);
                }
                else
                {
                    var currentTrack = queueItems
                        .FirstOrDefault(qi => qi.ShuffleIndex == roomInfo.CurrentTrackIndex && !qi.IsDeleted);

                    for (int i = 0; i < queueItems.Count; i++)
                    {
                        queueItems[i].ShuffleIndex = null;
                    }

                    if (currentTrack != null)
                    {
                        roomInfo.CurrentTrackIndex = currentTrack.Index;
                    }

                    _dbContext.QueueItems.UpdateRange(queueItems);
                }
                _dbContext.RoomInfos.Update(roomInfo);

                await _dbContext.SaveChangesAsync();

                var updatedItems = queueItems.Select(i => new QueueItemDto(i)).ToList();
                await _hubContext.Clients.Group(roomCode).SendAsync("RoomUpdate", new RoomInfoDto(roomInfo), updatedItems);
            }
            finally
            {
                semaphore.Release();
            }
        }

        public async Task Clear(string roomCode)
        {
            var semaphore = GetSemaphore(roomCode);
            await semaphore.WaitAsync();
            try
            {
                var queue = await _dbContext.RoomInfos
                    .Where(q => q.RoomCode == roomCode)
                    .FirstOrDefaultAsync() ?? throw new ArgumentException("Instance not found.", nameof(roomCode));
                var items = await _dbContext.QueueItems
                    .Where(qi => qi.RoomCode == roomCode && qi.Index != queue.CurrentTrackIndex && !qi.IsDeleted)
                    .ToListAsync();

                var currentItem = await _dbContext.QueueItems
                    .Where(qi => qi.RoomCode == roomCode && qi.Index == queue.CurrentTrackIndex && !qi.IsDeleted)
                    .FirstOrDefaultAsync() ?? throw new ArgumentException("Current track not found.", nameof(roomCode));
                foreach (var item in items)
                {
                    item.IsDeleted = true;
                    _dbContext.QueueItems.Update(item);
                }

                queue.CurrentTrackIndex = 0;
                currentItem.Index = 0;

                if (queue.IsShuffled)
                {
                    currentItem.ShuffleIndex = 0;
                }

                _dbContext.QueueItems.Update(currentItem);
                _dbContext.RoomInfos.Update(queue);

                await _dbContext.SaveChangesAsync();

                var updatedItems = new List<QueueItemDto>
                {
                    new QueueItemDto(currentItem)
                };
                foreach (var item in items)
                {
                    updatedItems.Add(new QueueItemDto(item));
                }

                await _hubContext.Clients.Group(roomCode).SendAsync("RoomUpdate", new RoomInfoDto(queue), updatedItems);
            }
            finally
            {
                semaphore.Release();
            }
        }
    }
}
