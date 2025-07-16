using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Hosting;

namespace KoodaamoJukebox.Database.Services
{
    public class DatabaseCleanupService : BackgroundService
    {
        private readonly IServiceProvider _serviceProvider;
        private readonly ILogger<DatabaseCleanupService> _logger;
        private static readonly TimeSpan Interval = TimeSpan.FromHours(1);

        public DatabaseCleanupService(IServiceProvider serviceProvider, ILogger<DatabaseCleanupService> logger)
        {
            _serviceProvider = serviceProvider;
            _logger = logger;

            using var scope = _serviceProvider.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<KoodaamoJukeboxDbContext>();
            var users = db.Users.ToList();
            foreach (var user in users)
            {
                user.ConnectionId = null;
            }
            db.Users.UpdateRange(users);
            db.SaveChanges();
            _logger.LogInformation($"Cleared ConnectionId for {users.Count} users on startup.");
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                await Task.Delay(Interval, stoppingToken);
                try
                {
                    using var scope = _serviceProvider.CreateScope();
                    var db = scope.ServiceProvider.GetRequiredService<KoodaamoJukeboxDbContext>();

                    // Find TrackIds that are not referenced by any QueueItem
                    var allTrackIds = await db.Tracks.Select(t => t.WebpageUrlHash).ToListAsync(stoppingToken);
                    var referencedTrackIds = await db.QueueItems.Select(qi => qi.TrackId).Distinct().ToListAsync(stoppingToken);
                    var orphanTrackIds = allTrackIds.Except(referencedTrackIds).ToList();

                    if (orphanTrackIds.Count > 0)
                    {
                        // Delete orphan Tracks
                        var orphanTracks = await db.Tracks.Where(t => orphanTrackIds.Contains(t.WebpageUrlHash)).ToListAsync(stoppingToken);
                        db.Tracks.RemoveRange(orphanTracks);
                        _logger.LogInformation($"Deleted {orphanTracks.Count} orphan tracks.");

                        // Delete associated HlsPlaylists
                        var orphanPlaylists = await db.HlsPlaylists.Where(p => orphanTrackIds.Contains(p.WebpageUrlHash)).ToListAsync(stoppingToken);
                        db.HlsPlaylists.RemoveRange(orphanPlaylists);
                        _logger.LogInformation($"Deleted {orphanPlaylists.Count} orphan playlists.");

                        // Delete associated HlsSegments
                        var orphanSegments = await db.HlsSegments.Where(s => orphanTrackIds.Contains(s.WebpageUrlHash)).ToListAsync(stoppingToken);
                        db.HlsSegments.RemoveRange(orphanSegments);
                        _logger.LogInformation($"Deleted {orphanSegments.Count} orphan segments.");
                    }

                    // Remove RoomInfo entries with no associated users
                    var allRoomCodes = await db.RoomInfos.Select(r => r.RoomCode).ToListAsync(stoppingToken);
                    var roomCodesWithUsers = await db.Users.Where(u => u.AssociatedRoomCode != null).Select(u => u.AssociatedRoomCode).Distinct().ToListAsync(stoppingToken);
                    var orphanRoomCodes = allRoomCodes.Except(roomCodesWithUsers).ToList();
                    if (orphanRoomCodes.Count > 0)
                    {
                        // Remove all QueueItems associated with orphan rooms
                        var orphanQueueItems = await db.QueueItems.Where(qi => orphanRoomCodes.Contains(qi.RoomCode)).ToListAsync(stoppingToken);
                        db.QueueItems.RemoveRange(orphanQueueItems);
                        _logger.LogInformation($"Deleted {orphanQueueItems.Count} orphan queue items.");

                        var orphanRooms = await db.RoomInfos.Where(r => orphanRoomCodes.Contains(r.RoomCode)).ToListAsync(stoppingToken);
                        db.RoomInfos.RemoveRange(orphanRooms);
                        _logger.LogInformation($"Deleted {orphanRooms.Count} orphan rooms.");
                    }
                    
                    // Clear AssociatedRoomCode for inactive users when not connected and last updated more than 1 hour ago
                    var cutoff = DateTimeOffset.UtcNow.AddHours(-1).ToUnixTimeMilliseconds();
                    var inactiveUsers = await db.Users
                        .Where(u => u.AssociatedRoomCode != null && u.ConnectionId == null && u.UpdatedAt < cutoff)
                        .ToListAsync(stoppingToken);
                    if (inactiveUsers.Count > 0)
                    {
                        foreach (var user in inactiveUsers)
                        {
                            user.AssociatedRoomCode = null;
                        }
                        db.Users.UpdateRange(inactiveUsers);
                        _logger.LogInformation($"Cleared AssociatedRoomCode for {inactiveUsers.Count} inactive users.");
                    }

                    await db.SaveChangesAsync(stoppingToken);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error during database cleanup.");
                }
            }
        }
    }
}
