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
        private readonly SemaphoreSlim _playlistFetchLock = new SemaphoreSlim(1);
        private readonly SemaphoreSlim _segmentFetchLock = new SemaphoreSlim(1);

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

        [HttpGet("{videoId}/playlist.m3u8")]
        public async Task<ActionResult> GetTrackPlaylist(string videoId)
        {

            var trackExists = await _dbContext.Tracks.AnyAsync(t => t.TrackId == videoId);
            if (!trackExists)
            {
                return NotFound();
            }

            await _playlistFetchLock.WaitAsync();
            try
            {
                var playlist = await _dbContext.Playlists.FirstOrDefaultAsync(p => p.TrackId == videoId);

                if (playlist == null)
                {
                    var url = await YtDlp.GetPlaylistUrl(videoId);

                    playlist = new Playlist
                    {
                        TrackId = videoId,
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
                    return await GetTrackPlaylist(videoId);
                }

                if (playlist.Path == null)
                {
                    var playlistStr = await _httpClient.GetStringAsync(playlist.Url);

                    var playlistStrLines = playlistStr.Split('\n');

                    var segmentUrlHashes = new SortedSet<string>();

                    for (int i = 0; i < playlistStrLines.Length; i++)
                    {
                        if (playlistStrLines[i].StartsWith("http"))
                        {
                            var segmentUrl = playlistStrLines[i].Trim();

                            var hashBytes = System.Security.Cryptography.SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(segmentUrl));
                            var hashString = BitConverter.ToString(hashBytes).Replace("-", "").ToLowerInvariant();

                            var segment = new Segment
                            {
                                TrackId = videoId,
                                Url = segmentUrl,
                                UrlHash = hashString
                            };

                            if (playlist.IsLive && !await _dbContext.Segments.AnyAsync(s => s.UrlHash == hashString))
                            {
                                await _dbContext.Segments.AddAsync(segment);
                                await _dbContext.SaveChangesAsync();
                            }

                            playlistStrLines[i] = $"segment-{segment.UrlHash}.ts";
                            segmentUrlHashes.Add(segment.UrlHash);
                        }
                    }

                    var playlistData = string.Join('\n', playlistStrLines);

                    if (playlist.IsLive)
                    {
                        var oldSegments = await _dbContext.Segments.Where(s => !segmentUrlHashes.Contains(s.UrlHash) && s.TrackId == videoId).ToListAsync();
                        _dbContext.Segments.RemoveRange(oldSegments);
                        await _dbContext.SaveChangesAsync();
                        _logger.LogInformation("Removed {Count} old segments for video ID: {TrackId}", oldSegments.Count, videoId);

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
                _logger.LogError(e, "Failed to fetch playlist for video ID: {TrackId}", videoId);
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
            var segmentExists = await _dbContext.Segments.AnyAsync(s => s.UrlHash == urlHash && s.TrackId == videoId);
            if (!segmentExists)
            {
                return NotFound();
            }

            await _segmentFetchLock.WaitAsync();
            try
            {
                var segment = await _dbContext.Segments.FirstOrDefaultAsync(s => s.UrlHash == urlHash && s.TrackId == videoId);

                if (segment == null)
                {
                    return NotFound();
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