using System.Diagnostics;
using System.Text.Json;
using KoodaamoJukebox.Models;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;

namespace KoodaamoJukebox.Utilities
{
    public static class YtDlp
    {
        private static readonly string _ytDlpPath = Environment.GetEnvironmentVariable("YT_DLP_PATH") ?? "yt-dlp";
        private static readonly string _youtubeV3ApiKey = Environment.GetEnvironmentVariable("YOUTUBE_V3_API_KEY") ?? throw new InvalidOperationException("YOUTUBE_V3_API_KEY is not set");

        public static async Task<YtDlpAudioStream> GetAudioStream(string webpageUrl)
        {
            var process = new Process
            {
                StartInfo = new ProcessStartInfo
                {
                    FileName = _ytDlpPath,
                    Arguments = $"--dump-json \"{webpageUrl}\" --no-warnings -f bestaudio[protocol=m3u8_native]/bestaudio[protocol=https] --no-playlist --skip-download",
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
                throw new InvalidOperationException($"Failed to fetch audio info for: {webpageUrl}. Exit code: {process.ExitCode}");
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

        private static async Task<Track[]> GetYoutubePlaylist(string url)
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

        public static async Task<Track[]> GetTracks(string query)
        {
            // if query is not a valid URL, prepend "ytsearch1:"
            if (!Uri.IsWellFormedUriString(query, UriKind.Absolute))
            {
                query = $"ytsearch1:{query}";
            }
            else if (Uri.TryCreate(query, UriKind.Absolute, out var uri) && uri.PathAndQuery.Contains("/playlist") && uri.Query.Contains("list="))
            {
                return await GetYoutubePlaylist(query);
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
                    string? webpageUrl = data.GetProperty("webpage_url").GetString();
                    string? title = data.GetProperty("title").GetString();

                    if (string.IsNullOrWhiteSpace(extractor) || string.IsNullOrWhiteSpace(webpageUrl) || string.IsNullOrWhiteSpace(title))
                    {
                        // Skip if essential properties are missing
                        continue;
                    }

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
                        thumbnailHigh = thumbnails[0].GetProperty("url").GetString();
                        thumbnailLow = thumbnails[thumbnails.GetArrayLength() - 1].GetProperty("url").GetString();
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