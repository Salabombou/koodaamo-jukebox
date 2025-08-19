using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;

namespace KoodaamoJukebox.Api.Utilities
{
    public static class Ffprobe
    {
        public static async Task<float> GetDuration(string filePath)
        {
            if (string.IsNullOrEmpty(filePath))
            {
                throw new ArgumentException("File path cannot be null or empty.", nameof(filePath));
            }

            try
            {
                var startInfo = new ProcessStartInfo
                {
                    FileName = "ffprobe",
                    Arguments = $"-v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 \"{filePath}\"",
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                };

                using (var process = new Process { StartInfo = startInfo })
                {
                    process.Start();
                    string output = await process.StandardOutput.ReadToEndAsync();
                    string error = await process.StandardError.ReadToEndAsync();

                    if (!string.IsNullOrEmpty(error))
                    {
                        throw new Exception($"ffprobe error: {error}");
                    }

                    if (float.TryParse(output.Trim(), out float duration))
                    {
                        return duration;
                    }
                    else
                    {
                        throw new Exception("Could not parse duration from ffprobe output.");
                    }
                }
            }
            catch (Exception ex)
            {
                throw new Exception("An error occurred while getting the duration from ffprobe.", ex);
            }
        }
    }

    public static class Ffmpeg
    {
        public static async Task<(string playlistPath, string[] segmentFiles)> SegmentAudioToHls(string inputFile, string webpageUrlHash)
        {
            string hlsOutputDir = Path.Combine(Path.GetTempPath(), $"jukebox_hls_{webpageUrlHash}_{Guid.NewGuid()}");
            Directory.CreateDirectory(hlsOutputDir);
            string playlistPath = Path.Combine(hlsOutputDir, "playlist.m3u8");
            string ffmpegArgs = $"-y -i \"{inputFile}\" -c:a aac -f hls -hls_time 10 -hls_segment_filename \"{hlsOutputDir}/segment-%03d.aac\" -progress pipe:1 \"{playlistPath}\"";
            var ffmpegProcess = new Process
            {
                StartInfo = new ProcessStartInfo
                {
                    FileName = "ffmpeg",
                    Arguments = ffmpegArgs,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false,
                    CreateNoWindow = true
                }
            };
            ffmpegProcess.Start();

            long maxBytes = 10 * 1024 * 1024; // 10MB
            var progressMonitor = Task.Run(async () =>
            {
                while (!ffmpegProcess.HasExited)
                {
                    string? line = await ffmpegProcess.StandardOutput.ReadLineAsync();
                    if (line == null) break;
                    if (line.StartsWith("total_size="))
                    {
                        if (long.TryParse(line["total_size=".Length..], out long totalSize))
                        {
                            if (totalSize > maxBytes)
                            {
                                try { ffmpegProcess.Kill(); } catch { }
                                break;
                            }
                        }
                    }
                }
            });

            string ffmpegStderr = await ffmpegProcess.StandardError.ReadToEndAsync();
            await ffmpegProcess.WaitForExitAsync();
            await progressMonitor;
            if (ffmpegProcess.ExitCode != 0)
            {
                throw new Exception($"ffmpeg failed: {ffmpegStderr}");
            }
            var segmentFiles = Directory.GetFiles(hlsOutputDir, "segment-*.aac");
            return (playlistPath, segmentFiles);
        }
    }
}