using System.Diagnostics;
using System.Text.Json;
using KoodaamoJukebox.Database.Models;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Configuration;

namespace KoodaamoJukebox.Api.Utilities
{
    public class YtDlp
    {
        private readonly string _ytDlpPath;
        private readonly string _youtubeV3ApiKey;

        public YtDlp(IConfiguration configuration)
        {
            _ytDlpPath = configuration["YtDlp:Path"] ?? "yt-dlp";
            _youtubeV3ApiKey = configuration["YouTube:ApiKey"] ?? throw new InvalidOperationException("YouTube:ApiKey is not set in configuration");
        }

        public async Task<YtDlpAudioStream> GetAudioStream(string webpageUrl)
        {
            if (!Uri.IsWellFormedUriString(webpageUrl, UriKind.Absolute))
            {
                throw new ArgumentException("Invalid URL format.", nameof(webpageUrl));
            }

            // Use a temp file for yt-dlp session info to speed up frequent requests
            

            var startInfo = new ProcessStartInfo
            {
                FileName = _ytDlpPath,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };

            // Build arguments
            startInfo.ArgumentList.Add("--dump-json");
            startInfo.ArgumentList.Add(webpageUrl);
            startInfo.ArgumentList.Add("--no-warnings");
            startInfo.ArgumentList.Add("-f");
            startInfo.ArgumentList.Add("bestaudio[protocol=m3u8_native]/bestaudio[protocol=https]");
            startInfo.ArgumentList.Add("--no-playlist");
            startInfo.ArgumentList.Add("--skip-download");

            string tempSessionFile = Path.Combine(Path.GetTempPath(), "yt-dlp-cookies.txt");
            startInfo.ArgumentList.Add("--cookies");
            startInfo.ArgumentList.Add(tempSessionFile);

            var process = new Process { StartInfo = startInfo };
            process.Start();
            var outputTask = process.StandardOutput.ReadToEndAsync();
            var errorTask = process.StandardError.ReadToEndAsync();
            await process.WaitForExitAsync();
            var output = await outputTask;
            var error = await errorTask;

            if (process.ExitCode != 0 || string.IsNullOrWhiteSpace(output))
            {
                throw new InvalidOperationException($"Failed to fetch audio info for: {webpageUrl}. Exit code: {process.ExitCode}. yt-dlp error: {error}");
            }

            var data = JsonSerializer.Deserialize<JsonElement>(output);

            if (data.TryGetProperty("is_live", out var isLive) && isLive.GetBoolean())
            {
                throw new InvalidOperationException($"Cannot fetch audio stream for live content: {webpageUrl}");
            }

            string? protocol = data.GetProperty("protocol").GetString();
            if (protocol == "m3u8_native" || protocol == "https")
            {
                string? audioUrl = data.GetProperty("url").GetString();
                if (!string.IsNullOrWhiteSpace(audioUrl))
                {
                    return new YtDlpAudioStream
                    {
                        Url = audioUrl,
                        Type = protocol == "m3u8_native" ? YtDlpAudioStreamType.M3U8Native : YtDlpAudioStreamType.HTTPS,
                    };
                }
            }

            throw new InvalidOperationException($"No suitable audio format found for: {webpageUrl}");
        }

