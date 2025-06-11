using KoodaamoJukebox.Utilities;
using Microsoft.EntityFrameworkCore;

namespace KoodaamoJukebox.Services
{
    public class CleanupService : BackgroundService
    {
        private AppDbContext _dbContext = null!; // Initialized in ExecuteAsync
        private QueueService _queueService = null!; // Initialized in ExecuteAsync

        private readonly IServiceProvider _serviceProvider;
        private readonly ILogger<CleanupService> _logger;

        public CleanupService(
            IServiceProvider serviceProvider,
            ILogger<CleanupService> logger
        )
        {
            _serviceProvider = serviceProvider;
            _logger = logger;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            using var scope = _serviceProvider.CreateScope();
            _dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            _queueService = scope.ServiceProvider.GetRequiredService<QueueService>();

            // Delete all playlist and segment files at startup
            var allPlaylists = await _dbContext.HlsPlaylists.ToListAsync(stoppingToken);
            foreach (var playlist in allPlaylists)
            {
                if (!string.IsNullOrEmpty(playlist.Path) && File.Exists(playlist.Path))
                {
                    try
                    {
                        File.Delete(playlist.Path);
                        _logger.LogInformation("Deleted playlist file at startup: {Path}", playlist.Path);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Failed to delete playlist file at startup: {Path}", playlist.Path);
                    }
                }
                playlist.Path = null;
            }
            var allSegments = await _dbContext.HlsSegments.ToListAsync(stoppingToken);
            foreach (var segment in allSegments)
            {
                if (!string.IsNullOrEmpty(segment.Path) && File.Exists(segment.Path))
                {
                    try
                    {
                        File.Delete(segment.Path);
                        _logger.LogInformation("Deleted segment file at startup: {Path}", segment.Path);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Failed to delete segment file at startup: {Path}", segment.Path);
                    }
                }
                segment.Path = null;
            }
            _dbContext.HlsPlaylists.RemoveRange(allPlaylists);
            _dbContext.HlsSegments.RemoveRange(allSegments);
            await _dbContext.SaveChangesAsync(stoppingToken);

            _logger.LogInformation("CleanupService started");
            while (!stoppingToken.IsCancellationRequested)
            {
                //await DeleteIsolatedQueues(stoppingToken);
                //await DeleteIsolatedQueueItemsAsync(stoppingToken);
                //await DeleteIsolatedTracksAsync(stoppingToken);
                //await DeleteExpiredPlaylistsAsync(stoppingToken);

                await Task.Delay(TimeSpan.FromHours(1), stoppingToken);
            }
        }

        private async Task DeleteIsolatedQueues(CancellationToken stoppingToken)
        {
            var isolatedQueues = await _dbContext.RoomInfos
                .Where(q => _dbContext.Users.Any(u => u.AssociatedInstanceId != q.InstanceId))
                .ToListAsync(stoppingToken);

            if (isolatedQueues.Count == 0)
            {
                return;
            }

            foreach (var queue in isolatedQueues)
            {
                _logger.LogInformation("Deleting isolated queue: {InstanceId}", queue.InstanceId);
                _queueService.RemoveSemaphore(queue.InstanceId);
                _dbContext.RoomInfos.Remove(queue);
            }
            await _dbContext.SaveChangesAsync(stoppingToken);
            _logger.LogInformation("Deleted {Count} isolated queues", isolatedQueues.Count);
        }

        private async Task DeleteIsolatedQueueItemsAsync(CancellationToken stoppingToken)
        {
            var isolatedQueueItems = await _dbContext.QueueItems
                .Where(qi => _dbContext.RoomInfos.Any(q => q.InstanceId != qi.InstanceId))
                .ToListAsync(stoppingToken);

            if (isolatedQueueItems.Count == 0)
            {
                return;
            }

            _dbContext.QueueItems.RemoveRange(isolatedQueueItems);
            await _dbContext.SaveChangesAsync(stoppingToken);
            _logger.LogInformation("Deleted {Count} isolated queue items", isolatedQueueItems.Count);
        }

        private async Task DeleteExpiredPlaylistsAsync(CancellationToken stoppingToken)
        {
            // There is no ExpiresAt or TrackId in HlsPlaylist. We'll delete playlists not referenced by any queue item.
            var referencedHashes = await _dbContext.QueueItems
                .Select(qi => qi.TrackId)
                .Distinct()
                .ToListAsync(stoppingToken);

            var expiredPlaylists = await _dbContext.HlsPlaylists
                .Where(p => !referencedHashes.Contains(p.WebpageUrlHash))
                .ToListAsync(stoppingToken);

            if (expiredPlaylists.Count == 0)
            {
                return;
            }

            _dbContext.HlsPlaylists.RemoveRange(expiredPlaylists);
            await _dbContext.SaveChangesAsync(stoppingToken);

            foreach (var playlist in expiredPlaylists)
            {
                if (!string.IsNullOrEmpty(playlist.Path) && File.Exists(playlist.Path))
                {
                    try
                    {
                        File.Delete(playlist.Path);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Failed to delete playlist file: {Path}", playlist.Path);
                    }
                }
            }

            _logger.LogInformation("Deleted {Count} expired playlists", expiredPlaylists.Count);

            // Delete segments whose WebpageUrlHash matches the deleted playlists
            var expiredHashes = expiredPlaylists.Select(p => p.WebpageUrlHash).ToList();
            var segmentsToDelete = await _dbContext.HlsSegments
                .Where(s => expiredHashes.Contains(s.WebpageUrlHash))
                .ToListAsync(stoppingToken);

            if (segmentsToDelete.Count == 0)
            {
                return;
            }

            _dbContext.HlsSegments.RemoveRange(segmentsToDelete);
            await _dbContext.SaveChangesAsync(stoppingToken);

            foreach (var segment in segmentsToDelete)
            {
                if (!string.IsNullOrEmpty(segment.Path) && File.Exists(segment.Path))
                {
                    try
                    {
                        File.Delete(segment.Path);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Failed to delete segment file: {Path}", segment.Path);
                    }
                }
            }

            _logger.LogInformation("Deleted {Count} segments associated with expired playlists", segmentsToDelete.Count);
        }

        private async Task DeleteIsolatedTracksAsync(CancellationToken stoppingToken)
        {
            // Remove tracks whose WebpageUrlHash is not referenced by any QueueItem.TrackId
            var referencedTrackIds = await _dbContext.QueueItems
                .Select(qi => qi.TrackId)
                .Distinct()
                .ToListAsync(stoppingToken);

            var isolatedTracks = await _dbContext.Tracks
                .Where(t => !referencedTrackIds.Contains(t.WebpageUrlHash))
                .ToListAsync(stoppingToken);

            if (isolatedTracks.Count == 0)
            {
                return;
            }

            _dbContext.Tracks.RemoveRange(isolatedTracks);
            await _dbContext.SaveChangesAsync(stoppingToken);
            _logger.LogInformation("Deleted {Count} isolated tracks", isolatedTracks.Count);
        }
    }
}