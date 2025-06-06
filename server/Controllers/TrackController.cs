using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using KoodaamoJukebox.Models;
using System.Diagnostics;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Authorization;
using KoodaamoJukebox.Utilities;

namespace KoodaamoJukebox.Controllers
{
    [ApiController]
    [Authorize]
    [Route("api/[controller]")]
    [ResponseCache(Duration = 60, Location = ResponseCacheLocation.Any, NoStore = false)]
    public class TrackController : ControllerBase
    {
        private readonly AppDbContext _dbContext;
        private readonly ILogger<TrackController> _logger;
        private readonly HttpClient _httpClient = new HttpClient();
        private readonly SemaphoreSlim _playlistFetchLock = new SemaphoreSlim(1, 1);
        private readonly SemaphoreSlim _segmentFetchLock = new SemaphoreSlim(1, 1);

        public TrackController(AppDbContext dbContext, ILogger<TrackController> logger)
        {
            _dbContext = dbContext;
            _logger = logger;
        }

        private long ParsePlaylistUrlExpiry(string url)
        {
            var regex = new Regex(@"expire/(\d+)");
            var match = regex.Match(url);

            if (match.Success && long.TryParse(match.Groups[1].Value, out var expiryUnix))
            {
                return expiryUnix * 1000; // Convert to milliseconds
            }

            _logger.LogError("Failed to parse expiry from URL: {Url}", url);

            throw new ArgumentException("Invalid URL format", nameof(url));
        }

        private bool ParseIsPlaylistLive(string url)
        {
            return url.Contains("/yt_live_broadcast/");
        }


        [HttpPost]
        public async Task<ActionResult<TrackDto[]>> GetTracks([FromBody] TracksRequestDto dto)
        {
            if (dto == null || dto.TrackIds == null || dto.TrackIds.Count == 0)
            {
                return BadRequest("TrackIds cannot be null or empty.");
            }

            var tracks = await _dbContext.Tracks
                .Where(t => dto.TrackIds.Contains(t.TrackId))
                .ToListAsync();

            if (tracks.Count == 0)
            {
                return NotFound("No tracks found for the provided TrackIds.");
            }

            var trackDtos = tracks.Select(t => new TrackDto(t)).ToArray();
            return Ok(trackDtos);
        }


        [HttpGet("{trackId}")]
        public async Task<ActionResult<TrackDto>> GetTrack(string trackId)
        {
            var track = await _dbContext.Tracks.FirstOrDefaultAsync(t => t.TrackId == trackId);

            if (track == null)
            {
                return NotFound();
            }

            return Ok(new TrackDto(track));
        }

        [HttpGet("{trackId}/thumbnail.jpg")]
        [AllowAnonymous]
        public async Task<ActionResult> GetTrackThumbnail(string trackId)
        {
            var track = await _dbContext.Tracks.FirstOrDefaultAsync(t => t.TrackId == trackId);

            if (track == null || string.IsNullOrEmpty(track.AlbumArt))
            {
                return NotFound();
            }

            return Redirect(track.AlbumArt);
        }

