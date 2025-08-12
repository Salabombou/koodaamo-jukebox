using KoodaamoJukebox.Api.Hubs;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using KoodaamoJukebox.Database.Models;
using KoodaamoJukebox.Api.Utilities;
using KoodaamoJukebox.Database;

namespace KoodaamoJukebox.Api.Services
{
    public class QueueService
    {
        private readonly KoodaamoJukeboxDbContext _dbContext;
        private readonly IHubContext<RoomHub> _hubContext;
        private readonly YtDlp _ytDlp;

        public QueueService(KoodaamoJukeboxDbContext dbContext, IHubContext<RoomHub> hubContext, IConfiguration configuration)
        {
            _dbContext = dbContext;
            _hubContext = hubContext;
            _ytDlp = new YtDlp(configuration);
        }

        public async Task Pause(string roomCode, bool paused, long? pausedAt = null)
        {

            var currentTime = pausedAt ?? DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

            var queue = await _dbContext.RoomInfos
                .Where(q => q.RoomCode == roomCode)
                .FirstOrDefaultAsync();

            if (queue == null)
            {
                throw new ArgumentException("Instance not found.", nameof(roomCode));
            }
            if (queue.IsPaused == paused && queue.PlayingSince.HasValue)
            {
                // If the state is already the same, do nothing
                return;
            }

            if (paused)
            {
                // Pausing: set PausedAt to sentAt (client time)
                queue.PausedAt = currentTime;
                queue.IsPaused = true;
            }
            else
            {
                // Unpausing: adjust PlayingSince by paused duration
                if (queue.PausedAt.HasValue && queue.PlayingSince.HasValue)
                {
                    queue.PlayingSince += currentTime - queue.PausedAt.Value;
                }
                else if (!queue.PlayingSince.HasValue)
                {
                    queue.PlayingSince = currentTime + 500; // fallback for missing value
                }
                queue.PausedAt = null;
                queue.IsPaused = false;
            }

            if (string.IsNullOrEmpty(queue.CurrentItemTrackId) || !queue.CurrentItemIndex.HasValue || !queue.CurrentItemId.HasValue)
            {
                queue.PlayingSince = null;
            }

            await _dbContext.SaveChangesAsync();

            await _hubContext.Clients.Group(roomCode).SendAsync("PauseToggled", new PauseToggledEvent
            {
                RoomCode = roomCode,
                IsPaused = queue.IsPaused,
                PlayingSince = queue.PlayingSince,
            });
        }

        public async Task Seek(string roomCode, int seekTime)
        {

            if (seekTime < 0)
            {
                throw new ArgumentException(nameof(seekTime), "Seek time must be a non-negative integer.");
            }

            long currentTime = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

            var roomInfo = await _dbContext.RoomInfos
                .Where(q => q.RoomCode == roomCode)
                .FirstOrDefaultAsync() ?? throw new ArgumentException("Instance not found.", nameof(roomCode));

            if (!roomInfo.PlayingSince.HasValue)
            {
                roomInfo.PlayingSince = currentTime;
            }
            if (roomInfo.IsPaused)
            {
                roomInfo.PausedAt = currentTime;
            }

            long elapsedTime = currentTime - (roomInfo.PlayingSince ?? currentTime);
            roomInfo.PlayingSince += elapsedTime - seekTime * 1000;
            await _dbContext.SaveChangesAsync();

            await _hubContext.Clients.Group(roomCode).SendAsync("TrackSeeked", new TrackSeekedEvent
            {
                RoomCode = roomCode,
                PlayingSince = roomInfo.PlayingSince,
            });
        }

        public async Task Loop(string roomCode, bool loop)
        {
            var queue = await _dbContext.RoomInfos
                .Where(q => q.RoomCode == roomCode)
                .FirstOrDefaultAsync() ?? throw new ArgumentException("Instance not found.", nameof(roomCode));
            if (queue.IsLooping == loop)
            {
                return;
            }

            queue.IsLooping = loop;
            await _dbContext.SaveChangesAsync();

            await _hubContext.Clients.Group(roomCode).SendAsync("LoopToggled", new LoopToggledEvent
            {
                RoomCode = roomCode,
                IsLooping = loop
            });
        }

