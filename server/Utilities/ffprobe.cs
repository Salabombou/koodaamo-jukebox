using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;

namespace KoodaamoJukebox.Utilities
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
}