        [HttpGet("{trackId}/playlist.m3u8")]
        public async Task<ActionResult> GetTrackPlaylist(string trackId)
        {

            var trackExists = await _dbContext.Tracks.AnyAsync(t => t.TrackId == trackId);
            if (!trackExists)
            {
                return NotFound();
            }

            await _playlistFetchLock.WaitAsync();
            try
            {
                var playlist = await _dbContext.Playlists.FirstOrDefaultAsync(p => p.TrackId == trackId);

                if (playlist == null)
                {
                    // Remove any existing playlist for this TrackId to avoid unique constraint violation
                    var existingPlaylist = await _dbContext.Playlists.FirstOrDefaultAsync(p => p.TrackId == trackId);
                    if (existingPlaylist != null)
                    {
                        _dbContext.Playlists.Remove(existingPlaylist);
                        await _dbContext.SaveChangesAsync();
                    }
                    var url = await YtDlp.GetPlaylistUrl(trackId);
                    playlist = new Playlist
                    {
                        TrackId = trackId,
                        Url = url,
                        ExpiresAt = ParsePlaylistUrlExpiry(url),
                        IsLive = ParseIsPlaylistLive(url)
                    };
                    await _dbContext.Playlists.AddAsync(playlist);
                    await _dbContext.SaveChangesAsync();
                }

                if (playlist.ExpiresAt <= DateTimeOffset.UtcNow.ToUnixTimeMilliseconds())
                {
                    _dbContext.Playlists.Remove(playlist);

                    await _dbContext.SaveChangesAsync();
                    return await GetTrackPlaylist(trackId);
                }

                if (playlist.Path == null)
                {
                    var playlistStr = await _httpClient.GetStringAsync(playlist.Url);
                    var playlistStrLines = playlistStr.Split('\n');
                    var segmentUrlHashes = new SortedSet<string>();
                    var createdSegments = new List<string>();
                    for (int i = 0; i < playlistStrLines.Length; i++)
                    {
                        if (playlistStrLines[i].StartsWith("http"))
                        {
                            var segmentUrl = playlistStrLines[i].Trim();
                            var hashBytes = System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(segmentUrl));
                            var hashString = BitConverter.ToString(hashBytes).Replace("-", "").ToLowerInvariant();
                            // Check if segment with this UrlHash already exists
                            var exists = await _dbContext.Segments.AnyAsync(s => s.UrlHash == hashString);
                            if (!exists)
                            {
                                var segment = new Segment
                                {
                                    TrackId = trackId,
                                    Url = segmentUrl,
                                    UrlHash = hashString
                                };
                                await _dbContext.Segments.AddAsync(segment);
                                createdSegments.Add($"{hashString} => {segmentUrl}");
                            }
                            playlistStrLines[i] = $"segment-{hashString}.ts";
                            segmentUrlHashes.Add(hashString);
                        }
                    }
                    _logger.LogInformation("Created segments for video {TrackId}: {Segments}", trackId, string.Join(", ", createdSegments));
                    await _dbContext.SaveChangesAsync();
                    var playlistData = string.Join('\n', playlistStrLines);
                    if (playlist.IsLive)
                    {
                        var oldSegments = await _dbContext.Segments.Where(s => !segmentUrlHashes.Contains(s.UrlHash) && s.TrackId == trackId).ToListAsync();
                        _dbContext.Segments.RemoveRange(oldSegments);
                        await _dbContext.SaveChangesAsync();
                        _logger.LogInformation("Removed {Count} old segments for video ID: {TrackId}", oldSegments.Count, trackId);
                        return Content(playlistData, "application/vnd.apple.mpegurl");
                    }
                    playlist.Path = Path.GetTempFileName();
                    await System.IO.File.WriteAllTextAsync(playlist.Path, playlistData);
                    await _dbContext.SaveChangesAsync();
                }

                return PhysicalFile(playlist.Path, "application/vnd.apple.mpegurl");
            }
            catch (Exception e)
            {
                _logger.LogError(e, "Failed to fetch playlist for video ID: {TrackId}", trackId);
                return StatusCode(500);
            }
            finally
            {
                _playlistFetchLock.Release();
            }
        }

        [HttpGet("{videoId}/segment-{urlHash}.ts")]
        public async Task<ActionResult> GetTrackSegment(string videoId, string urlHash)
        {
            _logger.LogInformation("Segment request: videoId={VideoId}, urlHash={UrlHash}", videoId, urlHash);
            var segmentExists = await _dbContext.Segments.AnyAsync(s => s.UrlHash == urlHash && s.TrackId == videoId);
            if (!segmentExists)
            {
                var allHashes = await _dbContext.Segments.Where(s => s.TrackId == videoId).Select(s => s.UrlHash).ToListAsync();
                _logger.LogWarning("Segment not found for videoId={VideoId}, urlHash={UrlHash}. Existing hashes: {Hashes}", videoId, urlHash, string.Join(", ", allHashes));
                return NotFound("Segment not found.");
            }

            await _segmentFetchLock.WaitAsync();
            try
            {
                var segment = await _dbContext.Segments.FirstOrDefaultAsync(s => s.UrlHash == urlHash && s.TrackId == videoId);

                if (segment == null)
                {
                    return NotFound("Segment not found..");
                }

                if (segment.Path == null)
                {
                    var segmentPath = Path.GetTempFileName();
                    using (var response = await _httpClient.GetAsync(segment.Url, HttpCompletionOption.ResponseHeadersRead))
                    {
                        response.EnsureSuccessStatusCode();
                        using var responseStream = await response.Content.ReadAsStreamAsync();
                        using var fileStream = new FileStream(segmentPath, FileMode.Create, FileAccess.Write, FileShare.None);
                        await responseStream.CopyToAsync(fileStream);
                    }

                    segment.Path = segmentPath;
                    await _dbContext.SaveChangesAsync();
                }

                if (!System.IO.File.Exists(segment.Path))
                {
                    _logger.LogWarning("Segment file not found: {Path}", segment.Path);
                    _dbContext.Segments.Remove(segment);
                    await _dbContext.SaveChangesAsync();
                    return NotFound();
                }
                if (new FileInfo(segment.Path).Length == 0)
                {
                    _logger.LogWarning("Segment file is empty: {Path}", segment.Path);
                    _dbContext.Segments.Remove(segment);
                    await _dbContext.SaveChangesAsync();
                    return NotFound();
                }

                return PhysicalFile(segment.Path, "video/mp2t");
            }
            catch (Exception e)
            {
                _logger.LogError(e, "Failed to fetch segment {UrlHash} for video ID: {TrackId}", urlHash, videoId);
                return StatusCode(500);
            }
            finally
            {
                _segmentFetchLock.Release();
            }
        }
    }

    public class TracksRequestDto
    {
        public HashSet<string> TrackIds { get; set; } = null!;
    }
}