        private async Task<Track[]> GetYoutubePlaylist(string url)
        {
            var id = Regex.Match(url, @"list=([a-zA-Z0-9_-]+)").Groups[1].Value;
            if (string.IsNullOrWhiteSpace(id))
            {
                throw new ArgumentException("Invalid YouTube playlist URL.");
            }

            using var client = new HttpClient();
            string? nextPageToken = null;
            var tracks = new List<Track>();

            do
            {
                var apiUrl = $"https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId={id}&maxResults=50&key={_youtubeV3ApiKey}";
                if (!string.IsNullOrWhiteSpace(nextPageToken))
                {
                    apiUrl += $"&pageToken={nextPageToken}";
                }

                var response = await client.GetAsync(apiUrl);
                response.EnsureSuccessStatusCode();
                var json = await response.Content.ReadAsStringAsync();
                var data = JsonSerializer.Deserialize<JsonElement>(json);

                if (data.TryGetProperty("items", out var items) && items.ValueKind == JsonValueKind.Array)
                {
                    foreach (var item in items.EnumerateArray())
                    {
                        if (item.TryGetProperty("snippet", out var snippet))
                        {
                            string? videoId = snippet.GetProperty("resourceId").GetProperty("videoId").GetString();
                            string? title = snippet.GetProperty("title").GetString();

                            if (title == "[Deleted video]" || title == "[Private video]")
                            {
                                // Skip deleted or private videos
                                continue;
                            }
                            if (string.IsNullOrWhiteSpace(videoId) || string.IsNullOrWhiteSpace(title))
                            {
                                // Skip if essential properties are missing
                                continue;
                            }

                            string uploader = snippet.TryGetProperty("videoOwnerChannelTitle", out var uploaderElement) ? (uploaderElement.GetString() ?? "Unknown") : "Unknown";

                            string? thumbnailLow = null;
                            string? thumbnailHigh = null;

                            var thumbnails = snippet.GetProperty("thumbnails");

                            if (thumbnails.TryGetProperty("default", out var defaultThumbnailLow))
                            {
                                thumbnailLow = defaultThumbnailLow.GetProperty("url").GetString();
                            }
                            else
                            {
                                continue;
                            }

                            if (thumbnails.TryGetProperty("maxres", out var maxresThumbnail))
                            {
                                thumbnailHigh = maxresThumbnail.GetProperty("url").GetString();
                            }
                            else if (thumbnails.TryGetProperty("standard", out var standardThumbnail))
                            {
                                thumbnailHigh = standardThumbnail.GetProperty("url").GetString();
                            }
                            else if (thumbnails.TryGetProperty("high", out var highThumbnail))
                            {
                                thumbnailHigh = highThumbnail.GetProperty("url").GetString();
                            }
                            else if (thumbnails.TryGetProperty("medium", out var mediumThumbnail))
                            {
                                thumbnailHigh = mediumThumbnail.GetProperty("url").GetString();
                            }
                            else
                            {
                                thumbnailHigh = thumbnailLow; // Fallback to low quality if no high quality thumbnail is available
                            }

                            if (!string.IsNullOrWhiteSpace(videoId) && !string.IsNullOrWhiteSpace(title))
                            {
                                var webpageUrl = $"https://www.youtube.com/watch?v={videoId}";
                                tracks.Add(new Track
                                {
                                    Type = TrackType.YouTube,
                                    WebpageUrlHash = Hashing.ComputeSha256Hash(webpageUrl),
                                    WebpageUrl = webpageUrl,
                                    Title = title,
                                    Uploader = uploader,
                                    ThumbnailLow = thumbnailLow,
                                    ThumbnailHigh = thumbnailHigh
                                });
                            }
                        }
                    }
                }

                nextPageToken = data.TryGetProperty("nextPageToken", out var token) ? token.GetString() : null;
            } while (!string.IsNullOrWhiteSpace(nextPageToken));

            if (tracks.Count == 0)
            {
                throw new InvalidOperationException("No tracks found in the YouTube playlist.");
            }

            return [.. tracks];
        }

        private async Task<Track> GetYoutubeVideoById(string videoId)
        {
            if (string.IsNullOrWhiteSpace(videoId))
                throw new ArgumentException("Invalid YouTube video ID.");

            using var client = new HttpClient();
            var apiUrl = $"https://www.googleapis.com/youtube/v3/videos?part=snippet&id={videoId}&key={_youtubeV3ApiKey}";
            var response = await client.GetAsync(apiUrl);
            response.EnsureSuccessStatusCode();
            var json = await response.Content.ReadAsStringAsync();
            var data = JsonSerializer.Deserialize<JsonElement>(json);

            if (data.TryGetProperty("items", out var items) && items.ValueKind == JsonValueKind.Array && items.GetArrayLength() > 0)
            {
                var item = items[0];
                var snippet = item.GetProperty("snippet");
                string? title = snippet.GetProperty("title").GetString();
                if (string.IsNullOrWhiteSpace(title))
                {
                    throw new InvalidOperationException($"No title found for videoId: {videoId}");
                }
                string? uploader = snippet.TryGetProperty("channelTitle", out var uploaderElement) ? (uploaderElement.GetString() ?? "Unknown") : "Unknown";
                string? videoUrl = $"https://www.youtube.com/watch?v={videoId}";

                string? thumbnailLow = null;
                string? thumbnailHigh = null;
                var thumbnails = snippet.GetProperty("thumbnails");
                if (thumbnails.TryGetProperty("default", out var defaultThumbnailLow))
                {
                    thumbnailLow = defaultThumbnailLow.GetProperty("url").GetString();
                }
                if (thumbnails.TryGetProperty("maxres", out var maxresThumbnail))
                {
                    thumbnailHigh = maxresThumbnail.GetProperty("url").GetString();
                }
                else if (thumbnails.TryGetProperty("standard", out var standardThumbnail))
                {
                    thumbnailHigh = standardThumbnail.GetProperty("url").GetString();
                }
                else if (thumbnails.TryGetProperty("high", out var highThumbnail))
                {
                    thumbnailHigh = highThumbnail.GetProperty("url").GetString();
                }
                else if (thumbnails.TryGetProperty("medium", out var mediumThumbnail))
                {
                    thumbnailHigh = mediumThumbnail.GetProperty("url").GetString();
                }
                else
                {
                    thumbnailHigh = thumbnailLow;
                }

                return new Track
                {
                    Type = TrackType.YouTube,
                    WebpageUrlHash = Hashing.ComputeSha256Hash(videoUrl),
                    WebpageUrl = videoUrl,
                    Title = title,
                    Uploader = uploader,
                    ThumbnailLow = thumbnailLow,
                    ThumbnailHigh = thumbnailHigh
                };
            }
            throw new InvalidOperationException($"No video found for videoId: {videoId}");
        }

