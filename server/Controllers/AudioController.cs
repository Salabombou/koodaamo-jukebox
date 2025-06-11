using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using KoodaamoJukebox.Models;
using System.Diagnostics;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Authorization;
using KoodaamoJukebox.Utilities;
using System.Security.Cryptography;
using System.Text;

namespace KoodaamoJukebox.Controllers
{
    [ApiController]
    [Authorize]
    [Route("api/[controller]")]
    public class AudioController : ControllerBase
    {
        private readonly AppDbContext _dbContext;
        private readonly ILogger<AudioController> _logger;
        private readonly HttpClient _httpClient = new HttpClient();
        private readonly SemaphoreSlim _hlsPlaylistLock = new SemaphoreSlim(1, 1);
        private readonly SemaphoreSlim _hlsSegmentLock = new SemaphoreSlim(1, 1);
        private readonly SemaphoreSlim _audioFileLock = new SemaphoreSlim(1, 1);

        public AudioController(AppDbContext dbContext, ILogger<AudioController> logger)
        {
            _dbContext = dbContext;
            _logger = logger;

            _httpClient.Timeout = TimeSpan.FromSeconds(30);

        }

        [HttpGet("{webpageUrlHash}")]
        public async Task<IActionResult> GetAudioTrack(string webpageUrlHash)
        {
            if (string.IsNullOrWhiteSpace(webpageUrlHash))
            {
                return BadRequest("Webpage URL hash cannot be null or empty.");
            }

            var track = await _dbContext.Tracks
                .AsNoTracking()
                .FirstOrDefaultAsync(t => t.WebpageUrlHash == webpageUrlHash);

            if (track == null)
            {
                return NotFound($"Track with hash '{webpageUrlHash}' not found.");
            }

            var hlsPlaylist = await _dbContext.HlsPlaylists
                .AsNoTracking()
                .FirstOrDefaultAsync(p => p.WebpageUrlHash == track.WebpageUrlHash);
            if (hlsPlaylist != null && hlsPlaylist.ExpiresAt <= DateTimeOffset.UtcNow.ToUnixTimeMilliseconds())
            {
                _dbContext.HlsPlaylists.Remove(hlsPlaylist);
                await _dbContext.SaveChangesAsync();
                hlsPlaylist = null; // Force re-fetch
            }

            if (hlsPlaylist != null)
            {
                return RedirectToAction(nameof(GetPlaylist), new { webpageUrlHash = track.WebpageUrlHash });
            }

            var audioStream = await YtDlp.GetAudioStream(track.WebpageUrl);
            if (audioStream.Type == YtDlpAudioStreamType.M3U8Native)
            {
                var newHlsPlaylist = new HlsPlaylist
                {
                    WebpageUrlHash = webpageUrlHash,
                    DownloadUrl = audioStream.Url,
                    ExpiresAt = DateTimeOffset.UtcNow.AddHours(1).ToUnixTimeMilliseconds()
                };

                _dbContext.HlsPlaylists.Add(newHlsPlaylist);
                await _dbContext.SaveChangesAsync();
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
                using (var response = await _httpClient.GetAsync(audioStream.Url, HttpCompletionOption.ResponseHeadersRead))
                {
                    response.EnsureSuccessStatusCode();
                    using var responseStream = await response.Content.ReadAsStreamAsync();
                    using var fileStream = new FileStream(newHlsSegment.Path, FileMode.Create, FileAccess.Write, FileShare.None);
                    await responseStream.CopyToAsync(fileStream);
                }

                float duration = await Ffprobe.GetDuration(newHlsSegment.Path);
                
                var newHlsPlaylist = new HlsPlaylist
                {
                    WebpageUrlHash = webpageUrlHash,
                    DownloadUrl = audioStream.Url,
                    ExpiresAt = DateTimeOffset.UtcNow.AddHours(1).ToUnixTimeMilliseconds()
                };

                _dbContext.HlsSegments.Add(newHlsSegment);

                newHlsPlaylist.Path = Path.GetTempFileName();

                var hlsPlaylistLines = new[]
                {
                    "#EXTM3U",
                    "#EXT-X-VERSION:3",
                    $"#EXT-X-TARGETDURATION:{duration}",
                    "#EXT-X-MEDIA-SEQUENCE:0",
                    $"#EXTINF:{duration},",
                    $"{webpageUrlHash}/playlist/segment-{audioDownloadUrlHash}",
                    "#EXT-X-ENDLIST"
                };
                string hlsPlaylistContent = string.Join("\n", hlsPlaylistLines);
                await System.IO.File.WriteAllTextAsync(newHlsPlaylist.Path, hlsPlaylistContent);
                _dbContext.HlsPlaylists.Add(newHlsPlaylist);
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
                return PhysicalFile(hlsPlaylist.Path, "application/vnd.apple.mpegurl");
            }

            await _hlsPlaylistLock.WaitAsync();
            var hlsPlaylistPath = await _dbContext.HlsPlaylists
                .AsNoTracking()
                .Where(p => p.WebpageUrlHash == webpageUrlHash)
                .Select(p => p.Path)
                .FirstOrDefaultAsync();
            if (hlsPlaylistPath != null)
            {
                return PhysicalFile(hlsPlaylistPath, "application/vnd.apple.mpegurl");
            }
            
            try
            {
                var hlsPlaylistContent = await _httpClient.GetStringAsync(hlsPlaylist.DownloadUrl);
                var hlsPlaylistLines = hlsPlaylistContent.Split('\n');
                var segmentUrlHashes = new SortedSet<string>();

                var baseUrl = new Uri(hlsPlaylist.DownloadUrl).GetLeftPart(UriPartial.Authority);

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

                    if (Uri.IsWellFormedUriString(line, UriKind.Absolute))
                    {
                        segment.DownloadUrl = line;
                        segment.DownloadUrlHash = Hashing.ComputeSha256Hash(line);
                    }
                    else if (Uri.IsWellFormedUriString(line, UriKind.Relative))
                    {
                        var absoluteUrl = new Uri(new Uri(baseUrl), line).ToString();
                        segment.DownloadUrl = absoluteUrl;
                        segment.DownloadUrlHash = Hashing.ComputeSha256Hash(absoluteUrl);
                    }

                    if (!segmentUrlHashes.Contains(segment.DownloadUrlHash))
                    {
                        segmentUrlHashes.Add(segment.DownloadUrlHash);
                        if (!await _dbContext.HlsSegments.AnyAsync(s => s.DownloadUrlHash == segment.DownloadUrlHash))
                        {
                            _dbContext.HlsSegments.Add(segment);
                        }
                    }
                    hlsPlaylistLines[i] = $"{webpageUrlHash}/playlist/segment-{segment.DownloadUrlHash}";
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
                return PhysicalFile(hlsSegment.Path, "application/octet-stream");
            }

            await _hlsSegmentLock.WaitAsync();
            var hlsSegmentPath = await _dbContext.HlsSegments
                .AsNoTracking()
                .Where(s => s.WebpageUrlHash == webpageUrlHash && s.DownloadUrlHash == downloadUrlHash)
                .Select(s => s.Path)
                .FirstOrDefaultAsync();
            if (hlsSegmentPath != null)
            {
                return PhysicalFile(hlsSegmentPath, "application/octet-stream");
            }

            try
            {
                hlsSegment.Path = Path.GetTempFileName();
                using (var response = await _httpClient.GetAsync(hlsSegment.DownloadUrl, HttpCompletionOption.ResponseHeadersRead))
                {
                    response.EnsureSuccessStatusCode();
                    using var responseStream = await response.Content.ReadAsStreamAsync();
                    using var fileStream = new FileStream(hlsSegment.Path, FileMode.Create, FileAccess.Write, FileShare.None);
                    await responseStream.CopyToAsync(fileStream);
                }

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