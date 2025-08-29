using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using KoodaamoJukebox.Database.Models;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Authorization;
using KoodaamoJukebox.Api.Utilities;
using KoodaamoJukebox.Database;
using System.Collections.Concurrent;
using System.IO;

namespace KoodaamoJukebox.Api.Controllers
{
    [ApiController]
    [Authorize(Policy = "ClientOnly")]
    [Authorize(Policy = "ConnectedUserData")]
    [Route("api/[controller]")]
    public class AudioController : ControllerBase
    {
        private readonly KoodaamoJukeboxDbContext _dbContext;
        private readonly ILogger<AudioController> _logger;
        private readonly YtDlp _ytDlp;

        // One semaphore per room_code
        private static readonly ConcurrentDictionary<string, SemaphoreSlim> _roomLocks = new();

        public AudioController(KoodaamoJukeboxDbContext dbContext, ILogger<AudioController> logger, IConfiguration configuration)
        {
            _dbContext = dbContext;
            _logger = logger;
            _ytDlp = new YtDlp(configuration);
        }

        [HttpPost("{webpageUrlHash}/")]
        public async Task<IActionResult> GetAudioTrack(string webpageUrlHash)
        {
            if (string.IsNullOrWhiteSpace(webpageUrlHash))
            {
                _logger.LogWarning("GetAudioTrack: Webpage URL hash is null or empty.");
                return BadRequest("Webpage URL hash cannot be null or empty.");
            }

            // Only use room_code from JWT
            var roomCodeClaim = User.Claims.FirstOrDefault(c => c.Type == "room_code");
            if (roomCodeClaim == null)
            {
                _logger.LogWarning("GetAudioTrack: Missing room code claim in JWT.");
                return Forbid();
            }
            var roomCode = roomCodeClaim.Value;

            // Find the room
            var room = await _dbContext.RoomInfos.AsNoTracking().FirstOrDefaultAsync(r => r.RoomCode == roomCode);
            if (room == null)
            {
                _logger.LogWarning("GetAudioTrack: Room not found for code {RoomCode}", roomCode);
                return NotFound("Room not found.");
            }

            // Only get the 3 relevant queue items
            int? currentItemIndex = room.CurrentItemIndex;
            if (currentItemIndex.HasValue)
            {
                var queueItems = await _dbContext.QueueItems.AsNoTracking()
                    .Where(q => q.RoomCode == room.RoomCode && Math.Abs((room.IsShuffled ? (int)q.ShuffleIndex! : q.Index) - currentItemIndex.Value) <= 2)
                    .ToListAsync();
                if (queueItems.Count == 0)
                {
                    _logger.LogWarning("GetAudioTrack: Queue is empty for room {RoomCode}", room.RoomCode);
                    return Forbid();
                }
                // Allow only if requested webpageUrlHash is among these
                var allowed = queueItems.Any(q => q.WebpageUrlHash == webpageUrlHash);
                if (!allowed)
                {
                    _logger.LogWarning("GetAudioTrack: Requesting track with hash '{WebpageUrlHash}' is not within ±1 of the current track index {CurrentItemIndex} in room {RoomCode}.", webpageUrlHash, currentItemIndex.Value, room.RoomCode);
                    return Forbid();
                }
            }

            // Ensure one download per room at a time
            var semaphore = _roomLocks.GetOrAdd(roomCode, _ => new SemaphoreSlim(1, 1));
            Track? track;
            string outputDir;
            string playlistPath;
            await semaphore.WaitAsync();
            try
            {
                track = await _dbContext.Tracks
                .AsNoTracking()
                .FirstOrDefaultAsync(t => t.WebpageUrlHash == webpageUrlHash);

                if (track == null)
                {
                    _logger.LogWarning("GetAudioTrack: Track with hash '{WebpageUrlHash}' not found.", webpageUrlHash);
                    return NotFound($"Track with hash '{webpageUrlHash}' not found.");
                }

                playlistPath = Path.Combine(track.Path ?? string.Empty, "audio.m3u8");
                if (track.Path == null || !System.IO.File.Exists(playlistPath))
                {
                    _logger.LogInformation("GetAudioTrack: Fetching audio stream for track {WebpageUrlHash} in room {RoomCode}", track.WebpageUrlHash, room.RoomCode);

                    outputDir = await _ytDlp.GetAudio(track.WebpageUrl);
                    playlistPath = Path.Combine(outputDir, "audio.m3u8");

                    track.Path = outputDir;
                    _dbContext.Tracks.Update(track);
                    await _dbContext.SaveChangesAsync();
                }
            }
            finally
            {
                semaphore.Release();
            }

            return PhysicalFile(playlistPath, "application/vnd.apple.mpegurl");
        }

        [HttpPost("{webpageUrlHash}/{segmentName}")]
        public async Task<IActionResult> GetAudioSegment(string webpageUrlHash, string segmentName)
        {
            if (string.IsNullOrWhiteSpace(webpageUrlHash) || string.IsNullOrWhiteSpace(segmentName))
            {
                _logger.LogWarning("GetAudioSegment: Webpage URL hash or segment name is null or empty.");
                return BadRequest("Webpage URL hash and segment name cannot be null or empty.");
            }

            // Find the track by hash
            var track = await _dbContext.Tracks
                .AsNoTracking()
                .FirstOrDefaultAsync(t => t.WebpageUrlHash == webpageUrlHash);

            if (track == null || string.IsNullOrEmpty(track.Path))
            {
                _logger.LogWarning("GetAudioSegment: Track with hash '{WebpageUrlHash}' not found or path is missing.", webpageUrlHash);
                return NotFound($"Track with hash '{webpageUrlHash}' not found.");
            }

            var segmentPath = Path.Combine(track.Path, segmentName);

            if (System.IO.File.Exists(segmentPath))
            {
                return PhysicalFile(segmentPath, "video/MP2T");
            }
            else
            {
                _logger.LogWarning("GetAudioSegment: Segment file '{SegmentName}' not found for track '{WebpageUrlHash}'.", segmentName, webpageUrlHash);
                return NotFound($"Segment file '{segmentName}' not found for track '{webpageUrlHash}'.");
            }
        }
    }
}
