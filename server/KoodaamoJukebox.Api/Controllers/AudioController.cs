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
                _logger.LogWarning("GetAudioTrack: Webpage URL hash is null or empty.");
                return BadRequest("Webpage URL hash cannot be null or empty.");
            }

            // Only use room_code from JWT
            var roomCodeClaim = User.Claims.FirstOrDefault(c => c.Type == "room_code");
            if (roomCodeClaim == null)
            {
                _logger.LogWarning("GetAudioTrack: Missing room code claim in JWT.");
                return Forbid("Missing room code claim.");
            }
            var roomCode = roomCodeClaim.Value;

            // Find the room
            var room = await _dbContext.RoomInfos.AsNoTracking().FirstOrDefaultAsync(r => r.RoomCode == roomCode);
            if (room == null)
            {
                _logger.LogWarning("GetAudioTrack: Room not found for code {RoomCode}", roomCode);
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
                    _logger.LogWarning("GetAudioTrack: Queue is empty for room {RoomCode}", room.RoomCode);
                    return Forbid();
                }
                // Allow only if requested webpageUrlHash is among these
                var allowed = queueItems.Any(q => q.TrackId == webpageUrlHash);
                if (!allowed)
                {
                    _logger.LogWarning("GetAudioTrack: Requesting track with hash '{WebpageUrlHash}' is not within ±1 of the current track index {CurrentItemIndex} in room {RoomCode}.", webpageUrlHash, currentItemIndex.Value, room.RoomCode);
                    return Forbid();
                }
            }

            var track = await _dbContext.Tracks
                .AsNoTracking()
                .FirstOrDefaultAsync(t => t.WebpageUrlHash == webpageUrlHash);

            if (track == null)
            {
                _logger.LogWarning("GetAudioTrack: Track with hash '{WebpageUrlHash}' not found.", webpageUrlHash);
                return NotFound($"Track with hash '{webpageUrlHash}' not found.");
            }


            var hlsPlaylist = await _dbContext.HlsPlaylists
                .FirstOrDefaultAsync(p => p.WebpageUrlHash == track.WebpageUrlHash);
            if (hlsPlaylist != null)
            {
                // If expired, remove and allow recreation
                if (hlsPlaylist.ExpiresAt <= DateTimeOffset.UtcNow.ToUnixTimeMilliseconds())
                {
                    _logger.LogInformation("GetAudioTrack: Expired HLS playlist for track {WebpageUrlHash}, removing.", track.WebpageUrlHash);
                    _dbContext.HlsPlaylists.Remove(hlsPlaylist);
                    await _dbContext.SaveChangesAsync();
                    hlsPlaylist = null;
                }
                else
                {
                    _logger.LogInformation("GetAudioTrack: Valid HLS playlist exists for track {WebpageUrlHash}, redirecting.", track.WebpageUrlHash);
                    return RedirectToAction(nameof(GetPlaylist), new { webpageUrlHash = track.WebpageUrlHash });
                }
            }



            _logger.LogInformation("GetAudioTrack: Fetching audio stream for track {WebpageUrlHash}", track.WebpageUrlHash);
            var audioStream = await _ytDlp.GetAudioStream(track.WebpageUrl);
            if (audioStream.Type == YtDlpAudioStreamType.M3U8Native)
            {
                // Double-check for existing playlist before insert (race condition safety)
                var existingPlaylist = await _dbContext.HlsPlaylists.FirstOrDefaultAsync(p => p.WebpageUrlHash == webpageUrlHash);
                if (existingPlaylist == null)
                {
                    _logger.LogInformation("GetAudioTrack: Creating new HLS playlist for M3U8Native stream {WebpageUrlHash}", webpageUrlHash);
                    var newHlsPlaylist = new HlsPlaylist
                    {
                        WebpageUrlHash = webpageUrlHash,
                        DownloadUrl = audioStream.Url,
                        ExpiresAt = DateTimeOffset.UtcNow.AddHours(1).ToUnixTimeMilliseconds()
                    };
                    _dbContext.HlsPlaylists.Add(newHlsPlaylist);
                    await _dbContext.SaveChangesAsync();
                }
                _logger.LogInformation("GetAudioTrack: Redirecting to playlist for {WebpageUrlHash}", track.WebpageUrlHash);
                return RedirectToAction(nameof(GetPlaylist), new { webpageUrlHash = track.WebpageUrlHash });
            }

            else if (audioStream.Type == YtDlpAudioStreamType.HTTPS)
            {
                _logger.LogInformation("GetAudioTrack: Downloading HTTPS audio stream for {WebpageUrlHash}", webpageUrlHash);
                string audioDownloadUrlHash = Hashing.ComputeSha256Hash(audioStream.Url);
                var newHlsSegment = new HlsSegment
                {
                    WebpageUrlHash = webpageUrlHash,
                    DownloadUrl = audioStream.Url,
                    DownloadUrlHash = audioDownloadUrlHash
                };

                newHlsSegment.Path = Path.GetTempFileName();
                var swDownload = System.Diagnostics.Stopwatch.StartNew();
                try
                {
                    _logger.LogInformation("GetAudioTrack: Starting curl download: url={Url} dest={Dest}", audioStream.Url, newHlsSegment.Path);
                    await Utilities.CurlHelper.DownloadFileAsync(audioStream.Url, newHlsSegment.Path, _logger, webpageUrlHash);
                }
                catch (Exception ex)
                {
                    swDownload.Stop();
                    _logger.LogError(ex, "GetAudioTrack: CurlHelper.DownloadFileAsync failed for {WebpageUrlHash} ({AudioUrl}) after {ElapsedMs}ms", webpageUrlHash, audioStream.Url, swDownload.ElapsedMilliseconds);
                    return StatusCode(502, $"Failed to download audio file: {ex.Message}");
                }
                swDownload.Stop();
                _logger.LogInformation("GetAudioTrack: curl download finished in {ElapsedMs}ms", swDownload.ElapsedMilliseconds);

                // Use Ffmpeg utility to segment the audio file into 10s HLS segments and generate m3u8
                string playlistPath;
                string[] segmentFiles;
                var swFfmpeg = System.Diagnostics.Stopwatch.StartNew();
                try
                {
                    _logger.LogInformation("GetAudioTrack: Starting ffmpeg segmentation for {WebpageUrlHash}", webpageUrlHash);
                    (playlistPath, segmentFiles) = await Ffmpeg.SegmentAudioToHls(newHlsSegment.Path, webpageUrlHash, _logger, webpageUrlHash);
                }
                catch (Exception ex)
                {
                    swFfmpeg.Stop();
                    _logger.LogError(ex, "GetAudioTrack: ffmpeg failed for {WebpageUrlHash} after {ElapsedMs}ms", webpageUrlHash, swFfmpeg.ElapsedMilliseconds);
                    return StatusCode(500, $"Failed to segment audio file with ffmpeg: {ex.Message}");
                }
                swFfmpeg.Stop();
                _logger.LogInformation("GetAudioTrack: ffmpeg finished in {ElapsedMs}ms", swFfmpeg.ElapsedMilliseconds);

                // Add HlsSegment entries for each segment and build a mapping for rewriting the playlist
                var segmentHashMap = new Dictionary<string, string>();
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
                    segmentHashMap[Path.GetFileName(segmentFile)] = segmentUrlHash;
                }

                // Rewrite the playlist to use /playlist/segment-{hash} URLs
                var playlistLines = await System.IO.File.ReadAllLinesAsync(playlistPath);
                for (int i = 0; i < playlistLines.Length; i++)
                {
                    var line = playlistLines[i].Trim();
                    if (!string.IsNullOrWhiteSpace(line) && !line.StartsWith("#"))
                    {
                        var fileName = Path.GetFileName(line);
                        if (segmentHashMap.TryGetValue(fileName, out var hash))
                        {
                            playlistLines[i] = $"playlist/segment-{hash}";
                        }
                    }
                }
                // Save the rewritten playlist
                await System.IO.File.WriteAllLinesAsync(playlistPath, playlistLines);

                // Double-check for existing playlist before insert (race condition safety)
                var existingPlaylist = await _dbContext.HlsPlaylists.FirstOrDefaultAsync(p => p.WebpageUrlHash == webpageUrlHash);
                if (existingPlaylist == null)
                {
                    _logger.LogInformation("GetAudioTrack: Creating new HLS playlist for HTTPS stream {WebpageUrlHash}", webpageUrlHash);
                    var newHlsPlaylist = new HlsPlaylist
                    {
                        WebpageUrlHash = webpageUrlHash,
                        DownloadUrl = audioStream.Url,
                        ExpiresAt = DateTimeOffset.UtcNow.AddHours(1).ToUnixTimeMilliseconds(),
                        Path = playlistPath
                    };
                    _dbContext.HlsPlaylists.Add(newHlsPlaylist);
                }

                await _dbContext.SaveChangesAsync();
                _logger.LogInformation("GetAudioTrack: Segmented and saved HLS playlist for {WebpageUrlHash}", webpageUrlHash);
                return RedirectToAction(nameof(GetPlaylist), new { webpageUrlHash = track.WebpageUrlHash });
            }

            _logger.LogWarning("GetAudioTrack: No audio file or HLS playlist found for track with hash '{WebpageUrlHash}'", webpageUrlHash);
            return NotFound($"No audio file or HLS playlist found for track with hash '{webpageUrlHash}'.");
        }