        public async Task Skip(string roomCode, int index)
        {

            if (index < 0)
            {
                throw new ArgumentException(nameof(index), "Index must be a non-negative integer.");
            }

            var queue = await _dbContext.RoomInfos
                .Where(q => q.RoomCode == roomCode)
                .FirstOrDefaultAsync() ?? throw new ArgumentException("Instance not found.", nameof(roomCode));

            // Check if we're already at the requested index (considering shuffle state)
            var currentIndex = queue.IsShuffled ? queue.CurrentItemShuffleIndex : queue.CurrentItemIndex;
            if (currentIndex == index)
            {
                // If the current track index is already the same, do nothing
                return;
            }

            var currentItem = await _dbContext.QueueItems.FirstOrDefaultAsync(qi => qi.RoomCode == roomCode && (queue.IsShuffled ? qi.ShuffleIndex : qi.Index) == index && !qi.IsDeleted);
            if (currentItem == null)
            {
                throw new ArgumentException(nameof(index), "Index is not valid for the current queue.");
            }

            if (queue.IsShuffled)
            {
                queue.CurrentItemShuffleIndex = index;
                queue.CurrentItemIndex = index; // Visual position matches shuffle position
            }
            else
            {
                queue.CurrentItemIndex = index;
                queue.CurrentItemShuffleIndex = null;
            }

            queue.CurrentItemId = currentItem.Id;
            queue.CurrentItemTrackId = currentItem.TrackId;

            queue.PausedAt = null;
            queue.PlayingSince = null;

            await _dbContext.SaveChangesAsync();

            await _hubContext.Clients.Group(roomCode).SendAsync("TrackSkipped", new TrackSkippedEvent
            {
                RoomCode = roomCode,
                CurrentItemId = queue.CurrentItemId,
                CurrentItemIndex = queue.CurrentItemIndex,
                CurrentItemShuffleIndex = queue.CurrentItemShuffleIndex,
                CurrentItemTrackId = queue.CurrentItemTrackId,
            });
        }

        public async Task Move(string roomCode, int from, int to)
        {
            if (from < 0 || to < 0)
            {
                throw new ArgumentException("Indices must be non-negative integers.");
            }

            if (from == to)
            {
                return;
            }

            var roomInfo = await _dbContext.RoomInfos
                .Where(q => q.RoomCode == roomCode)
                .FirstOrDefaultAsync() ?? throw new ArgumentException("Instance not found.", nameof(roomCode));
            var queueList = await _dbContext.QueueItems
                .Where(qi => qi.RoomCode == roomCode && !qi.IsDeleted)
                .OrderBy(qi => roomInfo.IsShuffled ? qi.ShuffleIndex : qi.Index)
                .ToListAsync();

            if (queueList.Count == 0)
            {
                throw new InvalidOperationException("The queue is empty.");
            }

            if (from >= queueList.Count || to >= queueList.Count)
            {
                throw new ArgumentException("Indices are out of range of the current queue.");
            }

            var movedItem = queueList[from];

            if (roomInfo.IsShuffled)
            {
                movedItem.ShuffleIndex = to;
                if (roomInfo.CurrentItemShuffleIndex == from)
                {
                    roomInfo.CurrentItemShuffleIndex = to;
                    roomInfo.CurrentItemIndex = to; // Update visual position as well
                }
                else if (from < roomInfo.CurrentItemShuffleIndex && to >= roomInfo.CurrentItemShuffleIndex)
                {
                    roomInfo.CurrentItemShuffleIndex--;
                    roomInfo.CurrentItemIndex--;
                }
                else if (from > roomInfo.CurrentItemShuffleIndex && to <= roomInfo.CurrentItemShuffleIndex)
                {
                    roomInfo.CurrentItemShuffleIndex++;
                    roomInfo.CurrentItemIndex++;
                }
            }
            else
            {
                movedItem.Index = to;
                movedItem.ShuffleIndex = null;
                if (roomInfo.CurrentItemIndex == from)
                {
                    roomInfo.CurrentItemIndex = to;
                }
                else if (from < roomInfo.CurrentItemIndex && to >= roomInfo.CurrentItemIndex)
                {
                    roomInfo.CurrentItemIndex--;
                }
                else if (from > roomInfo.CurrentItemIndex && to <= roomInfo.CurrentItemIndex)
                {
                    roomInfo.CurrentItemIndex++;
                }
                roomInfo.CurrentItemShuffleIndex = null;
            }

            queueList.RemoveAt(from);
            queueList.Insert(to, movedItem);

            for (int i = 0; i < queueList.Count; i++)
            {
                if (roomInfo.IsShuffled)
                {
                    queueList[i].ShuffleIndex = i;
                }
                else
                {
                    queueList[i].Index = i;
                    queueList[i].ShuffleIndex = null;
                }
            }

            _dbContext.RoomInfos.Update(roomInfo);
            _dbContext.QueueItems.UpdateRange(queueList);
            await _dbContext.SaveChangesAsync();

            await _hubContext.Clients.Group(roomCode).SendAsync("QueueMoved", new QueueMovedEvent
            {
                RoomCode = roomCode,
                From = from,
                To = to,
                CurrentItemIndex = roomInfo.CurrentItemIndex,
                CurrentItemShuffleIndex = roomInfo.CurrentItemShuffleIndex,
                CurrentItemId = roomInfo.CurrentItemId,
                CurrentItemTrackId = roomInfo.CurrentItemTrackId
            });
        }

