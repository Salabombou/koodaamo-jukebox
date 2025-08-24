using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using KoodaamoJukebox.Database.Models;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Authorization;
using KoodaamoJukebox.Api.Utilities;
using KoodaamoJukebox.Database;

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
    // private readonly HttpClient _httpClient = new HttpClient();
        private readonly SemaphoreSlim _hlsPlaylistLock = new SemaphoreSlim(1, 1);
        private readonly SemaphoreSlim _hlsSegmentLock = new SemaphoreSlim(1, 1);
        private readonly SemaphoreSlim _audioFileLock = new SemaphoreSlim(1, 1);
        private readonly YtDlp _ytDlp;

        public AudioController(KoodaamoJukeboxDbContext dbContext, ILogger<AudioController> logger, IConfiguration configuration)
        {
            _dbContext = dbContext;
            _logger = logger;
            _ytDlp = new YtDlp(configuration);
        }

        [HttpGet("{webpageUrlHash}/")]
        public async Task<IActionResult> GetAudioTrack(string webpageUrlHash)
        {
            if (string.IsNullOrWhiteSpace(webpageUrlHash))
            {
                return BadRequest("Webpage URL hash cannot be null or empty.");
            }

            // Only use room_code from JWT
            var roomCodeClaim = User.Claims.FirstOrDefault(c => c.Type == "room_code");
            if (roomCodeClaim == null)
            {
                return Forbid("Missing room code claim.");
            }
            var roomCode = roomCodeClaim.Value;

            // Find the room
            var room = await _dbContext.RoomInfos.AsNoTracking().FirstOrDefaultAsync(r => r.RoomCode == roomCode);
            if (room == null)
            {
                return Forbid("Room not found.");
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
                    _logger.LogWarning("Queue is empty for room {RoomCode}", room.RoomCode);
                    return Forbid();
                }
                // Allow only if requested webpageUrlHash is among these
                var allowed = queueItems.Any(q => q.TrackId == webpageUrlHash);
                if (!allowed)
                {
                    _logger.LogWarning("Requesting track with hash '{WebpageUrlHash}' is not within ±1 of the current track index {CurrentItemIndex} in room {RoomCode}.", webpageUrlHash, currentItemIndex.Value, room.RoomCode);
                    return Forbid();
                }
            }

            var track = await _dbContext.Tracks
                .AsNoTracking()
                .FirstOrDefaultAsync(t => t.WebpageUrlHash == webpageUrlHash);

            if (track == null)
            {
                return NotFound($"Track with hash '{webpageUrlHash}' not found.");
            }


            var hlsPlaylist = await _dbContext.HlsPlaylists
                .FirstOrDefaultAsync(p => p.WebpageUrlHash == track.WebpageUrlHash);
            if (hlsPlaylist != null)
            {
                // If expired, remove and allow recreation
                if (hlsPlaylist.ExpiresAt <= DateTimeOffset.UtcNow.ToUnixTimeMilliseconds())
                {
                    _dbContext.HlsPlaylists.Remove(hlsPlaylist);
                    await _dbContext.SaveChangesAsync();
                    hlsPlaylist = null;
                }
                else
                {
                    // Playlist exists and is valid, redirect
                    return RedirectToAction(nameof(GetPlaylist), new { webpageUrlHash = track.WebpageUrlHash });
                }
            }


            var audioStream = await _ytDlp.GetAudioStream(track.WebpageUrl);
            if (audioStream.Type == YtDlpAudioStreamType.M3U8Native)
            {
                // Double-check for existing playlist before insert (race condition safety)
                var existingPlaylist = await _dbContext.HlsPlaylists.FirstOrDefaultAsync(p => p.WebpageUrlHash == webpageUrlHash);
                if (existingPlaylist == null)
                {
                    var newHlsPlaylist = new HlsPlaylist
                    {
                        WebpageUrlHash = webpageUrlHash,
                        DownloadUrl = audioStream.Url,
                        ExpiresAt = DateTimeOffset.UtcNow.AddHours(1).ToUnixTimeMilliseconds()
                    };
                    _dbContext.HlsPlaylists.Add(newHlsPlaylist);
                    await _dbContext.SaveChangesAsync();
                }
                return RedirectToAction(nameof(GetPlaylist), new { webpageUrlHash = track.WebpageUrlHash });
            }
            else if (audioStream.Type == YtDlpAudioStreamType.HTTPS)
            {
                string audioDownloadUrlHash = Hashing.ComputeSha256Hash(audioStream.Url);
                var newHlsSegment = new HlsSegment
                {
                    WebpageUrlHash = webpageUrlHash,
                    DownloadUrl = audioStream.Url,
                    DownloadUrlHash = audioDownloadUrlHash
                };
                newHlsSegment.Path = Path.GetTempFileName();
                await Utilities.CurlHelper.DownloadFileAsync(audioStream.Url, newHlsSegment.Path);

                // Use Ffmpeg utility to segment the audio file into 10s HLS segments and generate m3u8
                string playlistPath;
                string[] segmentFiles;
                try
                {
                    (playlistPath, segmentFiles) = await Ffmpeg.SegmentAudioToHls(newHlsSegment.Path, webpageUrlHash);
                }
                catch (Exception ex)
                {
                    _logger.LogError($"ffmpeg failed: {ex.Message}");
                    return StatusCode(500, "Failed to segment audio file with ffmpeg.");
                }

                // Double-check for existing playlist before insert (race condition safety)
                var existingPlaylist = await _dbContext.HlsPlaylists.FirstOrDefaultAsync(p => p.WebpageUrlHash == webpageUrlHash);
                if (existingPlaylist == null)
                {
                    var newHlsPlaylist = new HlsPlaylist
                    {
                        WebpageUrlHash = webpageUrlHash,
                        DownloadUrl = audioStream.Url,
                        ExpiresAt = DateTimeOffset.UtcNow.AddHours(1).ToUnixTimeMilliseconds(),
                        Path = playlistPath
                    };
                    _dbContext.HlsPlaylists.Add(newHlsPlaylist);
                }

                // Add HlsSegment entries for each segment
                foreach (var segmentFile in segmentFiles)
                {
                    string segmentUrlHash = Hashing.ComputeSha256Hash(segmentFile);
                    var segment = new HlsSegment
                    {
                        WebpageUrlHash = webpageUrlHash,
                        DownloadUrl = null!, // Not needed for local segments
                        DownloadUrlHash = segmentUrlHash,
                        Path = segmentFile
                    };
                    _dbContext.HlsSegments.Add(segment);
                }
                await _dbContext.SaveChangesAsync();
                return RedirectToAction(nameof(GetPlaylist), new { webpageUrlHash = track.WebpageUrlHash });
            }

            return NotFound($"No audio file or HLS playlist found for track with hash '{webpageUrlHash}'.");
        }

        [HttpGet("{webpageUrlHash}/playlist")]
        public async Task<IActionResult> GetPlaylist(string webpageUrlHash)
        {
            if (string.IsNullOrWhiteSpace(webpageUrlHash))
            {
                return BadRequest("Webpage URL hash cannot be null or empty.");
            }

            var hlsPlaylist = await _dbContext.HlsPlaylists
                .FirstOrDefaultAsync(p => p.WebpageUrlHash == webpageUrlHash);

            if (hlsPlaylist == null)
            {
                return NotFound($"HLS playlist with hash '{webpageUrlHash}' not found.");
            }
            else if (hlsPlaylist.Path != null)
            {
                if (System.IO.File.Exists(hlsPlaylist.Path))
                {
                    return PhysicalFile(hlsPlaylist.Path, "application/vnd.apple.mpegurl");
                }
                hlsPlaylist.Path = null; // Force re-fetch
                await _dbContext.SaveChangesAsync();
            }

            await _hlsPlaylistLock.WaitAsync();
            var hlsPlaylistPath = await _dbContext.HlsPlaylists
                .AsNoTracking()
                .Where(p => p.WebpageUrlHash == webpageUrlHash)
                .Select(p => p.Path)
                .FirstOrDefaultAsync();
            if (hlsPlaylistPath != null)
            {
                if (System.IO.File.Exists(hlsPlaylistPath))
                {
                    return PhysicalFile(hlsPlaylistPath, "application/vnd.apple.mpegurl");
                }
            }

            try
            {
                var hlsPlaylistContent = await Utilities.CurlHelper.GetStringAsync(hlsPlaylist.DownloadUrl);
                var hlsPlaylistLines = hlsPlaylistContent.Split('\n');
                var segmentUrlHashes = new SortedSet<string>();

                if (string.IsNullOrEmpty(hlsPlaylist.DownloadUrl))
                {
                    throw new InvalidOperationException("HLS playlist DownloadUrl is null or empty.");
                }
                var baseUrl = new Uri(hlsPlaylist.DownloadUrl).GetLeftPart(UriPartial.Authority);
                string? segmentBaseUrl = null;
                for (int i = 0; i < hlsPlaylistLines.Length; i++)
                {
                    var playlistLine = hlsPlaylistLines[i];
                    var trimmedLine = playlistLine.TrimStart();
                    if (trimmedLine.StartsWith("#EXT-X-MAP:URI=", StringComparison.OrdinalIgnoreCase))
                    {
                        var uriValue = playlistLine.Trim()["#EXT-X-MAP:URI=".Length..].Trim();
                        // Remove quotes if present
                        uriValue = Regex.Replace(uriValue, "^\"|\"$", "");
                        // Compose absolute or relative URL for segment base
                        string mapAbsoluteUrl;
                        if (Uri.IsWellFormedUriString(uriValue, UriKind.Absolute))
                        {
                            mapAbsoluteUrl = uriValue;
                        }
                        else
                        {
                            string baseForMap = segmentBaseUrl ?? baseUrl;
                            mapAbsoluteUrl = new Uri(new Uri(baseForMap), uriValue).ToString();
                        }
                        var mapHash = Hashing.ComputeSha256Hash(mapAbsoluteUrl);
                        // Add HlsSegment for map URI if not exists
                        if (!segmentUrlHashes.Contains(mapHash))
                        {
                            segmentUrlHashes.Add(mapHash);
                            if (!await _dbContext.HlsSegments.AnyAsync(s => s.DownloadUrlHash == mapHash))
                            {
                                var mapSegment = new HlsSegment
                                {
                                    WebpageUrlHash = webpageUrlHash,
                                    DownloadUrl = mapAbsoluteUrl,
                                    DownloadUrlHash = mapHash
                                };
                                _dbContext.HlsSegments.Add(mapSegment);
                            }
                        }
                        // Replace the URI in the line with the segment endpoint
                        var newMapLine = $"#EXT-X-MAP:URI=\"playlist/segment-{mapHash}\"";
                        hlsPlaylistLines[i] = newMapLine;
                        continue;
                    }
                }
                // Now process segment lines
                for (int i = 0; i < hlsPlaylistLines.Length; i++)
                {
                    var line = hlsPlaylistLines[i].Trim();
                    if (string.IsNullOrWhiteSpace(line) || line.StartsWith('#'))
                    {
                        continue; // Skip comments
                    }
                    // Skip lines that are not valid URLs (e.g., ID3 tags or binary data)
                    if (!Uri.IsWellFormedUriString(line, UriKind.Absolute) && !Uri.IsWellFormedUriString(line, UriKind.Relative))
                    {
                        continue; // Skip non-URL, non-comment lines
                    }
                    var segment = new HlsSegment
                    {
                        WebpageUrlHash = webpageUrlHash,
                        DownloadUrl = null!,
                        DownloadUrlHash = null!
                    };
                    string segmentAbsoluteUrl;
                    if (Uri.IsWellFormedUriString(line, UriKind.Absolute))
                    {
                        segmentAbsoluteUrl = line;
                    }
                    else
                    {
                        string baseForSegment = segmentBaseUrl ?? baseUrl;
                        segmentAbsoluteUrl = new Uri(new Uri(baseForSegment), line).ToString();
                    }
                    segment.DownloadUrl = segmentAbsoluteUrl;
                    segment.DownloadUrlHash = Hashing.ComputeSha256Hash(segmentAbsoluteUrl);
                    if (!segmentUrlHashes.Contains(segment.DownloadUrlHash))
                    {
                        segmentUrlHashes.Add(segment.DownloadUrlHash);
                        if (!await _dbContext.HlsSegments.AnyAsync(s => s.DownloadUrlHash == segment.DownloadUrlHash))
                        {
                            _dbContext.HlsSegments.Add(segment);
                        }
                    }
                    hlsPlaylistLines[i] = $"playlist/segment-{segment.DownloadUrlHash}";
                }
                hlsPlaylistContent = string.Join("\n", hlsPlaylistLines);
                hlsPlaylist.Path = Path.GetTempFileName();
                await System.IO.File.WriteAllTextAsync(hlsPlaylist.Path, hlsPlaylistContent);
                await _dbContext.SaveChangesAsync();
            }
            finally
            {
                _hlsPlaylistLock.Release();
            }

            return PhysicalFile(hlsPlaylist.Path, "application/vnd.apple.mpegurl");
        }

        [HttpGet("{webpageUrlHash}/playlist/segment-{downloadUrlHash}")]
        public async Task<IActionResult> GetPlaylistSegments(string webpageUrlHash, string downloadUrlHash)
        {
            if (string.IsNullOrWhiteSpace(webpageUrlHash) || string.IsNullOrWhiteSpace(downloadUrlHash))
            {
                return BadRequest("Webpage URL hash and download URL hash cannot be null or empty.");
            }

            var hlsSegment = await _dbContext.HlsSegments
                .Where(s => s.WebpageUrlHash == webpageUrlHash && s.DownloadUrlHash == downloadUrlHash)
                .FirstOrDefaultAsync();

            if (hlsSegment == null)
            {
                return NotFound($"HLS segment with webpage URL hash '{webpageUrlHash}' and download URL hash '{downloadUrlHash}' not found.");
            }

            if (hlsSegment.Path != null)
            {
                if (System.IO.File.Exists(hlsSegment.Path))
                {
                    return PhysicalFile(hlsSegment.Path, "application/octet-stream");
                }
                hlsSegment.Path = null; // Force re-fetch
                await _dbContext.SaveChangesAsync();
            }

            await _hlsSegmentLock.WaitAsync();
            var hlsSegmentPath = await _dbContext.HlsSegments
                .AsNoTracking()
                .Where(s => s.WebpageUrlHash == webpageUrlHash && s.DownloadUrlHash == downloadUrlHash)
                .Select(s => s.Path)
                .FirstOrDefaultAsync();
            if (hlsSegmentPath != null)
            {
                if (System.IO.File.Exists(hlsSegmentPath))
                {
                    return PhysicalFile(hlsSegmentPath, "application/octet-stream");
                }
            }

            try
            {
                hlsSegment.Path = Path.GetTempFileName();
                await Utilities.CurlHelper.DownloadFileAsync(hlsSegment.DownloadUrl, hlsSegment.Path);

                await _dbContext.SaveChangesAsync();
            }
            catch (HttpRequestException ex)
            {
                return BadRequest($"Failed to download HLS segment: {ex.Message}");
            }
            finally
            {
                _hlsSegmentLock.Release();
            }

            return PhysicalFile(hlsSegment.Path, "application/octet-stream");
        }
    }
}