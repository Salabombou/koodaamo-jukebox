using System.Diagnostics;
using System.Text.Json;
using KoodaamoJukebox.Models;

namespace KoodaamoJukebox.Utilities
{
    public static class YtDlp
    {
        private static readonly string _ytDlpPath = Environment.GetEnvironmentVariable("YT_DLP_PATH") ?? "yt-dlp";

        public static async Task<string> GetPlaylistUrl(string query)
        {
            var process = new Process
            {
                StartInfo = new ProcessStartInfo
                {
                    FileName = _ytDlpPath,
                    Arguments = $"--get-url \"ytsearch1:{query}\" -f 234/233 --no-warnings",
                    RedirectStandardOutput = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                }
            };

            process.Start();
            var url = await process.StandardOutput.ReadToEndAsync();
            await process.WaitForExitAsync();

            if (process.ExitCode != 0 || string.IsNullOrWhiteSpace(url))
            {
                throw new InvalidOperationException($"Failed to fetch playlist URL for query: {query}. Exit code: {process.ExitCode}");
            }

            return url;
        }

        public static async Task<Track[]> GetTracks(string query)
        {
            // if query is not a valid URL, prepend "ytsearch1:"
            if (!Uri.IsWellFormedUriString(query, UriKind.Absolute))
            {
                query = $"ytsearch1:{query}";
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

                    var thumbnails = data.GetProperty("thumbnails");
                    var albumArt = thumbnails.ValueKind == JsonValueKind.Array && thumbnails.GetArrayLength() > 0
                        ? thumbnails[thumbnails.GetArrayLength() - 1].GetProperty("url").GetString()
                        : null;
                    
                    var trackId = data.GetProperty("id").GetString();
                    var title = data.GetProperty("title").GetString();
                    var uploader = data.GetProperty("uploader").GetString();

                    if (string.IsNullOrEmpty(trackId) || string.IsNullOrEmpty(title) || string.IsNullOrEmpty(uploader))
                    {
                        continue;
                    }

                    var track = new Track
                    {
                        TrackId = data.GetProperty("id").GetString() ?? throw new InvalidOperationException("Track ID is missing"),
                        Title = data.GetProperty("title").GetString() ?? throw new InvalidOperationException("Track title is missing"),
                        Uploader = data.GetProperty("uploader").GetString() ?? throw new InvalidOperationException("Track uploader is missing"),
                        AlbumArt = albumArt
                    };

                    tracks.Add(track);
                }
                catch (JsonException ex)
                {
                    throw new InvalidOperationException($"Failed to parse track JSON: {line}", ex);
                }
            }

            return tracks.ToArray();
        }
    }
}