        public async Task Add(string roomCode, string urlOrQuery)
        {

            if (string.IsNullOrWhiteSpace(urlOrQuery))
            {
                throw new ArgumentException("URL/Query cannot be null or empty.", nameof(urlOrQuery));
            }

            var roomExists = await _dbContext.RoomInfos.AnyAsync(q => q.RoomCode == roomCode);
            if (!roomExists)
            {
                throw new ArgumentException("Instance not found.", nameof(roomCode));
            }

            var updatedItems = new List<QueueItemDto>();

            // Query the database for the current queue size
            var queueItemCount = await _dbContext.QueueItems.CountAsync(qi => qi.RoomCode == roomCode && !qi.IsDeleted);
            bool queueIsLarge = queueItemCount > 1000;

            // If queueIsLarge is true, disable playlist fetching in YtDlp
            var tracks = await _ytDlp.GetTracks(urlOrQuery, queueIsLarge);
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
                }
                else
                {
                    await _dbContext.Tracks.AddAsync(track);
                }
            }

            await _dbContext.SaveChangesAsync();

            var roomInfo = await _dbContext.RoomInfos
                .Where(q => q.RoomCode == roomCode)
                .FirstOrDefaultAsync() ?? throw new ArgumentException("Instance not found.", nameof(roomCode));

            // insert new items into the queue to be played next
            var queueItems = await _dbContext.QueueItems
                .Where(qi => qi.RoomCode == roomCode && !qi.IsDeleted)
                .ToListAsync();

            int insertUnshuffledIndex = roomInfo.CurrentItemIndex ?? -1;
            int insertShuffledIndex = roomInfo.CurrentItemShuffleIndex ?? -1;

            // Shift indices of items after the insertion point
            if (roomInfo.IsShuffled)
            {
                foreach (var item in queueItems)
                {
                    // Shift shuffle indices after current position
                    if (item.ShuffleIndex.HasValue && item.ShuffleIndex > insertShuffledIndex)
                    {
                        item.ShuffleIndex += uniqueTracks.Count;
                    }
                    // Shift unshuffled indices after current track's unshuffled position
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
                    // Shift unshuffled indices after current position
                    if (item.Index > insertUnshuffledIndex)
                    {
                        item.Index += uniqueTracks.Count;
                    }
                }
            }

            // Insert new items at the correct position (next after current)
            var newQueueItems = new List<QueueItem>();
            for (int i = 0; i < uniqueTracks.Count; i++)
            {
                var track = uniqueTracks[i];
                var queueItem = new QueueItem
                {
                    RoomCode = roomCode,
                    TrackId = track.WebpageUrlHash,
                    IsDeleted = false,
                    Index = insertUnshuffledIndex + 1 + i,
                    ShuffleIndex = roomInfo.IsShuffled ? insertShuffledIndex + 1 + i : null
                };
                newQueueItems.Add(queueItem);
            }
            await _dbContext.QueueItems.AddRangeAsync(newQueueItems);
            _dbContext.QueueItems.UpdateRange(queueItems);

                // If queue was empty, set current item properties to the first newly added item
                bool wasEmpty = queueItems.Count == 0;
                if (wasEmpty && newQueueItems.Count > 0)
                {
                    roomInfo.CurrentItemIndex = 0;
                    roomInfo.CurrentItemId = newQueueItems[0].Id;
                    roomInfo.CurrentItemTrackId = newQueueItems[0].TrackId;
                    if (roomInfo.IsShuffled)
                    {
                        roomInfo.CurrentItemShuffleIndex = newQueueItems[0].ShuffleIndex;
                    }
                    else
                    {
                        roomInfo.CurrentItemShuffleIndex = null;
                    }
                }

            await _dbContext.SaveChangesAsync();