[HttpGet("{webpageUrlHash}/playlist")]
public async Task<IActionResult> GetPlaylist(string webpageUrlHash)
{
    if (string.IsNullOrWhiteSpace(webpageUrlHash))
    {
        _logger.LogWarning("GetPlaylist: Webpage URL hash is null or empty.");
        return BadRequest("Webpage URL hash cannot be null or empty.");
    }

    var hlsPlaylist = await _dbContext.HlsPlaylists
        .FirstOrDefaultAsync(p => p.WebpageUrlHash == webpageUrlHash);

    if (hlsPlaylist == null)
    {
        _logger.LogWarning("GetPlaylist: HLS playlist with hash '{WebpageUrlHash}' not found.", webpageUrlHash);
        return NotFound($"HLS playlist with hash '{webpageUrlHash}' not found.");
    }

    // ✅ Case 1: Local ffmpeg-generated playlist
    if (!string.IsNullOrEmpty(hlsPlaylist.Path) && System.IO.File.Exists(hlsPlaylist.Path))
    {
        _logger.LogInformation("GetPlaylist: Serving local ffmpeg playlist for {WebpageUrlHash}", webpageUrlHash);
        return PhysicalFile(hlsPlaylist.Path, "application/vnd.apple.mpegurl");
    }

    // ✅ Case 2: Remote M3U8-native playlist
    if (!string.IsNullOrEmpty(hlsPlaylist.DownloadUrl))
    {
        _logger.LogInformation("GetPlaylist: Rebuilding M3U8-native playlist for {WebpageUrlHash}", webpageUrlHash);

        await _hlsPlaylistLock.WaitAsync();
        try
        {
            var hlsPlaylistContent = await Utilities.CurlHelper.GetStringAsync(hlsPlaylist.DownloadUrl);
            var hlsPlaylistLines = hlsPlaylistContent.Split('\n');
            var segmentUrlHashes = new SortedSet<string>();

            var baseUrl = new Uri(hlsPlaylist.DownloadUrl).GetLeftPart(UriPartial.Authority);

            for (int i = 0; i < hlsPlaylistLines.Length; i++)
            {
                var line = hlsPlaylistLines[i].Trim();
                if (string.IsNullOrWhiteSpace(line) || line.StartsWith('#'))
                    continue;

                string segmentAbsoluteUrl = Uri.IsWellFormedUriString(line, UriKind.Absolute)
                    ? line
                    : new Uri(new Uri(baseUrl), line).ToString();

                var segmentHash = Hashing.ComputeSha256Hash(segmentAbsoluteUrl);

                if (!segmentUrlHashes.Contains(segmentHash))
                {
                    segmentUrlHashes.Add(segmentHash);
                    if (!await _dbContext.HlsSegments.AnyAsync(s => s.DownloadUrlHash == segmentHash))
                    {
                        _dbContext.HlsSegments.Add(new HlsSegment
                        {
                            WebpageUrlHash = webpageUrlHash,
                            DownloadUrl = segmentAbsoluteUrl,
                            DownloadUrlHash = segmentHash
                        });
                    }
                }

                // Rewrite line to local segment endpoint
                hlsPlaylistLines[i] = $"playlist/segment-{segmentHash}";
            }

            hlsPlaylistContent = string.Join("\n", hlsPlaylistLines);

            hlsPlaylist.Path = Path.GetTempFileName();
            await System.IO.File.WriteAllTextAsync(hlsPlaylist.Path, hlsPlaylistContent);
            await _dbContext.SaveChangesAsync();

            return PhysicalFile(hlsPlaylist.Path, "application/vnd.apple.mpegurl");
        }
        finally
        {
            _hlsPlaylistLock.Release();
        }
    }

    // Fallback: nothing usable
    _logger.LogWarning("GetPlaylist: No usable playlist for {WebpageUrlHash}", webpageUrlHash);
    return NotFound($"No usable playlist for {webpageUrlHash}.");
}


        [HttpGet("{webpageUrlHash}/playlist/segment-{downloadUrlHash}")]
        public async Task<IActionResult> GetPlaylistSegments(string webpageUrlHash, string downloadUrlHash)
        {
            if (string.IsNullOrWhiteSpace(webpageUrlHash) || string.IsNullOrWhiteSpace(downloadUrlHash))
            {
                _logger.LogWarning("GetPlaylistSegments: Webpage URL hash or download URL hash is null or empty.");
                return BadRequest("Webpage URL hash and download URL hash cannot be null or empty.");
            }

            var hlsSegment = await _dbContext.HlsSegments
                .Where(s => s.WebpageUrlHash == webpageUrlHash && s.DownloadUrlHash == downloadUrlHash)
                .FirstOrDefaultAsync();

            if (hlsSegment == null)
            {
                _logger.LogWarning("GetPlaylistSegments: HLS segment not found for webpageUrlHash={WebpageUrlHash}, downloadUrlHash={DownloadUrlHash}", webpageUrlHash, downloadUrlHash);
                return NotFound($"HLS segment with webpage URL hash '{webpageUrlHash}' and download URL hash '{downloadUrlHash}' not found.");
            }

            if (hlsSegment.Path != null)
            {
                if (System.IO.File.Exists(hlsSegment.Path))
                {
                    _logger.LogInformation("GetPlaylistSegments: Returning cached segment file for {WebpageUrlHash} {DownloadUrlHash}", webpageUrlHash, downloadUrlHash);
                    return PhysicalFile(hlsSegment.Path, "application/octet-stream");
                }
                _logger.LogWarning("GetPlaylistSegments: Segment file missing on disk for {WebpageUrlHash} {DownloadUrlHash}, will re-fetch.", webpageUrlHash, downloadUrlHash);
                hlsSegment.Path = null; // Force re-fetch
                await _dbContext.SaveChangesAsync();
            }

            _logger.LogInformation("GetPlaylistSegments: Acquiring segment lock for {WebpageUrlHash} {DownloadUrlHash}", webpageUrlHash, downloadUrlHash);
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
                    _logger.LogInformation("GetPlaylistSegments: Returning locked cached segment file for {WebpageUrlHash} {DownloadUrlHash}", webpageUrlHash, downloadUrlHash);
                    return PhysicalFile(hlsSegmentPath, "application/octet-stream");
                }
            }

            try
            {
                hlsSegment.Path = Path.GetTempFileName();
                if (string.IsNullOrEmpty(hlsSegment.DownloadUrl))
                {
                    _logger.LogError("GetPlaylistSegments: HLS segment DownloadUrl is null or empty for {WebpageUrlHash} {DownloadUrlHash}", webpageUrlHash, downloadUrlHash);
                    throw new InvalidOperationException("HLS segment DownloadUrl is null or empty.");
                }
                _logger.LogInformation("GetPlaylistSegments: Downloading segment from {DownloadUrl}", hlsSegment.DownloadUrl);
                await Utilities.CurlHelper.DownloadFileAsync(hlsSegment.DownloadUrl, hlsSegment.Path);

                await _dbContext.SaveChangesAsync();
                _logger.LogInformation("GetPlaylistSegments: Saved segment file for {WebpageUrlHash} {DownloadUrlHash}", webpageUrlHash, downloadUrlHash);
            }
            catch (HttpRequestException ex)
            {
                _logger.LogError(ex, "GetPlaylistSegments: Failed to download HLS segment for {WebpageUrlHash} {DownloadUrlHash}", webpageUrlHash, downloadUrlHash);
                return BadRequest($"Failed to download HLS segment: {ex.Message}");
            }
            finally
            {
                _logger.LogInformation("GetPlaylistSegments: Releasing segment lock for {WebpageUrlHash} {DownloadUrlHash}", webpageUrlHash, downloadUrlHash);
                _hlsSegmentLock.Release();
            }

            _logger.LogInformation("GetPlaylistSegments: Returning generated segment file for {WebpageUrlHash} {DownloadUrlHash}", webpageUrlHash, downloadUrlHash);
            return PhysicalFile(hlsSegment.Path, "application/octet-stream");
        }
    }
}