        public async Task<Track[]> GetTracks(string query)
        {
            // if query is not a valid URL, prepend "ytsearch1:"
            if (!Uri.IsWellFormedUriString(query, UriKind.Absolute))
            {
                query = $"ytsearch1:{query}";
            }
            else if (Uri.TryCreate(query, UriKind.Absolute, out var uri) &&
                uri.Host.EndsWith("youtube.com") &&
                uri.PathAndQuery.Contains("/playlist") && uri.Query.Contains("list=")
            )
            {
                return await GetYoutubePlaylist(query);
            }
            else if (Uri.TryCreate(query, UriKind.Absolute, out var videoUri) &&
                (videoUri.Host.EndsWith("youtube.com") || videoUri.Host.EndsWith("youtu.be")))
            {
                string? videoId = null;
                var match = Regex.Match(query, @"(?:v=|youtu.be/)([a-zA-Z0-9_-]{11})");
                if (match.Success)
                {
                    videoId = match.Groups[1].Value;
                }
                if (!string.IsNullOrWhiteSpace(videoId))
                {
                    var track = await GetYoutubeVideoById(videoId);
                    return [track];
                }
            }

            var process = new Process
            {
                StartInfo = new ProcessStartInfo
                {
                    FileName = _ytDlpPath,
                    Arguments = $"--dump-json \"{query}\" --flat-playlist --no-warnings",
                    RedirectStandardOutput = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                }
            };

            process.Start();
            var output = await process.StandardOutput.ReadToEndAsync();
            await process.WaitForExitAsync();

            if (process.ExitCode != 0 || string.IsNullOrWhiteSpace(output))
            {
                throw new InvalidOperationException($"Failed to fetch tracks for query: {query}. Exit code: {process.ExitCode}");
            }

            var tracks = new List<Track>();
            foreach (var line in output.Split(Environment.NewLine, StringSplitOptions.RemoveEmptyEntries))
            {
                try
                {
                    var data = JsonSerializer.Deserialize<JsonElement>(line);

                    string? extractor = data.GetProperty("extractor").GetString();
                    if (string.IsNullOrWhiteSpace(extractor) || extractor == "generic")
                    {
                        throw new ArgumentException($"Direct download is not supported.");
                    }

                    string? webpageUrl = data.GetProperty("webpage_url").GetString();
                    string? title = data.GetProperty("title").GetString();

                    if (string.IsNullOrWhiteSpace(extractor) || string.IsNullOrWhiteSpace(webpageUrl) || string.IsNullOrWhiteSpace(title))
                    {
                        // Skip if essential properties are missing
                        continue;
                    }

                    // Only add if yt-dlp directly supports it (has a supported extractor)
                    var trackType = extractor switch
                    {
                        "youtube" => TrackType.YouTube,
                        _ => TrackType.Unknown
                    };

                    if (trackType == TrackType.YouTube)
                    {
                        if (title == "[Deleted video]" || title == "[Private video]")
                        {
                            // Skip deleted videos
                            continue;
                        }
                    }

                    string? uploader = data.TryGetProperty("uploader", out var uploaderElement) ? (uploaderElement.GetString() ?? "Unknown") : "Unknown";

                    string? thumbnailHigh = null;
                    string? thumbnailLow = null;
                    if (data.TryGetProperty("thumbnails", out var thumbnails) && thumbnails.ValueKind == JsonValueKind.Array && thumbnails.GetArrayLength() > 0)
                    {
                        JsonElement? largest = null;
                        JsonElement? smallest = null;
                        int largestArea = -1;
                        int smallestArea = int.MaxValue;

                        foreach (var thumb in thumbnails.EnumerateArray())
                        {
                            int width = thumb.TryGetProperty("width", out var w) ? w.GetInt32() : 0;
                            int height = thumb.TryGetProperty("height", out var h) ? h.GetInt32() : 0;
                            int area = width * height;

                            if (area > largestArea)
                            {
                                largestArea = area;
                                largest = thumb;
                            }
                            if (area < smallestArea)
                            {
                                smallestArea = area;
                                smallest = thumb;
                            }
                        }

                        thumbnailHigh = largest?.GetProperty("url").GetString();
                        thumbnailLow = smallest?.GetProperty("url").GetString();
                    }

                    string urlHash = Hashing.ComputeSha256Hash(webpageUrl);

                    var track = new Track
                    {
                        Type = trackType,
                        WebpageUrlHash = urlHash,
                        WebpageUrl = webpageUrl,
                        Title = title,
                        Uploader = uploader,
                        ThumbnailHigh = thumbnailHigh,
                        ThumbnailLow = thumbnailLow
                    };

                    tracks.Add(track);
                }
                catch (JsonException ex)
                {
                    throw new InvalidOperationException($"Failed to parse track JSON: {line}", ex);
                }
            }

            return [.. tracks];
        }
    }

    public enum YtDlpAudioStreamType
    {
        M3U8Native,
        HTTPS
    }
    public class YtDlpAudioStream
    {
        public required string Url { get; set; }
        public YtDlpAudioStreamType Type { get; set; }
    }
}