            var addedItems = newQueueItems.Select(i => new QueueItemDto(i)).ToList();

            await _hubContext.Clients.Group(roomCode).SendAsync("QueueAdded", new QueueAddedEvent
            {
                RoomCode = roomCode,
                AddedItems = addedItems,
                CurrentItemIndex = roomInfo.CurrentItemIndex,
                CurrentItemShuffleIndex = roomInfo.CurrentItemShuffleIndex,
                CurrentItemId = roomInfo.CurrentItemId,
                CurrentItemTrackId = roomInfo.CurrentItemTrackId
            });
        }

        public async Task Shuffle(string roomCode, bool shuffled)
        {
            var roomInfo = await _dbContext.RoomInfos
                .Where(q => q.RoomCode == roomCode)
                .FirstOrDefaultAsync() ?? throw new ArgumentException("Instance not found.", nameof(roomCode));
            var queueItems = await _dbContext.QueueItems
                .Where(qi => qi.RoomCode == roomCode && !qi.IsDeleted)
                .OrderBy(qi => qi.Index)
                .ToListAsync();

            if (roomInfo.IsShuffled == shuffled) return;
            if (queueItems.Count == 0) return;

            roomInfo.IsShuffled = shuffled;
            int? seed = null;

            if (shuffled)
            {
                seed = ShuffleAlgorithm.GenerateSeed();
                var currentItem = queueItems.FirstOrDefault(qi => qi.Id == roomInfo.CurrentItemId && !qi.IsDeleted);
                List<QueueItem> changedItems = new();
                if (currentItem == null)
                {
                    var shuffledItems = ShuffleAlgorithm.Shuffle(queueItems, seed.Value);
                    for (int i = 0; i < shuffledItems.Count; i++)
                    {
                        if (shuffledItems[i].ShuffleIndex != i)
                        {
                            shuffledItems[i].ShuffleIndex = i;
                            changedItems.Add(shuffledItems[i]);
                        }
                    }
                    roomInfo.CurrentItemIndex = 0;
                    roomInfo.CurrentItemShuffleIndex = 0;
                    roomInfo.CurrentItemId = shuffledItems.FirstOrDefault()?.Id;
                    roomInfo.CurrentItemTrackId = shuffledItems.FirstOrDefault()?.TrackId;
                }
                else
                {
                    var otherTracks = queueItems.Where(qi => qi.Id != currentItem.Id).ToList();
                    var shuffledOthers = ShuffleAlgorithm.Shuffle(otherTracks, seed.Value);
                    if (currentItem.ShuffleIndex != 0)
                    {
                        currentItem.ShuffleIndex = 0;
                        changedItems.Add(currentItem);
                    }
                    for (int i = 0; i < shuffledOthers.Count; i++)
                    {
                        if (shuffledOthers[i].ShuffleIndex != i + 1)
                        {
                            shuffledOthers[i].ShuffleIndex = i + 1;
                            changedItems.Add(shuffledOthers[i]);
                        }
                    }
                    roomInfo.CurrentItemShuffleIndex = 0;
                    roomInfo.CurrentItemIndex = 0;
                    roomInfo.CurrentItemTrackId = currentItem.TrackId;
                }
                if (changedItems.Count > 0)
                {
                    _dbContext.QueueItems.UpdateRange(changedItems);
                }
            }
            else
            {
                var currentItem = queueItems.FirstOrDefault(qi => qi.Id == roomInfo.CurrentItemId && !qi.IsDeleted);
                if (currentItem == null)
                {
                    throw new InvalidOperationException("Current track not found in the queue.");
                }
                List<QueueItem> changedItems = new();
                for (int i = 0; i < queueItems.Count; i++)
                {
                    if (queueItems[i].ShuffleIndex != null)
                    {
                        queueItems[i].ShuffleIndex = null;
                        changedItems.Add(queueItems[i]);
                    }
                }
                roomInfo.CurrentItemIndex = currentItem.Index;
                roomInfo.CurrentItemShuffleIndex = null;
                roomInfo.CurrentItemTrackId = currentItem.TrackId;
                if (changedItems.Count > 0)
                {
                    _dbContext.QueueItems.UpdateRange(changedItems);
                }
            }
            _dbContext.RoomInfos.Update(roomInfo);

            await _dbContext.SaveChangesAsync();

            // Only send minimal info to clients
            await _hubContext.Clients.Group(roomCode).SendAsync("ShuffleToggled", new ShuffleToggledEvent
            {
                RoomCode = roomCode,
                IsShuffled = shuffled,
                Seed = seed,
                CurrentItemIndex = roomInfo.CurrentItemIndex,
                CurrentItemShuffleIndex = roomInfo.CurrentItemShuffleIndex,
                CurrentItemId = roomInfo.CurrentItemId,
                CurrentItemTrackId = roomInfo.CurrentItemTrackId
            });
        }

        public async Task Clear(string roomCode)
        {
            var roomInfo = await _dbContext.RoomInfos
                .Where(q => q.RoomCode == roomCode)
                .FirstOrDefaultAsync() ?? throw new ArgumentException("Instance not found.", nameof(roomCode));

            // Find all non-deleted items as a dictionary by Id
            var items = (await _dbContext.QueueItems
                .Where(qi => qi.RoomCode == roomCode && !qi.IsDeleted)
                .ToListAsync())
                .ToDictionary(qi => qi.Id);

            var currentItem = items.Values.FirstOrDefault(qi => qi.Id == roomInfo.CurrentItemId);
            if (currentItem == null)
            {
                throw new ArgumentException("Current track not found.", nameof(roomCode));
            }

            // Remove current item from dictionary
            items.Remove(currentItem.Id);

            // Mark all other items as deleted
            foreach (var item in items.Values)
            {
                item.IsDeleted = true;
                _dbContext.QueueItems.Update(item);
            }

            // Reset indices for the current item
            roomInfo.CurrentItemIndex = 0;
            currentItem.Index = 0;
            if (roomInfo.IsShuffled)
            {
                roomInfo.CurrentItemShuffleIndex = 0;
                currentItem.ShuffleIndex = 0;
            }

            _dbContext.QueueItems.Update(currentItem);
            _dbContext.RoomInfos.Update(roomInfo);

            await _dbContext.SaveChangesAsync();

            await _hubContext.Clients.Group(roomCode).SendAsync("QueueCleared", new QueueClearedEvent
            {
                RoomCode = roomCode,
                CurrentItemId = currentItem.Id
            });
        }

        public async Task Delete(string roomCode, int itemId)
        {
            var queue = await _dbContext.RoomInfos
                .Where(q => q.RoomCode == roomCode)
                .FirstOrDefaultAsync() ?? throw new ArgumentException("Instance not found.", nameof(roomCode));

            var item = await _dbContext.QueueItems
                .Where(qi => qi.RoomCode == roomCode && !qi.IsDeleted && qi.Id == itemId)
                .FirstOrDefaultAsync() ?? throw new ArgumentException("Item not found.", nameof(itemId));

            if (item.Id == queue.CurrentItemId)
            {
                throw new InvalidOperationException("Cannot delete the current track from the queue.");
            }

            var queueItems = await _dbContext.QueueItems
                .Where(qi => qi.RoomCode == roomCode && !qi.IsDeleted)
                .OrderBy(qi => queue.IsShuffled ? qi.ShuffleIndex : qi.Index)
                .ToListAsync();

            // Find the index of the item to delete in the ordered list
            var index = queueItems.FindIndex(qi => qi.Id == itemId);
            // Find the index of the item to delete in the ordered list
            var deletedItemIndex = queueItems.FindIndex(qi => qi.Id == itemId);

            item.IsDeleted = true;
            _dbContext.QueueItems.Update(item);
            await _dbContext.SaveChangesAsync();

            // Store the current track's unique identifier before shifting
            var currentTrackId = queue.CurrentItemTrackId;

            // Update indices of items to the right of the deleted item
            if (queue.IsShuffled)
            {
                var shuffledItems = queueItems.OrderBy(qi => qi.ShuffleIndex).ToList();
                var shuffledItemsToUpdate = shuffledItems.Skip(deletedItemIndex + 1).ToList();
                for (int i = 0; i < shuffledItemsToUpdate.Count; i++)
                {
                    shuffledItemsToUpdate[i].ShuffleIndex--;
                }
                _dbContext.QueueItems.UpdateRange(shuffledItemsToUpdate);
            }

            var itemsToUpdate = queueItems.OrderBy(qi => qi.Index).Skip(deletedItemIndex + 1).ToList();
            for (int i = 0; i < itemsToUpdate.Count; i++)
            {
                itemsToUpdate[i].Index--;
            }
            _dbContext.QueueItems.UpdateRange(itemsToUpdate);

            // After shifting, recalculate CurrentItemIndex if needed
            if (queue.CurrentItemIndex != null && deletedItemIndex < queue.CurrentItemIndex)
            {
                // Find the current track by its unique identifier
                var newCurrent = await _dbContext.QueueItems
                    .Where(qi => qi.RoomCode == roomCode && !qi.IsDeleted && qi.TrackId == currentTrackId)
                    .FirstOrDefaultAsync();
                if (newCurrent != null)
                {
                    // Find the visual position of the current track in the ordered list
                    var updatedQueueItems = await _dbContext.QueueItems
                        .Where(qi => qi.RoomCode == roomCode && !qi.IsDeleted)
                        .OrderBy(qi => queue.IsShuffled ? qi.ShuffleIndex : qi.Index)
                        .ToListAsync();

                    var currentVisualIndex = updatedQueueItems.FindIndex(qi => qi.Id == newCurrent.Id);
                    if (currentVisualIndex >= 0)
                    {
                        queue.CurrentItemIndex = currentVisualIndex;
                        if (queue.IsShuffled)
                        {
                            queue.CurrentItemShuffleIndex = newCurrent.ShuffleIndex;
                        }
                    }
                    queue.CurrentItemTrackId = newCurrent.TrackId;
                }
                else
                {
                    throw new InvalidOperationException("Current track not found after deletion.");
                }
                _dbContext.RoomInfos.Update(queue);
            }

            if (!queue.CurrentItemIndex.HasValue || string.IsNullOrEmpty(queue.CurrentItemTrackId))
            {
                throw new InvalidOperationException("Current track index or ID is not set after deletion.");
            }

            await _dbContext.SaveChangesAsync();

            var updatedItems = itemsToUpdate.Select(i => new QueueItemDto(i)).ToList();
            var deletedItem = new QueueItemDto(item);

            await _hubContext.Clients.Group(roomCode).SendAsync("QueueDeleted", new QueueDeletedEvent
            {
                RoomCode = roomCode,
                DeletedItemId = item.Id,
                CurrentItemIndex = (int)queue.CurrentItemIndex,
                CurrentItemShuffleIndex = queue.CurrentItemShuffleIndex,
            });
        }
    }

    // Base event class
    public abstract class RoomEvent
    {
        public string RoomCode { get; set; } = string.Empty;
        public long Timestamp { get; set; } = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
    }

    // Pause/Unpause event
    public class PauseToggledEvent : RoomEvent
    {
        public bool IsPaused { get; set; }
        public long? PlayingSince { get; set; }
    }

    // Loop toggle event
    public class LoopToggledEvent : RoomEvent
    {
        public bool IsLooping { get; set; }
    }

    // Shuffle toggle event
    public class ShuffleToggledEvent : RoomEvent
    {
        public bool IsShuffled { get; set; }
        public int? Seed { get; set; }
        public int? CurrentItemIndex { get; set; }
        public int? CurrentItemShuffleIndex { get; set; }
        public int? CurrentItemId { get; set; }
        public string? CurrentItemTrackId { get; set; }
    }

    // Seek event
    public class TrackSeekedEvent : RoomEvent
    {
        public long? PlayingSince { get; set; }
    }

    // Skip event
    public class TrackSkippedEvent : RoomEvent
    {
        public int? CurrentItemIndex { get; set; }
        public int? CurrentItemShuffleIndex { get; set; }
        public int? CurrentItemId { get; set; }
        public string? CurrentItemTrackId { get; set; }
    }

    // Move event
    public class QueueMovedEvent : RoomEvent
    {
        public int From { get; set; }
        public int To { get; set; }
        public int? CurrentItemIndex { get; set; }
        public int? CurrentItemShuffleIndex { get; set; }
        public int? CurrentItemId { get; set; }
        public string? CurrentItemTrackId { get; set; }
    }

    // Add event
    public class QueueAddedEvent : RoomEvent
    {
        public List<QueueItemDto> AddedItems { get; set; } = new();
        public int? CurrentItemIndex { get; set; }
        public int? CurrentItemShuffleIndex { get; set; }
        public int? CurrentItemId { get; set; }
        public string? CurrentItemTrackId { get; set; }
    }

    // Clear event
    public class QueueClearedEvent : RoomEvent
    {
        public int CurrentItemId { get; set; }
    }

    // Delete event
    public class QueueDeletedEvent : RoomEvent
    {
        public int DeletedItemId { get; set; }
        public int CurrentItemIndex { get; set; }
        public int? CurrentItemShuffleIndex { get; set; }
    }
}
