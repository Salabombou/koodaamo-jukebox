using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Threading.Tasks;

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

                using var process = new Process { StartInfo = startInfo };
                process.Start();
                string output = await process.StandardOutput.ReadToEndAsync();
                string error = await process.StandardError.ReadToEndAsync();

                await process.WaitForExitAsync();

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
            catch (Exception ex)
            {
                throw new Exception("An error occurred while getting the duration from ffprobe.", ex);
            }
        }
    }

    public static class Ffmpeg
    {
        /// <summary>
        /// Segments an audio file or remote URL into HLS segments and a playlist.
        /// </summary>
        /// <param name="inputPathOrUrl">Local file path or HTTPS URL</param>
        /// <param name="webpageUrlHash">Hash used to isolate output folder</param>
        /// <returns>Tuple: (playlist path, segment file paths)</returns>
        public static async Task<(string playlistPath, string[] segmentFiles)> SegmentAudioToHls(
            string inputPathOrUrl,
            string webpageUrlHash,
            Microsoft.Extensions.Logging.ILogger? logger = null,
            string? context = null)
        {
            string hlsOutputDir = Path.Combine(Path.GetTempPath(), $"jukebox_hls_{webpageUrlHash}_{Guid.NewGuid()}");
            Directory.CreateDirectory(hlsOutputDir);

            string playlistPath = Path.Combine(hlsOutputDir, "playlist.m3u8");
            string segmentPattern = Path.Combine(hlsOutputDir, "segment-%03d.ts");

            string ffmpegArgs =
                $"-y -i \"{inputPathOrUrl}\" -c:a aac -b:a 128k -f hls " +
                $"-hls_time 10 -hls_list_size 0 " +
                $"-hls_segment_filename \"{segmentPattern}\" \"{playlistPath}\"";

            logger?.LogInformation("Ffmpeg: Running ffmpeg command: ffmpeg {Args} (context={Context})", ffmpegArgs, context);
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

            string ffmpegStdout = await ffmpegProcess.StandardOutput.ReadToEndAsync();
            string ffmpegStderr = await ffmpegProcess.StandardError.ReadToEndAsync();

            await ffmpegProcess.WaitForExitAsync();

            logger?.LogInformation("Ffmpeg: ffmpeg finished with exit code {ExitCode} (context={Context})", ffmpegProcess.ExitCode, context);
            if (!string.IsNullOrWhiteSpace(ffmpegStdout))
                logger?.LogInformation("Ffmpeg: ffmpeg stdout: {StdOut} (context={Context})", ffmpegStdout, context);
            if (!string.IsNullOrWhiteSpace(ffmpegStderr))
                logger?.LogWarning("Ffmpeg: ffmpeg stderr: {StdErr} (context={Context})", ffmpegStderr, context);

            if (ffmpegProcess.ExitCode != 0 || !File.Exists(playlistPath))
            {
                logger?.LogError("Ffmpeg: ffmpeg failed with exit code {ExitCode} (context={Context})", ffmpegProcess.ExitCode, context);
                throw new Exception($"ffmpeg failed: {ffmpegStderr}");
            }

            var segmentFiles = Directory.GetFiles(hlsOutputDir, "segment-*.ts");
            return (playlistPath, segmentFiles);
        }
    }
}
